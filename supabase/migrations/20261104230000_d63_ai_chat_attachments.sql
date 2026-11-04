-- D63: files sent to Trợ lý AI are kept, so the chat shows the picture again after a reload (changes D50(b), which kept only
-- the names). Each person's files sit under their own folder of the private "ai-attachments" bucket; only they read them,
-- nobody replaces or deletes them through the API. The kept question lists its files in ai_chat_messages.attachments.
begin;

alter table public.ai_chat_messages add column attachments jsonb not null default '[]'::jsonb;
alter table public.ai_chat_messages add constraint ai_chat_messages_attachments_shape
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);

-- One file entry: {path, name, mime, size}; the path is inside the caller's own folder (<auth uid>/...).
create or replace function private.ai_chat_attachments_ok(items jsonb, owner uuid) returns boolean
language sql immutable set search_path = '' as $$
  select owner is not null and jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 5 and not exists (
    select 1 from jsonb_array_elements(items) item
    where jsonb_typeof(item) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(item) key where key <> all(array['path', 'name', 'mime', 'size']))
      or jsonb_typeof(item->'path') is distinct from 'string' or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'mime') is distinct from 'string' or jsonb_typeof(item->'size') is distinct from 'number'
      or not coalesce((item->>'path') like owner::text || '/%', false) or coalesce(item->>'path', '') like '%..%' or char_length(coalesce(item->>'path', '')) > 400
      or char_length(coalesce(item->>'name', '')) not between 1 and 200
      or coalesce(item->>'mime', '') <> all(array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
      or (item->>'size')::numeric not between 1 and 3500000)
$$;
revoke all on function private.ai_chat_attachments_ok(jsonb, uuid) from public, anon;

-- The question keeps its files; replaying the same operation returns the first answer.
drop function public.save_ai_chat_turn(uuid, text, text, uuid);
create function public.save_ai_chat_turn(target_branch_id uuid, question text, answer text, operation_id uuid, attachments jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r record; answer_id uuid; files jsonb := coalesce(save_ai_chat_turn.attachments, '[]'::jsonb);
begin
  if not private.has_permission(target_branch_id, 'ai.use') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from private.attendance_receipt(save_ai_chat_turn.operation_id, 'save_ai_chat_turn', jsonb_build_array(target_branch_id, question, answer, files));
  if r.replay is not null then return r.replay; end if;
  if char_length(trim(coalesce(question, ''))) not between 1 and 4000 or char_length(trim(coalesce(answer, ''))) not between 1 and 20000 then
    raise exception 'invalid_ai_chat_turn' using errcode = '22023'; end if;
  if not private.ai_chat_attachments_ok(files, auth.uid()) then raise exception 'invalid_ai_chat_attachments' using errcode = '22023'; end if;
  insert into public.ai_chat_messages(branch_id, auth_user_id, role, body, attachments) values (target_branch_id, auth.uid(), 'user', trim(question), files);
  insert into public.ai_chat_messages(branch_id, auth_user_id, role, body) values (target_branch_id, auth.uid(), 'assistant', trim(answer))
    returning id into answer_id;
  insert into public.command_receipts values (save_ai_chat_turn.operation_id, auth.uid(), 'save_ai_chat_turn', r.hash, 'ai_chat_message', answer_id, now());
  return answer_id;
end $$;
revoke all on function public.save_ai_chat_turn(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.save_ai_chat_turn(uuid, text, text, uuid, jsonb) to authenticated;

-- The private bucket and its policies; Storage is absent from the native test runtime, so only where it exists.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $storage$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('ai-attachments', 'ai-attachments', false, 3500000, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain',
        'text/csv', 'text/markdown', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
      on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
    $storage$;
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists d63_ai_attachments_insert on storage.objects';
    execute 'drop policy if exists d63_ai_attachments_select on storage.objects';
    execute $policy$
      create policy d63_ai_attachments_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'ai-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.has_any_permission('ai.use')))
    $policy$;
    execute $policy$
      create policy d63_ai_attachments_select on storage.objects for select to authenticated
      using (bucket_id = 'ai-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
    $policy$;
    -- Kept files are never replaced or removed through the API.
    execute 'drop policy if exists d63_ai_attachments_no_update on storage.objects';
    execute 'drop policy if exists d63_ai_attachments_no_delete on storage.objects';
    execute $policy$
      create policy d63_ai_attachments_no_update on storage.objects as restrictive for update to authenticated
      using (bucket_id <> 'ai-attachments') with check (bucket_id <> 'ai-attachments')
    $policy$;
    execute $policy$
      create policy d63_ai_attachments_no_delete on storage.objects as restrictive for delete to authenticated using (bucket_id <> 'ai-attachments')
    $policy$;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
