-- HIỀN XA ERP P10 — Employee OS and role workspaces.
-- WorkItem reflects the Delivery result; it never replaces Delivery as source of truth.

create type public.work_requirement_status as enum (
  'READY',
  'SATISFIED',
  'CANCELLED'
);

create type public.work_assignment_mode as enum (
  'DIRECT',
  'POOL_CLAIM'
);

create type public.work_item_status as enum (
  'AVAILABLE',
  'CLAIMED',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'VERIFIED',
  'CLAIM_EXPIRED',
  'HEARTBEAT_MISSED',
  'UNRESPONSIVE',
  'CANCELLED'
);

create type public.work_claim_status as enum (
  'ACTIVE',
  'STARTED',
  'RELEASED',
  'EXPIRED',
  'COMPLETED'
);

create type public.work_supervisor_action as enum (
  'KEEP_ASSIGNMENT',
  'RECALL',
  'REASSIGN',
  'CANCEL'
);

create sequence public.work_item_number_seq;
revoke all on sequence public.work_item_number_seq from public, anon, authenticated;

create table public.work_requirements (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('DELIVERY', 'SERVICE_JOB', 'GENERAL')),
  source_id uuid not null,
  delivery_readiness_event_id uuid unique references public.delivery_readiness_events(id) on delete restrict,
  work_type text not null check (work_type in ('DELIVERY', 'OPERATION', 'GENERAL')),
  required_role text references public.roles(code) on delete restrict,
  required_skill_id uuid references public.worker_skill_catalog(id) on delete restrict,
  status public.work_requirement_status not null default 'READY',
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text check (description is null or char_length(trim(description)) between 2 and 1000),
  due_at timestamptz,
  created_by uuid references public.user_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, work_type)
);

alter table public.work_items
  add column work_number text,
  add column requirement_id uuid references public.work_requirements(id) on delete restrict,
  add column description text,
  add column work_type text,
  add column required_role text references public.roles(code) on delete restrict,
  add column assignment_mode public.work_assignment_mode,
  add column status public.work_item_status,
  add column priority smallint not null default 3 check (priority between 1 and 5),
  add column claimed_by uuid references public.user_profiles(user_id) on delete restrict,
  add column claimed_at timestamptz,
  add column claim_expires_at timestamptz,
  add column started_at timestamptz,
  add column heartbeat_due_at timestamptz,
  add column completed_at timestamptz,
  add column verified_at timestamptz,
  add column blocked_reason text,
  add column external_effect_started boolean not null default false,
  add column due_at timestamptz,
  add column updated_at timestamptz not null default now();

update public.work_items
set work_number = 'WRK-' || to_char(created_at, 'YYYY') || '-LEGACY-' || left(id::text, 8),
    description = coalesce(description, 'Công việc đã có trước P10'),
    work_type = 'GENERAL',
    assignment_mode = (case when assigned_user_id is null then 'POOL_CLAIM' else 'DIRECT' end)::public.work_assignment_mode,
    status = (case when assigned_user_id is null then 'AVAILABLE' else 'CLAIMED' end)::public.work_item_status,
    claimed_by = assigned_user_id,
    claimed_at = case when assigned_user_id is null then null else created_at end;

alter table public.work_items
  alter column work_number set not null,
  alter column work_type set not null,
  alter column assignment_mode set not null,
  alter column status set not null,
  add constraint work_items_work_number_unique unique (work_number),
  add constraint work_items_description_length check (
    description is null or char_length(trim(description)) between 2 and 1000
  ),
  add constraint work_items_work_type_allowed check (
    work_type in ('DELIVERY', 'OPERATION', 'GENERAL')
  ),
  add constraint work_items_claim_shape check (
    (status = 'AVAILABLE' and claimed_by is null and assigned_user_id is null)
    or (status = 'CLAIM_EXPIRED')
    or (status = 'CANCELLED')
    or (status in ('CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'VERIFIED', 'HEARTBEAT_MISSED', 'UNRESPONSIVE')
      and claimed_by is not null and assigned_user_id is not null)
  );

create unique index work_items_requirement_unique
  on public.work_items(requirement_id) where requirement_id is not null;
create index work_items_pool_idx
  on public.work_items(status, required_role, work_type, priority, due_at)
  where status = 'AVAILABLE';
create index work_items_worker_active_idx
  on public.work_items(claimed_by, status, due_at)
  where status in ('CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'HEARTBEAT_MISSED', 'UNRESPONSIVE');

create table public.work_claims (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  status public.work_claim_status not null default 'ACTIVE',
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 200),
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  started_at timestamptz,
  released_at timestamptz,
  release_reason text,
  unique (work_item_id, worker_user_id, idempotency_key)
);

create unique index work_claims_one_active_item
  on public.work_claims(work_item_id) where status = 'ACTIVE';
create index work_claims_worker_active_idx
  on public.work_claims(worker_user_id, expires_at) where status = 'ACTIVE';

create table public.work_assignments (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  assignment_mode public.work_assignment_mode not null,
  assigned_by uuid references public.user_profiles(user_id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RELEASED', 'COMPLETED', 'CANCELLED')),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  check ((status = 'ACTIVE' and ended_at is null) or (status <> 'ACTIVE' and ended_at is not null))
);

create unique index work_assignments_one_active_item
  on public.work_assignments(work_item_id) where status = 'ACTIVE';
create index work_assignments_worker_idx
  on public.work_assignments(worker_user_id, assigned_at desc);

create table public.work_heartbeats (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  progress_note text check (progress_note is null or char_length(trim(progress_note)) between 2 and 500),
  recorded_at timestamptz not null default now()
);

create index work_heartbeats_item_idx
  on public.work_heartbeats(work_item_id, recorded_at desc);

create table public.work_verifications (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null unique references public.work_items(id) on delete restrict,
  verified_by uuid not null references public.user_profiles(user_id) on delete restrict,
  outcome text not null check (outcome = 'VERIFIED'),
  note text not null check (char_length(trim(note)) between 10 and 500),
  verified_at timestamptz not null default now()
);

create table public.work_item_state_events (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  from_status public.work_item_status,
  to_status public.work_item_status not null,
  reason text,
  actor_user_id uuid references public.user_profiles(user_id) on delete set null,
  occurred_at timestamptz not null default now(),
  check (from_status is null or from_status <> to_status)
);

create index work_item_state_events_item_idx
  on public.work_item_state_events(work_item_id, occurred_at desc);
create unique index work_item_state_events_initial_once
  on public.work_item_state_events(work_item_id) where from_status is null;

create table public.work_notifications (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  recipient_user_id uuid references public.user_profiles(user_id) on delete restrict,
  recipient_role text references public.roles(code) on delete restrict,
  notification_type text not null check (notification_type in (
    'CLAIM_EXPIRY_WARNING', 'CLAIM_EXPIRED', 'HEARTBEAT_MISSED',
    'UNRESPONSIVE', 'WORK_BLOCKED', 'WORK_DONE', 'SUPERVISOR_DECISION'
  )),
  title text not null check (char_length(trim(title)) between 2 and 200),
  message text not null check (char_length(trim(message)) between 2 and 1000),
  action_path text not null check (action_path like '/%'),
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (recipient_user_id is not null or recipient_role is not null)
);

create index work_notifications_recipient_idx
  on public.work_notifications(recipient_user_id, resolved_at, created_at desc);
create index work_notifications_role_idx
  on public.work_notifications(recipient_role, resolved_at, created_at desc);

create table public.work_active_limits (
  id uuid primary key default gen_random_uuid(),
  role_code text not null references public.roles(code) on delete restrict,
  work_type text not null check (work_type in ('DELIVERY', 'OPERATION', 'GENERAL')),
  max_in_progress smallint not null check (max_in_progress between 0 and 20),
  max_claimed smallint not null check (max_claimed between 0 and 20),
  allow_claim_with_in_progress boolean not null default false,
  claim_start_lease_seconds integer not null default 300 check (claim_start_lease_seconds between 60 and 86400),
  heartbeat_cadence_minutes integer not null default 15 check (heartbeat_cadence_minutes between 1 and 1440),
  heartbeat_response_seconds integer not null default 60 check (heartbeat_response_seconds between 30 and 3600),
  heartbeat_grace_seconds integer not null default 120 check (heartbeat_grace_seconds between 30 and 7200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_code, work_type)
);

insert into public.work_active_limits (
  role_code, work_type, max_in_progress, max_claimed, allow_claim_with_in_progress
) values
  ('DRIVER', 'DELIVERY', 1, 1, true),
  ('OPERATOR_WORKER', 'OPERATION', 1, 1, false),
  ('OPERATOR_WORKER', 'GENERAL', 1, 1, false)
on conflict (role_code, work_type) do nothing;

create trigger work_requirements_updated_at before update on public.work_requirements
for each row execute function app_private.touch_updated_at();
create trigger work_items_updated_at before update on public.work_items
for each row execute function app_private.touch_updated_at();
create trigger work_active_limits_updated_at before update on public.work_active_limits
for each row execute function app_private.touch_updated_at();

create or replace function app_private.prevent_work_history_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'WORK_HISTORY_IMMUTABLE' using errcode = '22000';
end;
$$;

create trigger work_heartbeats_immutable before update or delete on public.work_heartbeats
for each row execute function app_private.prevent_work_history_mutation();
create trigger work_verifications_immutable before update or delete on public.work_verifications
for each row execute function app_private.prevent_work_history_mutation();
create trigger work_item_state_events_immutable before update or delete on public.work_item_state_events
for each row execute function app_private.prevent_work_history_mutation();

create or replace function app_private.worker_is_eligible_for_work(
  p_worker_user_id uuid,
  p_work_item_id uuid,
  p_check_capacity boolean default true
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  item public.work_items%rowtype;
  active_limit public.work_active_limits%rowtype;
  claimed_count integer;
  progress_count integer;
begin
  select * into item from public.work_items where id = p_work_item_id;
  if not found or item.status <> 'AVAILABLE' or item.claimed_by is not null then
    return false;
  end if;
  if (select auth.uid()) is not null
    and p_worker_user_id <> (select auth.uid())
    and not (select app_private.has_permission('work_item.supervise')) then
    return false;
  end if;
  if not exists (
    select 1 from public.user_profiles profile
    join public.employee_operational_profiles operational on operational.user_id = profile.user_id
    where profile.user_id = p_worker_user_id
      and profile.status = 'ACTIVE'
      and operational.is_active
  ) then return false; end if;
  if item.required_role is not null and not exists (
    select 1 from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where user_role.user_id = p_worker_user_id and role.code = item.required_role
  ) then return false; end if;
  if exists (
    select 1 from public.work_requirements requirement
    where requirement.id = item.requirement_id
      and requirement.required_skill_id is not null
      and not exists (
        select 1 from public.worker_skills skill
        where skill.user_id = p_worker_user_id
          and skill.skill_id = requirement.required_skill_id
          and skill.is_active
          and (skill.expires_at is null or skill.expires_at >= current_date)
      )
  ) then return false; end if;
  -- block_new_claims: an UNRESPONSIVE worker must receive a supervisor decision first.
  if exists (
    select 1 from public.work_items active_item
    where active_item.claimed_by = p_worker_user_id and active_item.status = 'UNRESPONSIVE'
  ) then return false; end if;
  if not p_check_capacity then return true; end if;

  select * into active_limit from public.work_active_limits policy
  where policy.role_code = item.required_role
    and policy.work_type = item.work_type
    and policy.is_active
  limit 1;
  if not found then
    active_limit.max_in_progress := 1;
    active_limit.max_claimed := 1;
    active_limit.allow_claim_with_in_progress := false;
  end if;

  select count(*) into claimed_count from public.work_items active_item
  where active_item.claimed_by = p_worker_user_id and active_item.status = 'CLAIMED';
  select count(*) into progress_count from public.work_items active_item
  where active_item.claimed_by = p_worker_user_id
    and active_item.status in ('IN_PROGRESS', 'BLOCKED', 'HEARTBEAT_MISSED');

  return claimed_count < active_limit.max_claimed
    and (
      active_limit.allow_claim_with_in_progress
      or progress_count < active_limit.max_in_progress
    );
end;
$$;

create or replace function app_private.claim_work_item(
  p_work_item_id uuid,
  p_worker_user_id uuid,
  p_idempotency_key text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item public.work_items%rowtype;
  lease_seconds integer := 300;
  claimed_id uuid;
begin
  perform app_private.assert_actor_permission(p_worker_user_id, 'work_item.claim');
  if char_length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22000';
  end if;

  select * into item from public.work_items
  where id = p_work_item_id
  for update;
  if not found then raise exception 'WORK_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;

  -- Same-worker double tap returns the single active claim instead of creating another.
  if item.status = 'CLAIMED' and item.claimed_by = p_worker_user_id then
    return item.id;
  end if;
  if item.status <> 'AVAILABLE' or item.claimed_by is not null then
    raise exception 'WORK_ALREADY_CLAIMED' using errcode = '23505';
  end if;
  -- Serialize capacity checks for one worker even when two different work rows are tapped together.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_worker_user_id::text, 0));
  if not app_private.worker_is_eligible_for_work(p_worker_user_id, item.id, true) then
    raise exception 'WORKER_NOT_ELIGIBLE' using errcode = '42501';
  end if;

  select policy.claim_start_lease_seconds into lease_seconds
  from public.work_active_limits policy
  where policy.role_code = item.required_role
    and policy.work_type = item.work_type and policy.is_active
  limit 1;
  lease_seconds := coalesce(lease_seconds, 300);

  update public.work_items set
    status = 'CLAIMED',
    assigned_user_id = p_worker_user_id,
    claimed_by = p_worker_user_id,
    claimed_at = now(),
    claim_expires_at = now() + make_interval(secs => lease_seconds)
  where id = p_work_item_id
    and status = 'AVAILABLE'
    and claimed_by is null
  returning id into claimed_id;
  if claimed_id is null then
    raise exception 'WORK_ALREADY_CLAIMED' using errcode = '23505';
  end if;

  insert into public.work_claims (
    work_item_id, worker_user_id, idempotency_key, expires_at
  ) values (
    item.id, p_worker_user_id, trim(p_idempotency_key),
    now() + make_interval(secs => lease_seconds)
  );
  insert into public.work_assignments (
    work_item_id, worker_user_id, assignment_mode, assigned_by
  ) values (item.id, p_worker_user_id, 'POOL_CLAIM', p_worker_user_id);
  insert into public.work_item_state_events (
    work_item_id, from_status, to_status, reason, actor_user_id
  ) values (item.id, 'AVAILABLE', 'CLAIMED', 'Người lao động nhận việc từ bể công việc', p_worker_user_id);
  return item.id;
end;
$$;

create or replace function app_private.start_work_item(
  p_work_item_id uuid,
  p_worker_user_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  item public.work_items%rowtype;
  heartbeat_minutes integer := 15;
  max_progress integer := 1;
  current_progress integer;
  source_has_effect boolean := false;
begin
  perform app_private.assert_actor_permission(p_worker_user_id, 'work_item.update_self');
  select * into item from public.work_items where id = p_work_item_id for update;
  if not found then raise exception 'WORK_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if item.claimed_by <> p_worker_user_id or item.assigned_user_id <> p_worker_user_id then
    raise exception 'WORK_ITEM_ASSIGNEE_REQUIRED' using errcode = '42501';
  end if;
  if item.status = 'IN_PROGRESS' then return item.id; end if;
  if item.status <> 'CLAIMED' then raise exception 'WORK_ITEM_NOT_CLAIMED' using errcode = '23514'; end if;
  if item.claim_expires_at is not null and item.claim_expires_at <= now() then
    raise exception 'WORK_CLAIM_EXPIRED' using errcode = '23514';
  end if;

  select policy.max_in_progress, policy.heartbeat_cadence_minutes
  into max_progress, heartbeat_minutes
  from public.work_active_limits policy
  where policy.role_code = item.required_role and policy.work_type = item.work_type and policy.is_active
  limit 1;
  max_progress := coalesce(max_progress, 1);
  heartbeat_minutes := coalesce(heartbeat_minutes, 15);
  select count(*) into current_progress from public.work_items active_item
  where active_item.claimed_by = p_worker_user_id
    and active_item.id <> item.id
    and active_item.status in ('IN_PROGRESS', 'BLOCKED', 'HEARTBEAT_MISSED');
  if current_progress >= max_progress then
    raise exception 'ACTIVE_WORK_LIMIT_REACHED' using errcode = '23514';
  end if;

  if item.requirement_id is not null then
    select exists (
      select 1 from public.work_requirements requirement
      join public.deliveries delivery on delivery.id = requirement.source_id
      where requirement.id = item.requirement_id and requirement.source_type = 'DELIVERY'
        and delivery.status in ('DISPATCHED', 'ARRIVED', 'DELIVERED', 'CONFIRMED', 'PARTIAL')
    ) into source_has_effect;
  end if;

  update public.work_items set
    status = 'IN_PROGRESS', started_at = coalesce(started_at, now()),
    heartbeat_due_at = now() + make_interval(mins => heartbeat_minutes),
    external_effect_started = external_effect_started or source_has_effect
  where id = item.id;
  update public.work_claims set status = 'STARTED', started_at = now()
  where work_item_id = item.id and status = 'ACTIVE';
  insert into public.work_item_state_events (
    work_item_id, from_status, to_status, reason, actor_user_id
  ) values (item.id, 'CLAIMED', 'IN_PROGRESS', 'Người lao động bắt đầu công việc', p_worker_user_id);
  return item.id;
end;
$$;

create or replace function app_private.record_work_heartbeat(
  p_work_item_id uuid,
  p_worker_user_id uuid,
  p_progress_note text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  item public.work_items%rowtype;
  heartbeat_minutes integer := 15;
begin
  perform app_private.assert_actor_permission(p_worker_user_id, 'work_item.heartbeat');
  select * into item from public.work_items where id = p_work_item_id for update;
  if not found then raise exception 'WORK_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if item.claimed_by <> p_worker_user_id then
    raise exception 'WORK_ITEM_ASSIGNEE_REQUIRED' using errcode = '42501';
  end if;
  if item.status = 'UNRESPONSIVE' then
    raise exception 'SUPERVISOR_DECISION_REQUIRED' using errcode = '23514';
  end if;
  if item.status not in ('IN_PROGRESS', 'HEARTBEAT_MISSED') then
    raise exception 'WORK_HEARTBEAT_NOT_ALLOWED' using errcode = '23514';
  end if;
  if p_progress_note is not null and char_length(trim(p_progress_note)) < 2 then
    raise exception 'WORK_HEARTBEAT_NOTE_TOO_SHORT' using errcode = '22000';
  end if;
  select policy.heartbeat_cadence_minutes into heartbeat_minutes
  from public.work_active_limits policy
  where policy.role_code = item.required_role and policy.work_type = item.work_type and policy.is_active
  limit 1;
  heartbeat_minutes := coalesce(heartbeat_minutes, 15);
  insert into public.work_heartbeats (work_item_id, worker_user_id, progress_note)
  values (item.id, p_worker_user_id, nullif(trim(p_progress_note), ''));
  update public.work_items set status = 'IN_PROGRESS',
    heartbeat_due_at = now() + make_interval(mins => heartbeat_minutes)
  where id = item.id;
  if item.status = 'HEARTBEAT_MISSED' then
    insert into public.work_item_state_events (
      work_item_id, from_status, to_status, reason, actor_user_id
    ) values (item.id, 'HEARTBEAT_MISSED', 'IN_PROGRESS', 'Đã nhận phản hồi tiến độ', p_worker_user_id);
  end if;
  return item.id;
end;
$$;

create or replace function app_private.block_work_item(
  p_work_item_id uuid,
  p_worker_user_id uuid,
  p_reason text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare item public.work_items%rowtype;
begin
  perform app_private.assert_actor_permission(p_worker_user_id, 'work_item.update_self');
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'WORK_BLOCK_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into item from public.work_items where id = p_work_item_id for update;
  if not found then raise exception 'WORK_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if item.claimed_by <> p_worker_user_id then
    raise exception 'WORK_ITEM_ASSIGNEE_REQUIRED' using errcode = '42501';
  end if;
  if item.status <> 'IN_PROGRESS' then
    raise exception 'WORK_BLOCK_NOT_ALLOWED' using errcode = '23514';
  end if;
  update public.work_items set status = 'BLOCKED', blocked_reason = trim(p_reason) where id = item.id;
  insert into public.work_item_state_events (
    work_item_id, from_status, to_status, reason, actor_user_id
  ) values (item.id, 'IN_PROGRESS', 'BLOCKED', trim(p_reason), p_worker_user_id);
  insert into public.work_notifications (
    work_item_id, recipient_role, notification_type, title, message, action_path
  ) values (
    item.id, 'SUPERVISOR', 'WORK_BLOCKED', 'Công việc đang bị vướng',
    item.title || ': ' || trim(p_reason), '/app/workforce'
  );
  return item.id;
end;
$$;

create or replace function app_private.complete_work_item(
  p_work_item_id uuid,
  p_worker_user_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare item public.work_items%rowtype;
begin
  perform app_private.assert_actor_permission(p_worker_user_id, 'work_item.update_self');
  select * into item from public.work_items where id = p_work_item_id for update;
  if not found then raise exception 'WORK_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if item.claimed_by <> p_worker_user_id then
    raise exception 'WORK_ITEM_ASSIGNEE_REQUIRED' using errcode = '42501';
  end if;
  if item.status = 'DONE' then return item.id; end if;
  if item.status not in ('IN_PROGRESS', 'BLOCKED') then
    raise exception 'WORK_COMPLETE_NOT_ALLOWED' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.work_requirements requirement
    join public.deliveries delivery on delivery.id = requirement.source_id
    where requirement.id = item.requirement_id and requirement.source_type = 'DELIVERY'
      and delivery.status not in ('DELIVERED', 'CONFIRMED', 'PARTIAL')
  ) then raise exception 'SOURCE_WORK_NOT_COMPLETE' using errcode = '23514'; end if;
  update public.work_items set status = 'DONE', completed_at = now(), heartbeat_due_at = null
  where id = item.id;
  update public.work_claims set status = 'COMPLETED'
  where work_item_id = item.id and status in ('ACTIVE', 'STARTED');
  update public.work_assignments set status = 'COMPLETED', ended_at = now()
  where work_item_id = item.id and status = 'ACTIVE';
  insert into public.work_item_state_events (
    work_item_id, from_status, to_status, reason, actor_user_id
  ) values (item.id, item.status, 'DONE', 'Người lao động báo hoàn thành', p_worker_user_id);
  insert into public.work_notifications (
    work_item_id, recipient_role, notification_type, title, message, action_path
  ) values (item.id, 'SUPERVISOR', 'WORK_DONE', 'Công việc chờ xác minh', item.title, '/app/workforce');
  return item.id;
end;
$$;

create or replace function app_private.verify_work_item(
  p_work_item_id uuid,
  p_note text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare item public.work_items%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'work_item.verify');
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'WORK_VERIFICATION_NOTE_REQUIRED' using errcode = '22000';
  end if;
  select * into item from public.work_items where id = p_work_item_id for update;
  if not found then raise exception 'WORK_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if item.status = 'VERIFIED' then return item.id; end if;
  if item.status <> 'DONE' then raise exception 'WORK_NOT_DONE' using errcode = '23514'; end if;
  insert into public.work_verifications (work_item_id, verified_by, outcome, note)
  values (item.id, p_actor_id, 'VERIFIED', trim(p_note));
  update public.work_items set status = 'VERIFIED', verified_at = now() where id = item.id;
  update public.work_requirements set status = 'SATISFIED' where id = item.requirement_id;
  insert into public.work_item_state_events (
    work_item_id, from_status, to_status, reason, actor_user_id
  ) values (item.id, 'DONE', 'VERIFIED', trim(p_note), p_actor_id);
  return item.id;
end;
$$;

create or replace function app_private.resolve_work_item(
  p_work_item_id uuid,
  p_action public.work_supervisor_action,
  p_reassign_user_id uuid,
  p_reason text,
  p_actor_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  item public.work_items%rowtype;
  heartbeat_minutes integer := 15;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'work_item.supervise');
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'SUPERVISOR_REASON_REQUIRED' using errcode = '22000';
  end if;
  select * into item from public.work_items where id = p_work_item_id for update;
  if not found then raise exception 'WORK_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  if item.status not in ('BLOCKED', 'HEARTBEAT_MISSED', 'UNRESPONSIVE') then
    raise exception 'SUPERVISOR_DECISION_NOT_ALLOWED' using errcode = '23514';
  end if;

  if p_action = 'KEEP_ASSIGNMENT' then
    select coalesce(policy.heartbeat_cadence_minutes, 15) into heartbeat_minutes
    from public.work_active_limits policy
    where policy.role_code = item.required_role
      and policy.work_type = item.work_type and policy.is_active
    limit 1;
    heartbeat_minutes := coalesce(heartbeat_minutes, 15);
    update public.work_items set status = 'IN_PROGRESS', blocked_reason = null,
      heartbeat_due_at = now() + make_interval(mins => heartbeat_minutes)
    where id = item.id;
  elsif p_action = 'RECALL' then
    if item.external_effect_started then
      raise exception 'EXTERNAL_EFFECT_RECALL_FORBIDDEN' using errcode = '23514';
    end if;
    update public.work_claims set status = 'RELEASED', released_at = now(), release_reason = trim(p_reason)
    where work_item_id = item.id and status in ('ACTIVE', 'STARTED');
    update public.work_assignments set status = 'RELEASED', ended_at = now(), reason = trim(p_reason)
    where work_item_id = item.id and status = 'ACTIVE';
    update public.work_items set status = 'AVAILABLE', assigned_user_id = null, claimed_by = null,
      claimed_at = null, claim_expires_at = null, started_at = null,
      heartbeat_due_at = null, blocked_reason = null
    where id = item.id;
  elsif p_action = 'REASSIGN' then
    if p_reassign_user_id is null then
      raise exception 'REASSIGN_WORKER_REQUIRED' using errcode = '22000';
    end if;
    update public.work_claims set status = 'RELEASED', released_at = now(), release_reason = trim(p_reason)
    where work_item_id = item.id and status in ('ACTIVE', 'STARTED');
    update public.work_assignments set status = 'RELEASED', ended_at = now(), reason = trim(p_reason)
    where work_item_id = item.id and status = 'ACTIVE';
    update public.work_items set status = 'AVAILABLE', assigned_user_id = null, claimed_by = null,
      claimed_at = null, claim_expires_at = null, started_at = null,
      heartbeat_due_at = null, blocked_reason = null
    where id = item.id;
    if not app_private.worker_is_eligible_for_work(p_reassign_user_id, item.id, true) then
      raise exception 'REASSIGN_WORKER_NOT_ELIGIBLE' using errcode = '42501';
    end if;
    update public.work_items set status = 'CLAIMED', assignment_mode = 'DIRECT',
      assigned_user_id = p_reassign_user_id, claimed_by = p_reassign_user_id,
      claimed_at = now(), claim_expires_at = null
    where id = item.id;
    insert into public.work_assignments (
      work_item_id, worker_user_id, assignment_mode, assigned_by, reason
    ) values (item.id, p_reassign_user_id, 'DIRECT', p_actor_id, trim(p_reason));
  else
    update public.work_claims set status = 'RELEASED', released_at = now(), release_reason = trim(p_reason)
    where work_item_id = item.id and status in ('ACTIVE', 'STARTED');
    update public.work_assignments set status = 'CANCELLED', ended_at = now(), reason = trim(p_reason)
    where work_item_id = item.id and status = 'ACTIVE';
    update public.work_items set status = 'CANCELLED', heartbeat_due_at = null,
      blocked_reason = trim(p_reason) where id = item.id;
    update public.work_requirements set status = 'CANCELLED' where id = item.requirement_id;
  end if;

  insert into public.work_item_state_events (
    work_item_id, from_status, to_status, reason, actor_user_id
  ) select item.id, item.status, current_item.status, trim(p_reason), p_actor_id
  from public.work_items current_item where current_item.id = item.id
    and current_item.status <> item.status;
  insert into public.work_notifications (
    work_item_id, recipient_user_id, notification_type, title, message, action_path
  ) values (
    item.id, coalesce(p_reassign_user_id, item.claimed_by), 'SUPERVISOR_DECISION',
    'Giám sát đã xử lý công việc', trim(p_reason), '/work'
  );
  return item.id;
end;
$$;

create or replace function app_private.sweep_work_item_timeouts(
  p_actor_id uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  item public.work_items%rowtype;
  expired_count integer := 0;
  missed_count integer := 0;
  unresponsive_count integer := 0;
  response_seconds integer;
  grace_seconds integer;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'work_item.supervise');
  for item in
    select * from public.work_items
    where status = 'CLAIMED' and claim_expires_at is not null and claim_expires_at <= p_now
    for update skip locked
  loop
    insert into public.work_item_state_events (
      work_item_id, from_status, to_status, reason, actor_user_id, occurred_at
    ) values (item.id, 'CLAIMED', 'CLAIM_EXPIRED', 'Hết thời gian bắt đầu công việc', p_actor_id, p_now);
    update public.work_claims set status = 'EXPIRED', released_at = p_now,
      release_reason = 'Hết thời gian bắt đầu công việc'
    where work_item_id = item.id and status = 'ACTIVE';
    update public.work_assignments set status = 'RELEASED', ended_at = p_now,
      reason = 'Hết thời gian bắt đầu công việc'
    where work_item_id = item.id and status = 'ACTIVE';
    update public.work_items set status = 'AVAILABLE', assigned_user_id = null,
      claimed_by = null, claimed_at = null, claim_expires_at = null
    where id = item.id;
    insert into public.work_item_state_events (
      work_item_id, from_status, to_status, reason, actor_user_id, occurred_at
    ) values (item.id, 'CLAIM_EXPIRED', 'AVAILABLE', 'Trả lại bể công việc', p_actor_id, p_now);
    insert into public.work_notifications (
      work_item_id, recipient_user_id, notification_type, title, message, action_path, created_at
    ) values (
      item.id, item.claimed_by, 'CLAIM_EXPIRED', 'Lượt nhận việc đã hết hạn',
      item.title || ' đã được trả về bể công việc.', '/work/pool', p_now
    );
    expired_count := expired_count + 1;
  end loop;

  for item in
    select * from public.work_items
    where status = 'IN_PROGRESS' and heartbeat_due_at is not null
    for update skip locked
  loop
    select coalesce(policy.heartbeat_response_seconds, 60),
      coalesce(policy.heartbeat_grace_seconds, 120)
    into response_seconds, grace_seconds
    from public.work_active_limits policy
    where policy.role_code = item.required_role and policy.work_type = item.work_type and policy.is_active
    limit 1;
    response_seconds := coalesce(response_seconds, 60);
    grace_seconds := coalesce(grace_seconds, 120);
    if p_now > item.heartbeat_due_at + make_interval(secs => response_seconds) then
      update public.work_items set status = 'HEARTBEAT_MISSED' where id = item.id;
      insert into public.work_item_state_events (
        work_item_id, from_status, to_status, reason, actor_user_id, occurred_at
      ) values (item.id, 'IN_PROGRESS', 'HEARTBEAT_MISSED', 'Chưa nhận được phản hồi tiến độ', p_actor_id, p_now);
      insert into public.work_notifications (
        work_item_id, recipient_user_id, notification_type, title, message, action_path, created_at
      ) values (item.id, item.claimed_by, 'HEARTBEAT_MISSED', 'Cần báo tiến độ', item.title, '/work', p_now);
      missed_count := missed_count + 1;
    end if;
  end loop;

  for item in
    select * from public.work_items
    where status = 'HEARTBEAT_MISSED' and heartbeat_due_at is not null
    for update skip locked
  loop
    select coalesce(policy.heartbeat_response_seconds, 60),
      coalesce(policy.heartbeat_grace_seconds, 120)
    into response_seconds, grace_seconds
    from public.work_active_limits policy
    where policy.role_code = item.required_role and policy.work_type = item.work_type and policy.is_active
    limit 1;
    response_seconds := coalesce(response_seconds, 60);
    grace_seconds := coalesce(grace_seconds, 120);
    if p_now > item.heartbeat_due_at + make_interval(secs => response_seconds + grace_seconds) then
      update public.work_items set status = 'UNRESPONSIVE' where id = item.id;
      insert into public.work_item_state_events (
        work_item_id, from_status, to_status, reason, actor_user_id, occurred_at
      ) values (item.id, 'HEARTBEAT_MISSED', 'UNRESPONSIVE', 'Quá thời gian phản hồi', p_actor_id, p_now);
      insert into public.work_notifications (
        work_item_id, recipient_role, notification_type, title, message, action_path, created_at
      ) values (
        item.id, 'SUPERVISOR', 'UNRESPONSIVE', 'Người lao động không phản hồi',
        item.title || ' cần quyết định của giám sát.', '/app/workforce', p_now
      );
      unresponsive_count := unresponsive_count + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'claims_expired', expired_count,
    'heartbeats_missed', missed_count,
    'workers_unresponsive', unresponsive_count
  );
end;
$$;

create or replace function app_private.consume_delivery_work_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requirement_id uuid;
  item_id uuid;
  driver_id uuid;
  delivery_record public.deliveries%rowtype;
  work_item_record public.work_items%rowtype;
begin
  select * into delivery_record from public.deliveries where id = new.delivery_id;
  if new.event_type = 'DELIVERY_READY' then
    select assignment.driver_user_id into driver_id
    from public.delivery_assignments assignment
    where assignment.delivery_id = new.delivery_id and assignment.status in ('ASSIGNED', 'ACCEPTED')
    order by assignment.assigned_at desc limit 1;
    insert into public.work_requirements (
      source_type, source_id, delivery_readiness_event_id, work_type,
      required_role, status, title, description, due_at, created_by
    ) values (
      'DELIVERY', new.delivery_id, new.id, 'DELIVERY', 'DRIVER', 'READY',
      'Giao chuyến ' || delivery_record.delivery_number,
      delivery_record.customer_name_snapshot || ' · ' || delivery_record.drop_address_snapshot,
      delivery_record.scheduled_date::timestamptz, new.created_by
    ) on conflict (source_type, source_id, work_type) do update set
      delivery_readiness_event_id = excluded.delivery_readiness_event_id,
      status = 'READY', updated_at = now()
    returning id into v_requirement_id;

    insert into public.work_items (
      work_number, requirement_id, title, description, work_type, required_role,
      assignment_mode, status, assigned_user_id, claimed_by, claimed_at, due_at
    ) values (
      'WRK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.work_item_number_seq')::text, 6, '0'),
      v_requirement_id, 'Giao chuyến ' || delivery_record.delivery_number,
      delivery_record.pickup_address_snapshot || ' → ' || delivery_record.drop_address_snapshot,
      'DELIVERY', 'DRIVER',
      (case when driver_id is null then 'POOL_CLAIM' else 'DIRECT' end)::public.work_assignment_mode,
      (case when driver_id is null then 'AVAILABLE' else 'CLAIMED' end)::public.work_item_status,
      driver_id, driver_id, case when driver_id is null then null else now() end,
      delivery_record.scheduled_date::timestamptz
    ) on conflict (requirement_id) where requirement_id is not null do update set
      assigned_user_id = coalesce(public.work_items.assigned_user_id, excluded.assigned_user_id),
      claimed_by = coalesce(public.work_items.claimed_by, excluded.claimed_by),
      updated_at = now()
    returning id into item_id;
    insert into public.work_item_state_events (
      work_item_id, from_status, to_status, reason, actor_user_id
    ) select item_id, null, item.status, 'Tạo từ trạng thái sẵn sàng của chuyến giao', new.created_by
      from public.work_items item where item.id = item_id
    on conflict (work_item_id) where from_status is null do nothing;
    if driver_id is not null and not exists (
      select 1 from public.work_assignments assignment
      where assignment.work_item_id = item_id and assignment.status = 'ACTIVE'
    ) then
      insert into public.work_assignments (
        work_item_id, worker_user_id, assignment_mode, assigned_by
      ) values (item_id, driver_id, 'DIRECT', new.created_by);
    end if;
  elsif new.event_type = 'DELIVERY_NOT_READY' then
    update public.work_requirements set status = 'CANCELLED'
    where source_type = 'DELIVERY' and source_id = new.delivery_id;
    for work_item_record in
      select item.* from public.work_items item
      join public.work_requirements requirement on requirement.id = item.requirement_id
      where requirement.source_type = 'DELIVERY' and requirement.source_id = new.delivery_id
        and item.status not in ('DONE', 'VERIFIED', 'CANCELLED')
      for update of item
    loop
      update public.work_claims set status = 'RELEASED', released_at = now(),
        release_reason = 'Chuyến giao không còn sẵn sàng'
      where work_item_id = work_item_record.id and status in ('ACTIVE', 'STARTED');
      update public.work_assignments set status = 'CANCELLED', ended_at = now(),
        reason = 'Chuyến giao không còn sẵn sàng'
      where work_item_id = work_item_record.id and status = 'ACTIVE';
      update public.work_items set status = 'CANCELLED', heartbeat_due_at = null,
        blocked_reason = 'Chuyến giao không còn sẵn sàng'
      where id = work_item_record.id;
      insert into public.work_item_state_events (
        work_item_id, from_status, to_status, reason, actor_user_id
      ) values (
        work_item_record.id, work_item_record.status, 'CANCELLED',
        'WorkItem reflects the delivery result: chuyến giao không còn sẵn sàng', new.created_by
      );
    end loop;
  elsif new.event_type = 'DELIVERY_COMPLETED' then
    update public.work_requirements set status = 'SATISFIED'
    where source_type = 'DELIVERY' and source_id = new.delivery_id;
    for work_item_record in
      select item.* from public.work_items item
      join public.work_requirements requirement on requirement.id = item.requirement_id
      where requirement.source_type = 'DELIVERY' and requirement.source_id = new.delivery_id
        and item.status not in ('DONE', 'VERIFIED', 'CANCELLED')
      for update of item
    loop
      update public.work_claims set status = 'COMPLETED'
      where work_item_id = work_item_record.id and status in ('ACTIVE', 'STARTED');
      update public.work_assignments set status = 'COMPLETED', ended_at = now(),
        reason = 'Chuyến giao đã hoàn tất'
      where work_item_id = work_item_record.id and status = 'ACTIVE';
      update public.work_items set status = 'DONE', completed_at = coalesce(completed_at, now()),
        heartbeat_due_at = null, external_effect_started = true
      where id = work_item_record.id;
      insert into public.work_item_state_events (
        work_item_id, from_status, to_status, reason, actor_user_id
      ) values (
        work_item_record.id, work_item_record.status, 'DONE',
        'WorkItem reflects the delivery result: chuyến giao đã hoàn tất', new.created_by
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger delivery_readiness_create_work_item
after insert on public.delivery_readiness_events
for each row execute function app_private.consume_delivery_work_event();

-- Backfill existing P7 delivery readiness without changing the Delivery source records.
insert into public.work_requirements (
  source_type, source_id, delivery_readiness_event_id, work_type, required_role,
  status, title, description, due_at, created_by
)
select 'DELIVERY', event.delivery_id, event.id, 'DELIVERY', 'DRIVER',
  case when delivery.status in ('CONFIRMED', 'PARTIAL') then 'SATISFIED'
       when delivery.status in ('FAILED', 'CANCELLED') then 'CANCELLED'
       else 'READY' end::public.work_requirement_status,
  'Giao chuyến ' || delivery.delivery_number,
  delivery.customer_name_snapshot || ' · ' || delivery.drop_address_snapshot,
  delivery.scheduled_date::timestamptz, event.created_by
from public.delivery_readiness_events event
join public.deliveries delivery on delivery.id = event.delivery_id
where event.event_type = 'DELIVERY_READY'
on conflict (source_type, source_id, work_type) do nothing;

insert into public.work_items (
  work_number, requirement_id, title, description, work_type, required_role,
  assignment_mode, status, assigned_user_id, claimed_by, claimed_at, started_at,
  completed_at, external_effect_started, due_at
)
select 'WRK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.work_item_number_seq')::text, 6, '0'),
  requirement.id, requirement.title,
  delivery.pickup_address_snapshot || ' → ' || delivery.drop_address_snapshot,
  'DELIVERY', 'DRIVER', (case when assignment.driver_user_id is null then 'POOL_CLAIM' else 'DIRECT' end)::public.work_assignment_mode,
  case
    when delivery.status in ('CONFIRMED', 'PARTIAL') then 'DONE'
    when delivery.status in ('FAILED', 'CANCELLED') then 'CANCELLED'
    when delivery.status in ('DISPATCHED', 'ARRIVED', 'DELIVERED') then 'IN_PROGRESS'
    when assignment.driver_user_id is null then 'AVAILABLE'
    else 'CLAIMED'
  end::public.work_item_status,
  assignment.driver_user_id, assignment.driver_user_id,
  case when assignment.driver_user_id is null then null else assignment.assigned_at end,
  case when delivery.status in ('DISPATCHED', 'ARRIVED', 'DELIVERED') then delivery.dispatched_at else null end,
  case when delivery.status in ('CONFIRMED', 'PARTIAL') then delivery.confirmed_at else null end,
  delivery.status in ('DISPATCHED', 'ARRIVED', 'DELIVERED', 'CONFIRMED', 'PARTIAL'),
  requirement.due_at
from public.work_requirements requirement
join public.deliveries delivery on delivery.id = requirement.source_id and requirement.source_type = 'DELIVERY'
left join lateral (
  select delivery_assignment.driver_user_id, delivery_assignment.assigned_at
  from public.delivery_assignments delivery_assignment
  where delivery_assignment.delivery_id = delivery.id
  order by delivery_assignment.assigned_at desc limit 1
) assignment on true
on conflict (requirement_id) where requirement_id is not null do nothing;

insert into public.work_item_state_events (
  work_item_id, from_status, to_status, reason, actor_user_id, occurred_at
)
select item.id, null, item.status, 'Khởi tạo lịch sử P10 từ chuyến giao P7',
  readiness.created_by, item.created_at
from public.work_items item
join public.work_requirements requirement on requirement.id = item.requirement_id
join public.delivery_readiness_events readiness on readiness.id = requirement.delivery_readiness_event_id
on conflict (work_item_id) where from_status is null do nothing;

insert into public.work_assignments (
  work_item_id, worker_user_id, assignment_mode, assigned_by, status, assigned_at,
  ended_at, reason
)
select item.id, item.assigned_user_id, item.assignment_mode, readiness.created_by,
  case when item.status in ('DONE', 'VERIFIED') then 'COMPLETED'
       when item.status = 'CANCELLED' then 'CANCELLED' else 'ACTIVE' end,
  coalesce(item.claimed_at, item.created_at),
  case when item.status in ('DONE', 'VERIFIED', 'CANCELLED') then coalesce(item.completed_at, now()) else null end,
  'Phân công từ chuyến giao P7'
from public.work_items item
join public.work_requirements requirement on requirement.id = item.requirement_id
join public.delivery_readiness_events readiness on readiness.id = requirement.delivery_readiness_event_id
where item.assigned_user_id is not null
on conflict (work_item_id) where status = 'ACTIVE' do nothing;

create view public.work_item_operational_view with (security_invoker = true) as
select item.id, item.work_number, item.title, item.description, item.work_type,
  item.required_role, item.assignment_mode, item.status, item.priority,
  item.assigned_user_id, item.claimed_by, profile.display_name as worker_name,
  item.claimed_at, item.claim_expires_at, item.started_at, item.heartbeat_due_at,
  item.completed_at, item.verified_at, item.blocked_reason,
  item.external_effect_started, item.due_at,
  requirement.source_type, requirement.source_id,
  delivery.delivery_number, delivery.customer_name_snapshot as customer_name,
  delivery.pickup_address_snapshot as pickup_address,
  delivery.drop_address_snapshot as drop_address,
  delivery.status::text as source_status,
  coalesce(
    (select max(heartbeat.recorded_at) from public.work_heartbeats heartbeat where heartbeat.work_item_id = item.id),
    item.started_at
  ) as last_heartbeat_at,
  case
    when (select app_private.has_permission('work_item.verify')) then true
    else app_private.worker_is_eligible_for_work((select auth.uid()), item.id, true)
  end as is_eligible
from public.work_items item
left join public.work_requirements requirement on requirement.id = item.requirement_id
left join public.deliveries delivery on delivery.id = requirement.source_id and requirement.source_type = 'DELIVERY'
left join public.user_profiles profile on profile.user_id = item.claimed_by;

create view public.work_notification_view with (security_invoker = true) as
select notification.id, notification.work_item_id, notification.recipient_user_id,
  notification.recipient_role, notification.notification_type, notification.title,
  notification.message, notification.action_path, notification.read_at,
  notification.resolved_at, notification.created_at, item.work_number,
  item.status as work_status
from public.work_notifications notification
join public.work_items item on item.id = notification.work_item_id;

create view public.workforce_worker_view with (security_invoker = true) as
select profile.user_id, profile.display_name, operational.employee_code,
  array_agg(role.code order by role.code)::text[] as roles
from public.user_profiles profile
join public.employee_operational_profiles operational
  on operational.user_id = profile.user_id and operational.is_active
join public.user_roles user_role on user_role.user_id = profile.user_id
join public.roles role on role.id = user_role.role_id
where profile.status = 'ACTIVE'
  and role.code in ('DRIVER', 'OPERATOR_WORKER')
group by profile.user_id, profile.display_name, operational.employee_code;

revoke all on function app_private.prevent_work_history_mutation() from public;
revoke all on function app_private.worker_is_eligible_for_work(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function app_private.claim_work_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.start_work_item(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.record_work_heartbeat(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.block_work_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.complete_work_item(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.verify_work_item(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.resolve_work_item(uuid, public.work_supervisor_action, uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.sweep_work_item_timeouts(uuid, timestamptz) from public, anon, authenticated;
revoke all on function app_private.consume_delivery_work_event() from public, anon, authenticated;
grant execute on function app_private.worker_is_eligible_for_work(uuid, uuid, boolean) to authenticated;

alter table public.work_requirements enable row level security;
alter table public.work_claims enable row level security;
alter table public.work_assignments enable row level security;
alter table public.work_heartbeats enable row level security;
alter table public.work_verifications enable row level security;
alter table public.work_item_state_events enable row level security;
alter table public.work_notifications enable row level security;
alter table public.work_active_limits enable row level security;

revoke all on public.work_requirements, public.work_items, public.work_claims,
  public.work_assignments, public.work_heartbeats, public.work_verifications,
  public.work_item_state_events, public.work_notifications, public.work_active_limits,
  public.work_item_operational_view, public.work_notification_view,
  public.workforce_worker_view from anon, authenticated;
grant select on public.work_requirements, public.work_items, public.work_claims,
  public.work_assignments, public.work_heartbeats, public.work_verifications,
  public.work_item_state_events, public.work_notifications, public.work_active_limits,
  public.work_item_operational_view, public.work_notification_view,
  public.workforce_worker_view to authenticated;

drop policy if exists work_items_read_authorized on public.work_items;
create policy work_items_read_authorized on public.work_items for select to authenticated using (
  (select app_private.is_active_user((select auth.uid()))) and (
    (
      (assigned_user_id = (select auth.uid()) or claimed_by = (select auth.uid()))
      and (select app_private.has_permission('work_item.read_assigned'))
    )
    or (
      status = 'AVAILABLE'
      and (select app_private.has_permission('work_pool.read'))
      and (select app_private.worker_is_eligible_for_work((select auth.uid()), id, true))
    )
    or (select app_private.has_permission('work_item.verify'))
  )
);

create policy work_requirements_read_authorized on public.work_requirements
for select to authenticated using (
  exists (select 1 from public.work_items item where item.requirement_id = work_requirements.id)
);
create policy work_claims_read_authorized on public.work_claims
for select to authenticated using (
  worker_user_id = (select auth.uid())
  or (select app_private.has_permission('work_item.verify'))
);
create policy work_assignments_read_authorized on public.work_assignments
for select to authenticated using (
  worker_user_id = (select auth.uid())
  or (select app_private.has_permission('work_item.verify'))
);
create policy work_heartbeats_read_authorized on public.work_heartbeats
for select to authenticated using (
  worker_user_id = (select auth.uid())
  or (select app_private.has_permission('work_item.verify'))
);
create policy work_verifications_read_authorized on public.work_verifications
for select to authenticated using (
  (select app_private.has_permission('work_item.verify'))
  or exists (
    select 1 from public.work_items item
    where item.id = work_verifications.work_item_id and item.claimed_by = (select auth.uid())
  )
);
create policy work_state_events_read_authorized on public.work_item_state_events
for select to authenticated using (
  (select app_private.has_permission('work_item.verify'))
  or exists (
    select 1 from public.work_items item
    where item.id = work_item_state_events.work_item_id and item.claimed_by = (select auth.uid())
  )
);
create policy work_notifications_read_authorized on public.work_notifications
for select to authenticated using (
  (select app_private.is_active_user((select auth.uid())))
  and (select app_private.has_permission('work_notification.read')) and (
    recipient_user_id = (select auth.uid())
    or (
      recipient_role is not null and exists (
        select 1 from public.user_roles user_role
        join public.roles role on role.id = user_role.role_id
        where user_role.user_id = (select auth.uid()) and role.code = recipient_role
      )
    )
    or (select app_private.has_permission('work_item.verify'))
  )
);
create policy work_active_limits_read_authorized on public.work_active_limits
for select to authenticated using (
  (select app_private.has_permission('work_pool.read'))
  or (select app_private.has_permission('work_item.verify'))
);

create policy user_profiles_work_supervisor_read on public.user_profiles
for select to authenticated using (
  (select app_private.has_permission('work_item.supervise'))
);
create policy employee_operational_profiles_work_supervisor_read
on public.employee_operational_profiles for select to authenticated using (
  (select app_private.has_permission('work_item.supervise'))
);
create policy user_roles_work_supervisor_read on public.user_roles
for select to authenticated using (
  (select app_private.has_permission('work_item.supervise'))
);

insert into public.permissions (code, description_vi) values
  ('work_item.claim', 'Nhận việc phù hợp từ bể công việc'),
  ('work_item.update_self', 'Bắt đầu, báo vướng và hoàn thành việc của chính mình'),
  ('work_item.heartbeat', 'Báo tiến độ công việc đang làm'),
  ('work_item.verify', 'Xác minh kết quả công việc'),
  ('work_item.supervise', 'Xử lý công việc bị vướng hoặc không phản hồi'),
  ('work_notification.read', 'Xem thông báo công việc cần hành động')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
cross join public.permissions permission
where role.code = 'OWNER_ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'platform.access_worker', 'work_item.read_assigned', 'work_pool.read',
  'work_item.claim', 'work_item.update_self', 'work_item.heartbeat',
  'work_notification.read'
)
where role.code in ('DRIVER', 'OPERATOR_WORKER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code in (
  'platform.access_office', 'work_item.read_assigned', 'work_pool.read',
  'work_item.verify', 'work_item.supervise', 'work_notification.read'
)
where role.code in ('SUPERVISOR', 'DISPATCHER')
on conflict do nothing;
