-- FB14 (D36): "Tro ly AI" is one chatbot for the whole system (no more per-module scopes). Its conversation is kept per
-- person and branch so the Messenger contact and the floating chat bubble show the same history; "Cuoc tro chuyen moi"
-- archives the turns instead of deleting them. Only the person sees their own history.
begin;

create table public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('user','assistant')),
  body text not null check (char_length(body) between 1 and 20000),
  archived boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index ai_chat_messages_person on public.ai_chat_messages(auth_user_id, branch_id, archived, created_at desc);

alter table public.ai_chat_messages enable row level security;
create policy ai_chat_messages_own on public.ai_chat_messages for select to authenticated using (auth_user_id = auth.uid());
revoke all on public.ai_chat_messages from anon, public, authenticated;
grant select on public.ai_chat_messages to authenticated;

-- One question and its answer, stored together once the assistant has answered.
create or replace function public.save_ai_chat_turn(target_branch_id uuid, question text, answer text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r record; answer_id uuid;
begin
  if not private.has_permission(target_branch_id, 'ai.use') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from private.attendance_receipt(save_ai_chat_turn.operation_id, 'save_ai_chat_turn', jsonb_build_array(target_branch_id, question, answer));
  if r.replay is not null then return r.replay; end if;
  if char_length(trim(coalesce(question, ''))) not between 1 and 4000 or char_length(trim(coalesce(answer, ''))) not between 1 and 20000 then
    raise exception 'invalid_ai_chat_turn' using errcode = '22023'; end if;
  insert into public.ai_chat_messages(branch_id, auth_user_id, role, body) values (target_branch_id, auth.uid(), 'user', trim(question));
  insert into public.ai_chat_messages(branch_id, auth_user_id, role, body) values (target_branch_id, auth.uid(), 'assistant', trim(answer))
    returning id into answer_id;
  insert into public.command_receipts values (save_ai_chat_turn.operation_id, auth.uid(), 'save_ai_chat_turn', r.hash, 'ai_chat_message', answer_id, now());
  return answer_id;
end $$;

-- "Cuoc tro chuyen moi": the earlier turns are archived (kept, no longer sent to the assistant or shown).
create or replace function public.start_new_ai_chat(target_branch_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare archived_count integer;
begin
  if not private.has_permission(target_branch_id, 'ai.use') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.ai_chat_messages set archived = true where auth_user_id = auth.uid() and branch_id = target_branch_id and not archived;
  get diagnostics archived_count = row_count;
  return archived_count;
end $$;

revoke all on function public.save_ai_chat_turn(uuid, text, text, uuid), public.start_new_ai_chat(uuid) from public, anon;
grant execute on function public.save_ai_chat_turn(uuid, text, text, uuid), public.start_new_ai_chat(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
