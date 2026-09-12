create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,24}$'),
  name text not null check (char_length(name) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,24}$'),
  display_name text not null check (char_length(display_name) between 2 and 120),
  active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  check ((active and deactivated_at is null) or (not active and deactivated_at is not null))
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (char_length(name) between 2 and 100),
  active boolean not null default true,
  system_role boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.permissions (
  code text primary key check (code ~ '^[a-z][a-z0-9_.]{2,79}$'),
  name text not null check (char_length(name) between 2 and 120)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete restrict,
  primary key (role_id, permission_code)
);

create table public.employee_branch_access (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((active and revoked_at is null) or (not active and revoked_at is not null))
);

create unique index employee_branch_one_active_role
  on public.employee_branch_access(employee_id, branch_id)
  where active;

create index employee_branch_access_branch_active_idx
  on public.employee_branch_access(branch_id, employee_id)
  where active;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,32}$'),
  display_name text not null check (char_length(display_name) between 2 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customer_portal_memberships (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  membership_role text not null check (membership_role in ('OWNER', 'FINANCE_CONTACT', 'RECEIVER')),
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((active and revoked_at is null) or (not active and revoked_at is not null))
);

create unique index customer_membership_one_active_role
  on public.customer_portal_memberships(auth_user_id, customer_id, membership_role)
  where active;

create index customer_membership_customer_active_idx
  on public.customer_portal_memberships(customer_id, auth_user_id)
  where active;

create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  action text not null check (char_length(action) between 3 and 100),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid not null,
  trace_id uuid not null,
  changed_fields text[] not null default '{}',
  reason text check (reason is null or char_length(reason) between 3 and 500)
);

create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, occurred_at desc);
create index audit_events_branch_idx on public.audit_events(branch_id, occurred_at desc);

insert into public.permissions(code, name) values
  ('dashboard.read', 'Xem tổng quan'),
  ('orders.read', 'Xem đơn bán'),
  ('orders.create', 'Tạo đơn bán'),
  ('purchasing.read', 'Xem đơn mua'),
  ('delivery.read', 'Xem giao hàng'),
  ('finance.ar.read', 'Xem công nợ phải thu'),
  ('customers.read', 'Xem khách hàng'),
  ('roles.manage', 'Quản lý vai trò và nhân viên'),
  ('work.read', 'Xem công việc tác nghiệp')
on conflict (code) do nothing;

create or replace function private.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  where e.auth_user_id = (select auth.uid())
    and e.active
  limit 1
$$;

create or replace function private.has_branch_access(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    join public.branches b on b.id = a.branch_id and b.active
    join public.roles r on r.id = a.role_id and r.active
    where e.auth_user_id = (select auth.uid())
      and e.active
      and a.branch_id = target_branch_id
  )
$$;

create or replace function private.has_permission(target_branch_id uuid, requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    join public.branches b on b.id = a.branch_id and b.active
    join public.roles r on r.id = a.role_id and r.active
    join public.role_permissions rp on rp.role_id = r.id
    where e.auth_user_id = (select auth.uid())
      and e.active
      and a.branch_id = target_branch_id
      and rp.permission_code = requested_permission
  )
$$;

create or replace function private.has_any_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    join public.branches b on b.id = a.branch_id and b.active
    join public.roles r on r.id = a.role_id and r.active
    join public.role_permissions rp on rp.role_id = r.id
    where e.auth_user_id = (select auth.uid())
      and e.active
      and rp.permission_code = requested_permission
  )
$$;

create or replace function private.has_customer_membership(target_customer_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customer_portal_memberships m
    join public.customers c on c.id = m.customer_id and c.active
    where m.auth_user_id = (select auth.uid())
      and m.active
      and m.customer_id = target_customer_id
      and (allowed_roles is null or m.membership_role = any(allowed_roles))
  )
$$;

revoke all on function private.current_employee_id() from public;
revoke all on function private.has_branch_access(uuid) from public;
revoke all on function private.has_permission(uuid, text) from public;
revoke all on function private.has_any_permission(text) from public;
revoke all on function private.has_customer_membership(uuid, text[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.current_employee_id() to authenticated;
grant execute on function private.has_branch_access(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.has_any_permission(text) to authenticated;
grant execute on function private.has_customer_membership(uuid, text[]) to authenticated;

alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.employee_branch_access enable row level security;
alter table public.customers enable row level security;
alter table public.customer_portal_memberships enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.branches, public.employees, public.roles, public.permissions,
  public.role_permissions, public.employee_branch_access, public.customers,
  public.customer_portal_memberships, public.audit_events from anon, authenticated;

grant select on table public.branches, public.employees, public.roles, public.permissions,
  public.role_permissions, public.employee_branch_access, public.customers,
  public.customer_portal_memberships, public.audit_events to authenticated;

create policy branches_select on public.branches for select to authenticated
  using ((select private.has_branch_access(id)));

create policy employees_select on public.employees for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select private.has_any_permission('roles.manage')));

create policy roles_select on public.roles for select to authenticated
  using ((select private.current_employee_id()) is not null);

create policy permissions_select on public.permissions for select to authenticated
  using ((select private.current_employee_id()) is not null);

create policy role_permissions_select on public.role_permissions for select to authenticated
  using ((select private.current_employee_id()) is not null);

create policy employee_branch_access_select on public.employee_branch_access for select to authenticated
  using (
    employee_id = (select private.current_employee_id())
    or (select private.has_permission(branch_id, 'roles.manage'))
  );

create policy customers_select on public.customers for select to authenticated
  using (
    (select private.has_permission(branch_id, 'customers.read'))
    or (select private.has_customer_membership(id, null))
  );

create policy customer_memberships_select on public.customer_portal_memberships for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or exists (
      select 1 from public.customers c
      where c.id = customer_id
        and (select private.has_permission(c.branch_id, 'roles.manage'))
    )
  );

create policy audit_events_select on public.audit_events for select to authenticated
  using (branch_id is not null and (select private.has_permission(branch_id, 'roles.manage')));

create or replace function public.assign_employee_role(
  target_employee_id uuid,
  target_branch_id uuid,
  target_role_id uuid,
  change_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_id uuid;
begin
  if (select auth.uid()) is null or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if change_reason is null or char_length(change_reason) < 3 then
    raise exception 'change_reason_required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.employees where id = target_employee_id and active)
    or not exists (select 1 from public.branches where id = target_branch_id and active)
    or not exists (select 1 from public.roles where id = target_role_id and active) then
    raise exception 'inactive_or_missing_assignment_target' using errcode = '23503';
  end if;

  select id into access_id
  from public.employee_branch_access
  where employee_id = target_employee_id and branch_id = target_branch_id and active
  for update;

  if access_id is not null then
    update public.employee_branch_access
      set active = false, revoked_at = now()
      where id = access_id;
  end if;

  insert into public.employee_branch_access(employee_id, branch_id, role_id)
  values (target_employee_id, target_branch_id, target_role_id)
  returning id into access_id;

  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason
  ) values (
    (select auth.uid()), target_branch_id, 'employee.role.assign', 'employee_branch_access',
    access_id, operation_id, array['role_id'], change_reason
  );

  return access_id;
end
$$;

revoke all on function public.assign_employee_role(uuid, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.assign_employee_role(uuid, uuid, uuid, text, uuid) to authenticated;

comment on function public.assign_employee_role(uuid, uuid, uuid, text, uuid)
  is 'Narrow audited role assignment command. Caller identity comes from auth.uid(), never request payload.';

create or replace function public.register_invited_employee(
  invited_auth_user_id uuid,
  employee_code text,
  employee_name text,
  target_branch_id uuid,
  target_role_id uuid,
  change_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_id uuid;
  access_id uuid;
begin
  if (select auth.uid()) is null or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if change_reason is null or char_length(change_reason) < 3 then
    raise exception 'change_reason_required' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = invited_auth_user_id)
    or not exists (select 1 from public.branches where id = target_branch_id and active)
    or not exists (select 1 from public.roles where id = target_role_id and active) then
    raise exception 'inactive_or_missing_invite_target' using errcode = '23503';
  end if;

  insert into public.employees(auth_user_id, code, display_name)
  values (invited_auth_user_id, employee_code, employee_name)
  returning id into employee_id;

  insert into public.employee_branch_access(employee_id, branch_id, role_id)
  values (employee_id, target_branch_id, target_role_id)
  returning id into access_id;

  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason
  ) values (
    (select auth.uid()), target_branch_id, 'employee.invite.register', 'employee', employee_id,
    operation_id, array['auth_user_id', 'code', 'display_name', 'role_id'], change_reason
  );

  return employee_id;
end
$$;

revoke all on function public.register_invited_employee(uuid, text, text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.register_invited_employee(uuid, text, text, uuid, uuid, text, uuid) to authenticated;
