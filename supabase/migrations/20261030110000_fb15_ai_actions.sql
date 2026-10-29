-- FB15 (D37): the assistant may prepare any write the person chatting may do (sales, purchasing & stock, finance, staff);
-- nothing is written until the person presses "Xac nhan". A prepared action is kept here with what it will do (shown on
-- the card) and the exact command arguments; confirming runs the normal command under the person's own session with the
-- action id as its operation id, so a repeated press never writes twice. Only the person sees their own actions.
begin;

create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind ~ '^[a-z_]{3,40}$'),
  title text not null check (char_length(title) between 3 and 200),
  summary jsonb not null default '[]'::jsonb check (jsonb_typeof(summary) = 'array'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  state text not null default 'PENDING' check (state in ('PENDING','DONE','FAILED','CANCELLED')),
  result_link text check (result_link ~ '^/admin(/[A-Za-z0-9_./?=&%-]*)?$'),
  result_message text check (char_length(result_message) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((state = 'PENDING') = (decided_at is null))
);
create index ai_actions_person on public.ai_actions(auth_user_id, branch_id, state, created_at desc);

alter table public.ai_actions enable row level security;
create policy ai_actions_own on public.ai_actions for select to authenticated using (auth_user_id = auth.uid());
revoke all on public.ai_actions from anon, public, authenticated;
grant select on public.ai_actions to authenticated;

create or replace function public.create_ai_action(target_branch_id uuid, action_kind text, action_title text, action_summary jsonb, action_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare action_id uuid;
begin
  if not private.has_permission(target_branch_id, 'ai.use') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.ai_actions a where a.auth_user_id = auth.uid() and a.state = 'PENDING') >= 50 then
    raise exception 'too_many_pending_ai_actions' using errcode = '54000'; end if;
  insert into public.ai_actions(branch_id, auth_user_id, kind, title, summary, payload)
  values (target_branch_id, auth.uid(), action_kind, trim(action_title), coalesce(action_summary, '[]'::jsonb), action_payload)
  returning id into action_id;
  return action_id;
end $$;

-- Done / failed after running the command, or dismissed ("Bo qua"); a decided action stays as it is.
create or replace function public.finish_ai_action(target_action_id uuid, new_state text, link text, message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare found_id uuid;
begin
  if new_state not in ('DONE','FAILED','CANCELLED') then raise exception 'invalid_ai_action_state' using errcode = '22023'; end if;
  update public.ai_actions set state = new_state, result_link = nullif(link, ''), result_message = left(nullif(message, ''), 500), decided_at = now()
  where id = target_action_id and auth_user_id = auth.uid() and state = 'PENDING'
  returning id into found_id;
  if found_id is null then
    if exists (select 1 from public.ai_actions where id = target_action_id and auth_user_id = auth.uid()) then return target_action_id; end if;
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return found_id;
end $$;

revoke all on function public.create_ai_action(uuid, text, text, jsonb, jsonb), public.finish_ai_action(uuid, text, text, text) from public, anon;
grant execute on function public.create_ai_action(uuid, text, text, jsonb, jsonb), public.finish_ai_action(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
