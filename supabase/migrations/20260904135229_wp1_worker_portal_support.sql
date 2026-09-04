-- HIỀN XA ERP WP1 — worker portal support only.
-- PortalIssue records a request or incident against an existing core object.
-- It does not transition Delivery, WorkItem, or ServiceJob state.

create sequence public.portal_issue_number_seq;
revoke all on sequence public.portal_issue_number_seq from public, anon, authenticated;

create table public.portal_issues (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null unique,
  source_type text not null check (source_type in ('WORK_ITEM', 'DELIVERY', 'SERVICE_JOB')),
  source_id uuid not null,
  category text not null check (category in (
    'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'VEHICLE_OR_MACHINE_FAILURE',
    'INSUFFICIENT_GOODS', 'CUSTOMER_PARTIAL_REFUSAL', 'OTHER'
  )),
  description text not null check (char_length(trim(description)) between 10 and 500),
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  reported_by uuid not null references public.user_profiles(user_id) on delete restrict,
  client_idempotency_key text not null check (
    client_idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'
  ),
  created_at timestamptz not null default now(),
  constraint portal_issues_source_idempotency_unique
    unique (source_type, source_id, reported_by, client_idempotency_key)
);

create index portal_issues_source_idx
  on public.portal_issues(source_type, source_id, created_at desc);
create index portal_issues_reporter_idx
  on public.portal_issues(reported_by, created_at desc);

create or replace function app_private.report_portal_issue(
  p_source_type text,
  p_source_id uuid,
  p_category text,
  p_description text,
  p_client_idempotency_key text,
  p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  issue_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'work_item.update_self');

  if p_source_type not in ('WORK_ITEM', 'DELIVERY', 'SERVICE_JOB') then
    raise exception 'PORTAL_ISSUE_SOURCE_TYPE_INVALID' using errcode = '22000';
  end if;
  if p_category not in (
    'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'VEHICLE_OR_MACHINE_FAILURE',
    'INSUFFICIENT_GOODS', 'CUSTOMER_PARTIAL_REFUSAL', 'OTHER'
  ) then
    raise exception 'PORTAL_ISSUE_CATEGORY_INVALID' using errcode = '22000';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 10 and 500 then
    raise exception 'PORTAL_ISSUE_DESCRIPTION_INVALID' using errcode = '22000';
  end if;
  if coalesce(p_client_idempotency_key, '') !~ '^[A-Za-z0-9_-]{12,128}$' then
    raise exception 'PORTAL_ISSUE_IDEMPOTENCY_INVALID' using errcode = '22000';
  end if;

  if p_source_type = 'WORK_ITEM' and not exists (
    select 1
    from public.work_items item
    where item.id = p_source_id
      and item.claimed_by = p_actor_id
      and item.status in ('CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'HEARTBEAT_MISSED', 'UNRESPONSIVE', 'DONE')
  ) then
    raise exception 'PORTAL_ISSUE_SOURCE_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_source_type = 'DELIVERY' and not exists (
    select 1
    from public.delivery_assignments assignment
    where assignment.delivery_id = p_source_id
      and assignment.driver_user_id = p_actor_id
      and assignment.status in ('ASSIGNED', 'ACCEPTED')
  ) then
    raise exception 'PORTAL_ISSUE_SOURCE_ACCESS_DENIED' using errcode = '42501';
  end if;

  if p_source_type = 'SERVICE_JOB' and not exists (
    select 1
    from public.service_job_assignments assignment
    where assignment.service_job_id = p_source_id
      and assignment.operator_user_id = p_actor_id
      and assignment.status = 'ACTIVE'
  ) then
    raise exception 'PORTAL_ISSUE_SOURCE_ACCESS_DENIED' using errcode = '42501';
  end if;

  insert into public.portal_issues (
    issue_number, source_type, source_id, category, description,
    reported_by, client_idempotency_key
  ) values (
    'PIS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.portal_issue_number_seq')::text, 6, '0'),
    p_source_type, p_source_id, p_category, trim(p_description),
    p_actor_id, p_client_idempotency_key
  )
  on conflict (source_type, source_id, reported_by, client_idempotency_key) do nothing
  returning id into issue_id;

  if issue_id is null then
    select issue.id into issue_id
    from public.portal_issues issue
    where issue.source_type = p_source_type
      and issue.source_id = p_source_id
      and issue.reported_by = p_actor_id
      and issue.client_idempotency_key = p_client_idempotency_key;
  end if;
  return issue_id;
end;
$$;

revoke all on function app_private.report_portal_issue(text, uuid, text, text, text, uuid)
  from public, anon, authenticated;

alter table public.portal_issues enable row level security;
revoke all on public.portal_issues from anon, authenticated;
grant select on public.portal_issues to authenticated;

create policy portal_issues_read_authorized
on public.portal_issues for select to authenticated using (
  (select app_private.is_active_user((select auth.uid()))) and (
    reported_by = (select auth.uid())
    or (select app_private.has_permission('work_item.verify'))
    or (select app_private.has_permission('delivery.read'))
    or (select app_private.has_permission('service_job.read'))
    or (select app_private.has_permission('audit.view'))
  )
);
