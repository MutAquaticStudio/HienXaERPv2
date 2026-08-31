-- HIỀN XA ERP P1 — platform core and security foundation.
-- This migration is source-controlled only. Applying it to the single hosted
-- Production project requires a separate explicit deployment instruction.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create type public.employee_status as enum (
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'DISABLED'
);

create type public.data_scope_kind as enum (
  'ALL',
  'BRANCH',
  'WAREHOUSE',
  'ASSIGNED_ONLY',
  'SELF'
);

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  status public.employee_status not null default 'INVITED',
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  suspended_at timestamptz,
  disabled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_profiles_lifecycle_dates check (
    (status <> 'ACTIVE' or activated_at is not null)
    and (status <> 'SUSPENDED' or suspended_at is not null)
    and (status <> 'DISABLED' or disabled_at is not null)
  )
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_vi text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description_vi text not null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  granted_by uuid references public.user_profiles(user_id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.data_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  scope_kind public.data_scope_kind not null,
  branch_id uuid,
  warehouse_id uuid,
  created_at timestamptz not null default now(),
  constraint data_scopes_shape check (
    (scope_kind = 'BRANCH' and branch_id is not null and warehouse_id is null)
    or (scope_kind = 'WAREHOUSE' and warehouse_id is not null and branch_id is null)
    or (scope_kind in ('ALL', 'ASSIGNED_ONLY', 'SELF') and branch_id is null and warehouse_id is null)
  )
);

create unique index data_scopes_unique_global
  on public.data_scopes(user_id, scope_kind)
  where branch_id is null and warehouse_id is null;

create unique index data_scopes_unique_branch
  on public.data_scopes(user_id, scope_kind, branch_id)
  where branch_id is not null;

create unique index data_scopes_unique_warehouse
  on public.data_scopes(user_id, scope_kind, warehouse_id)
  where warehouse_id is not null;

-- Minimal assignment seam needed for the P1 ASSIGNED_ONLY security proof.
-- P10 extends the work lifecycle; P1 deliberately does not implement it.
create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 200),
  assigned_user_id uuid references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create index work_items_assigned_user_id_idx
  on public.work_items(assigned_user_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.user_profiles(user_id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  idempotency_key text,
  request_id text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_events_entity_idx
  on public.audit_events(entity_type, entity_id, occurred_at desc);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  bucket_id text not null default 'evidence' check (bucket_id = 'evidence'),
  storage_path text not null unique,
  entity_type text not null,
  entity_id uuid,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  created_at timestamptz not null default now(),
  constraint evidence_owner_path check (
    split_part(storage_path, '/', 1) = owner_user_id::text
  )
);

create table app_private.idempotency_keys (
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  command_name text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_payload jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, command_name, idempotency_key)
);

revoke all on app_private.idempotency_keys from public, anon, authenticated;
alter table app_private.idempotency_keys enable row level security;

create or replace function app_private.is_active_user(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles as profile
    where profile.user_id = check_user_id
      and profile.status = 'ACTIVE'
  );
$$;

create or replace function app_private.has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_active_user(auth.uid())
    and exists (
      select 1
      from public.user_roles as user_role
      join public.role_permissions as role_permission
        on role_permission.role_id = user_role.role_id
      join public.permissions as permission
        on permission.id = role_permission.permission_id
      where user_role.user_id = auth.uid()
        and permission.code = permission_code
    );
$$;

revoke all on function app_private.is_active_user(uuid) from public;
revoke all on function app_private.has_permission(text) from public;
grant execute on function app_private.is_active_user(uuid) to authenticated;
grant execute on function app_private.has_permission(text) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.data_scopes enable row level security;
alter table public.work_items enable row level security;
alter table public.audit_events enable row level security;
alter table public.evidence enable row level security;

revoke all on public.user_profiles from anon, authenticated;
revoke all on public.roles from anon, authenticated;
revoke all on public.permissions from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;
revoke all on public.role_permissions from anon, authenticated;
revoke all on public.data_scopes from anon, authenticated;
revoke all on public.work_items from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;
revoke all on public.evidence from anon, authenticated;

grant select on public.user_profiles to authenticated;
grant select on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.data_scopes to authenticated;
grant select on public.work_items to authenticated;
grant select on public.audit_events to authenticated;
grant select, insert on public.evidence to authenticated;

create policy user_profiles_read_self_or_admin
on public.user_profiles for select
to authenticated
using (
  app_private.is_active_user(auth.uid())
  and (
    user_id = auth.uid()
    or app_private.has_permission('user.manage')
  )
);

create policy roles_read_active
on public.roles for select
to authenticated
using (app_private.is_active_user(auth.uid()));

create policy permissions_read_active
on public.permissions for select
to authenticated
using (app_private.is_active_user(auth.uid()));

create policy user_roles_read_self_or_admin
on public.user_roles for select
to authenticated
using (
  app_private.is_active_user(auth.uid())
  and (
    user_id = auth.uid()
    or app_private.has_permission('role.manage')
  )
);

create policy role_permissions_read_active
on public.role_permissions for select
to authenticated
using (app_private.is_active_user(auth.uid()));

create policy data_scopes_read_self_or_admin
on public.data_scopes for select
to authenticated
using (
  app_private.is_active_user(auth.uid())
  and (
    user_id = auth.uid()
    or app_private.has_permission('user.manage')
  )
);

create policy work_items_read_authorized
on public.work_items for select
to authenticated
using (
  app_private.is_active_user(auth.uid())
  and (
    (
      assigned_user_id = auth.uid()
      and app_private.has_permission('work_item.read_assigned')
    )
    or app_private.has_permission('work_pool.read')
  )
);

create policy audit_events_read_auditor
on public.audit_events for select
to authenticated
using (app_private.has_permission('audit.view'));

create policy evidence_read_owner_or_auditor
on public.evidence for select
to authenticated
using (
  app_private.is_active_user(auth.uid())
  and (
    (
      owner_user_id = auth.uid()
      and app_private.has_permission('evidence.read')
    )
    or app_private.has_permission('audit.view')
  )
);

create policy evidence_insert_owner
on public.evidence for insert
to authenticated
with check (
  app_private.is_active_user(auth.uid())
  and owner_user_id = auth.uid()
  and app_private.has_permission('evidence.create')
  and split_part(storage_path, '/', 1) = auth.uid()::text
);

create or replace function app_private.enforce_employee_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status <> old.status and not (
    (old.status = 'INVITED' and new.status in ('ACTIVE', 'DISABLED'))
    or (old.status = 'ACTIVE' and new.status in ('SUSPENDED', 'DISABLED'))
    or (old.status = 'SUSPENDED' and new.status in ('ACTIVE', 'DISABLED'))
  ) then
    raise exception 'INVALID_EMPLOYEE_TRANSITION: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  if new.status = 'ACTIVE' and old.status <> 'ACTIVE' then
    new.activated_at = now();
  elsif new.status = 'SUSPENDED' and old.status <> 'SUSPENDED' then
    new.suspended_at = now();
  elsif new.status = 'DISABLED' and old.status <> 'DISABLED' then
    new.disabled_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_lifecycle_guard
before update on public.user_profiles
for each row execute function app_private.enforce_employee_lifecycle();

create or replace function app_private.prevent_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'AUDIT_EVENT_IMMUTABLE' using errcode = '22000';
end;
$$;

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function app_private.prevent_audit_mutation();

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, display_name, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Người dùng mới'),
    'INVITED'
  );
  return new;
end;
$$;

revoke all on function app_private.prevent_audit_mutation() from public;
revoke all on function app_private.enforce_employee_lifecycle() from public;
revoke all on function app_private.handle_new_auth_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

-- Evidence is private. Only metadata is inserted by SQL; object bytes must be
-- uploaded/downloaded through the Storage API.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'evidence',
  'evidence',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy evidence_objects_read_authorized
on storage.objects for select
to authenticated
using (
  bucket_id = 'evidence'
  and app_private.is_active_user(auth.uid())
  and exists (
    select 1
    from public.evidence as item
    where item.bucket_id = storage.objects.bucket_id
      and item.storage_path = storage.objects.name
      and (
        (item.owner_user_id = auth.uid() and app_private.has_permission('evidence.read'))
        or app_private.has_permission('audit.view')
      )
  )
);

create policy evidence_objects_insert_own_folder
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'evidence'
  and app_private.is_active_user(auth.uid())
  and app_private.has_permission('evidence.create')
  and (storage.foldername(name))[1] = auth.uid()::text
);

insert into public.permissions (code, description_vi) values
  ('platform.access_office', 'Truy cập khu vực văn phòng'),
  ('platform.access_worker', 'Truy cập cổng người lao động'),
  ('finance.read', 'Xem dữ liệu tài chính'),
  ('margin.read', 'Xem biên lợi nhuận'),
  ('work_item.read_assigned', 'Xem việc được giao cho chính mình'),
  ('work_pool.read', 'Xem bể công việc'),
  ('audit.view', 'Xem nhật ký kiểm toán'),
  ('evidence.create', 'Tạo bằng chứng'),
  ('evidence.read', 'Xem bằng chứng được phép'),
  ('user.manage', 'Quản lý vòng đời người dùng'),
  ('role.manage', 'Quản lý vai trò và quyền')
on conflict (code) do nothing;

insert into public.roles (code, name_vi) values
  ('OWNER_ADMIN', 'Chủ doanh nghiệp / Quản trị'),
  ('SALES', 'Bán hàng'),
  ('PURCHASING_SOURCING', 'Mua hàng / Nguồn hàng'),
  ('DISPATCHER', 'Điều phối'),
  ('WAREHOUSE', 'Kho / Bãi'),
  ('FINANCE', 'Tài chính'),
  ('DRIVER', 'Lái xe'),
  ('OPERATOR_WORKER', 'Vận hành / Lao động'),
  ('SUPERVISOR', 'Giám sát'),
  ('AUDITOR_VIEWER', 'Kiểm toán / Chỉ xem')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'OWNER_ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'platform.access_worker',
  'work_item.read_assigned',
  'evidence.create',
  'evidence.read'
)
where role.code in ('DRIVER', 'OPERATOR_WORKER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'platform.access_office',
  'finance.read',
  'audit.view',
  'evidence.read'
)
where role.code = 'FINANCE'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
join public.permissions as permission on permission.code in (
  'platform.access_office',
  'audit.view',
  'evidence.read'
)
where role.code = 'AUDITOR_VIEWER'
on conflict do nothing;
