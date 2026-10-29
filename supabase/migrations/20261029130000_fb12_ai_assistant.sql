-- FB12 (D34d): trợ lý AI (Claude) per module. The assistant only reads, with the asking person's own permissions (RLS);
-- anything that would write to the books becomes a proposal ("đề xuất") that a person with ai.manage approves or dismisses
-- and then carries out on the normal screen. Every call is logged with its token usage so the Owner sees the month's cost;
-- the budget itself is the Anthropic account's ("hết hạn mức thì nạp thêm"), not a limit in the app.
begin;

insert into public.permissions(code, name) values
  ('ai.use', 'Dùng trợ lý AI'),
  ('ai.manage', 'Quản lý trợ lý AI: xem chi phí, duyệt đề xuất')
on conflict (code) do update set name = excluded.name;
-- Whoever manages roles gets both; other roles get ai.use when the Owner adds it.
insert into public.role_permissions(role_id, permission_code)
  select distinct rp.role_id, x.code from public.role_permissions rp cross join (values ('ai.use'), ('ai.manage')) x(code)
  where rp.permission_code = 'roles.manage'
on conflict do nothing;

create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  module text not null check (module ~ '^[a-z_]{2,32}$'),
  model text not null check (char_length(model) between 3 and 64),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  outcome text not null check (outcome in ('OK','REFUSED','QUOTA','ERROR')),
  created_at timestamptz not null default now()
);
create index ai_usage_log_branch_month on public.ai_usage_log(branch_id, created_at desc);

create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  module text not null check (module ~ '^[a-z_]{2,32}$'),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 3 and 4000),
  link_path text check (link_path ~ '^/admin(/[A-Za-z0-9_./?=&%-]*)?$'),
  state text not null default 'PENDING' check (state in ('PENDING','DONE','DISMISSED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  check ((state = 'PENDING') = (decided_at is null))
);
create index ai_proposals_branch_state on public.ai_proposals(branch_id, state, created_at desc);

alter table public.ai_usage_log enable row level security;
alter table public.ai_proposals enable row level security;
create policy ai_usage_log_read on public.ai_usage_log for select to authenticated
  using (private.has_permission(branch_id, 'ai.manage') or user_id = auth.uid());
create policy ai_proposals_read on public.ai_proposals for select to authenticated
  using (private.has_permission(branch_id, 'ai.manage') or created_by = auth.uid());
revoke all on public.ai_usage_log, public.ai_proposals from anon, public;
grant select on public.ai_usage_log, public.ai_proposals to authenticated;

create or replace function public.log_ai_usage(target_branch_id uuid, ai_module text, ai_model text, input_count integer, output_count integer,
  cache_read_count integer, cache_write_count integer, call_outcome text) returns uuid
language plpgsql security definer set search_path='' as $function$
declare log_id uuid;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'ai.use') then raise exception 'forbidden' using errcode='42501'; end if;
  insert into public.ai_usage_log(branch_id, user_id, module, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, outcome)
  values (target_branch_id, auth.uid(), ai_module, ai_model, greatest(coalesce(input_count, 0), 0), greatest(coalesce(output_count, 0), 0),
    greatest(coalesce(cache_read_count, 0), 0), greatest(coalesce(cache_write_count, 0), 0), call_outcome)
  returning id into log_id;
  return log_id;
end $function$;

-- The assistant's suggestion of a change to the books; it changes nothing until a person does it on the normal screen.
create or replace function public.create_ai_proposal(target_branch_id uuid, ai_module text, proposal_title text, proposal_body text,
  proposal_link text, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; proposal_id uuid;
begin
  if not private.has_permission(target_branch_id, 'ai.use') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(create_ai_proposal.operation_id, 'create_ai_proposal',
    jsonb_build_array(target_branch_id, ai_module, proposal_title, proposal_body, proposal_link));
  if r.replay is not null then return r.replay; end if;
  insert into public.ai_proposals(branch_id, module, title, body, link_path, created_by)
  values (target_branch_id, ai_module, trim(proposal_title), trim(proposal_body), nullif(trim(proposal_link), ''), auth.uid())
  returning id into proposal_id;
  insert into public.command_receipts values (create_ai_proposal.operation_id, auth.uid(), 'create_ai_proposal', r.hash, 'ai_proposal', proposal_id, now());
  return proposal_id;
end $function$;

create or replace function public.decide_ai_proposal(target_proposal_id uuid, decision text, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare p public.ai_proposals%rowtype;
begin
  select * into p from public.ai_proposals where id = target_proposal_id for update;
  if p.id is null or not private.has_permission(p.branch_id, 'ai.manage') or operation_id is null or decision not in ('DONE','DISMISSED') then
    raise exception 'forbidden' using errcode='42501'; end if;
  if p.state <> 'PENDING' then return p.id; end if;
  update public.ai_proposals set state = decision, decided_by = auth.uid(), decided_at = now() where id = p.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), p.branch_id, 'ai.proposal_' || lower(decision), 'ai_proposal', p.id, operation_id, array['state'], p.title);
  return p.id;
end $function$;

revoke all on function public.log_ai_usage(uuid, text, text, integer, integer, integer, integer, text),
  public.create_ai_proposal(uuid, text, text, text, text, uuid), public.decide_ai_proposal(uuid, text, uuid) from public, anon;
grant execute on function public.log_ai_usage(uuid, text, text, integer, integer, integer, integer, text),
  public.create_ai_proposal(uuid, text, text, text, text, uuid), public.decide_ai_proposal(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
