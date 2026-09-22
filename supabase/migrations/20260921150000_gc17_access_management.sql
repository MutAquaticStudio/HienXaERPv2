create table public.employee_permission_grants (
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  permission_code text not null references public.permissions(code) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by uuid not null,
  primary key (employee_id, branch_id, permission_code)
);

create index employee_permission_grants_branch_idx
  on public.employee_permission_grants(branch_id, employee_id);

alter table public.employee_permission_grants enable row level security;
revoke all on table public.employee_permission_grants from public, anon, authenticated;
grant select on table public.employee_permission_grants to authenticated;

create policy employee_permission_grants_select on public.employee_permission_grants
for select to authenticated using (
  employee_id = private.current_employee_id()
  or private.has_permission(branch_id, 'roles.manage')
);

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
    where e.auth_user_id = (select auth.uid())
      and e.active
      and a.branch_id = target_branch_id
      and (
        exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission_code = requested_permission
        )
        or exists (
          select 1 from public.employee_permission_grants g
          where g.employee_id = e.id
            and g.branch_id = a.branch_id
            and g.permission_code = requested_permission
        )
      )
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
    where e.auth_user_id = (select auth.uid())
      and e.active
      and (
        exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission_code = requested_permission
        )
        or exists (
          select 1 from public.employee_permission_grants g
          where g.employee_id = e.id
            and g.branch_id = a.branch_id
            and g.permission_code = requested_permission
        )
      )
  )
$$;

revoke all on function private.has_permission(uuid, text) from public;
revoke all on function private.has_any_permission(text) from public;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.has_any_permission(text) to authenticated;

create or replace function public.revoke_employee_access(
  target_access_id uuid,
  change_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.employee_branch_access%rowtype;
begin
  select * into a from public.employee_branch_access where id = target_access_id for update;
  if auth.uid() is null or a.id is null
    or not private.has_permission(a.branch_id, 'roles.manage')
    or a.employee_id = private.current_employee_id()
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if not a.active then return a.id; end if;

  update public.employee_branch_access
  set active = false, revoked_at = now()
  where id = a.id;

  delete from public.employee_permission_grants
  where employee_id = a.employee_id and branch_id = a.branch_id;

  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason
  ) values (
    auth.uid(), a.branch_id, 'employee.access.revoke', 'employee_branch_access', a.id,
    operation_id, array['active', 'explicit_permissions'], trim(change_reason)
  );
  return a.id;
end
$$;

create or replace function public.reactivate_employee_access(
  target_access_id uuid,
  change_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.employee_branch_access%rowtype;
begin
  select * into a from public.employee_branch_access where id = target_access_id for update;
  if auth.uid() is null or a.id is null
    or not private.has_permission(a.branch_id, 'roles.manage')
    or a.employee_id = private.current_employee_id()
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if a.active then return a.id; end if;
  if not exists (select 1 from public.employees e where e.id = a.employee_id and e.active) then
    raise exception 'employee_inactive' using errcode = '23514';
  end if;
  if not exists (select 1 from public.roles r where r.id = a.role_id and r.active) then
    raise exception 'role_inactive' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.employee_branch_access current_access
    where current_access.employee_id = a.employee_id
      and current_access.branch_id = a.branch_id
      and current_access.active
  ) then
    raise exception 'access_already_active' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.role_permissions rp
    where rp.role_id = a.role_id
      and not private.has_permission(a.branch_id, rp.permission_code)
  ) then
    raise exception 'role_exceeds_actor_permissions' using errcode = '42501';
  end if;

  update public.employee_branch_access
  set active = true, revoked_at = null, granted_at = now()
  where id = a.id;

  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason
  ) values (
    auth.uid(), a.branch_id, 'employee.access.reactivate', 'employee_branch_access', a.id,
    operation_id, array['active'], trim(change_reason)
  );
  return a.id;
end
$$;

create or replace function public.set_employee_explicit_permissions(
  target_employee_id uuid,
  target_branch_id uuid,
  permission_codes text[],
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
  requested text[];
begin
  select coalesce(array_agg(distinct item.permission_code order by item.permission_code), '{}'::text[])
  into requested
  from unnest(coalesce(permission_codes, '{}'::text[])) as item(permission_code)
  where item.permission_code is not null and item.permission_code <> '';

  if auth.uid() is null
    or not private.has_permission(target_branch_id, 'roles.manage')
    or target_employee_id = private.current_employee_id()
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select a.id into access_id
  from public.employee_branch_access a
  join public.employees e on e.id = a.employee_id and e.active
  where a.employee_id = target_employee_id
    and a.branch_id = target_branch_id
    and a.active
  for update of a;

  if access_id is null then
    raise exception 'active_access_required' using errcode = '23503';
  end if;
  if exists (
    select 1 from unnest(requested) as item(permission_code)
    left join public.permissions p on p.code = item.permission_code
    where p.code is null
  ) then
    raise exception 'invalid_permission' using errcode = '23503';
  end if;
  if exists (
    select 1 from unnest(requested) as item(permission_code)
    where not private.has_permission(target_branch_id, item.permission_code)
  ) then
    raise exception 'permission_exceeds_actor' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.employee_permission_grants current_grant
    where current_grant.employee_id = target_employee_id
      and current_grant.branch_id = target_branch_id
      and not private.has_permission(target_branch_id, current_grant.permission_code)
  ) then
    raise exception 'existing_permission_exceeds_actor' using errcode = '42501';
  end if;

  delete from public.employee_permission_grants
  where employee_id = target_employee_id and branch_id = target_branch_id;

  insert into public.employee_permission_grants(
    employee_id, branch_id, permission_code, granted_by
  )
  select target_employee_id, target_branch_id, item.permission_code, auth.uid()
  from unnest(requested) as item(permission_code);

  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason
  ) values (
    auth.uid(), target_branch_id, 'employee.permission.set', 'employee_branch_access', access_id,
    operation_id, array['explicit_permissions'], trim(change_reason)
  );
  return access_id;
end
$$;

revoke all on function public.revoke_employee_access(uuid, text, uuid) from public, anon;
revoke all on function public.reactivate_employee_access(uuid, text, uuid) from public, anon;
revoke all on function public.set_employee_explicit_permissions(uuid, uuid, text[], text, uuid) from public, anon;
grant execute on function public.revoke_employee_access(uuid, text, uuid) to authenticated;
grant execute on function public.reactivate_employee_access(uuid, text, uuid) to authenticated;
grant execute on function public.set_employee_explicit_permissions(uuid, uuid, text[], text, uuid) to authenticated;
