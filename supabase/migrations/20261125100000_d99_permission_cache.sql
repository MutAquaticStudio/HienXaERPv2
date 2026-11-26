-- D99 (Owner 26/11/2026): backend performance. pg_stat_statements on Production showed every row-level-security check costing
-- ~0.8 ms: private.has_permission() joins five tables and private.auth_actor_active() serialises the whole auth.users row three
-- times, and ~114 policies call them once per row (sales_orders / supply_allocations scans took 0.3–2 s, notification_feed 0.9 s
-- on 9,677 calls). This migration only makes the same decisions cheaper:
--   * the actor's active flag and the actor's (branch, permission) pairs are computed once per transaction and kept in
--     transaction-local settings keyed by the user id;
--   * every write to the tables those decisions read (employees, roles, role_permissions, employee_branch_access,
--     employee_permission_grants, branches, auth.users) clears both caches, so a grant, revoke or ban made in the same
--     transaction takes effect at once;
--   * auth_identity_active serialises the auth.users row once instead of three times.
-- No policy, grant, permission or business rule changes. The signatures are unchanged.
begin;

create or replace function private.auth_identity_active(target_auth_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $identity$
 select exists(select 1 from auth.users u cross join lateral (select to_jsonb(u) as j) x
  where u.id=target_auth_user_id
  and nullif(x.j->>'deleted_at','') is null
  and (nullif(x.j->>'banned_until','') is null
    or (x.j->>'banned_until')::timestamptz<=current_timestamp))
$identity$;

create or replace function private.hx_clear_access_cache() returns trigger
language plpgsql set search_path='' as $clear$
begin
  perform set_config('hx.actor_cache', '', true);
  perform set_config('hx.perm_cache', '', true);
  return null;
end
$clear$;
revoke all on function private.hx_clear_access_cache() from public, anon, authenticated, service_role;

drop trigger if exists hx_clear_access_cache on public.employees;
create trigger hx_clear_access_cache after insert or update or delete or truncate on public.employees
  for each statement execute function private.hx_clear_access_cache();
drop trigger if exists hx_clear_access_cache on public.roles;
create trigger hx_clear_access_cache after insert or update or delete or truncate on public.roles
  for each statement execute function private.hx_clear_access_cache();
drop trigger if exists hx_clear_access_cache on public.role_permissions;
create trigger hx_clear_access_cache after insert or update or delete or truncate on public.role_permissions
  for each statement execute function private.hx_clear_access_cache();
drop trigger if exists hx_clear_access_cache on public.employee_branch_access;
create trigger hx_clear_access_cache after insert or update or delete or truncate on public.employee_branch_access
  for each statement execute function private.hx_clear_access_cache();
drop trigger if exists hx_clear_access_cache on public.employee_permission_grants;
create trigger hx_clear_access_cache after insert or update or delete or truncate on public.employee_permission_grants
  for each statement execute function private.hx_clear_access_cache();
drop trigger if exists hx_clear_access_cache on public.branches;
create trigger hx_clear_access_cache after insert or update or delete or truncate on public.branches
  for each statement execute function private.hx_clear_access_cache();
drop trigger if exists hx_clear_access_cache on auth.users;
create trigger hx_clear_access_cache after insert or update or delete or truncate on auth.users
  for each statement execute function private.hx_clear_access_cache();

create or replace function private.auth_actor_active() returns boolean
language plpgsql stable security definer set search_path='' as $actor$
declare uid uuid := (select auth.uid()); cached text; result boolean;
begin
  if uid is null then return false; end if;
  cached := current_setting('hx.actor_cache', true);
  if cached is not null and left(cached, 37) = uid::text || '|' then return substr(cached, 38) = 't'; end if;
  result := private.auth_identity_active(uid);
  perform set_config('hx.actor_cache', uid::text || '|' || case when result then 't' else 'f' end, true);
  return result;
end
$actor$;

create or replace function private.has_permission(target_branch_id uuid, requested_permission text) returns boolean
language plpgsql stable security definer set search_path='' as $perm$
declare uid uuid := (select auth.uid()); cached text; pairs text[];
begin
  if uid is null or target_branch_id is null or requested_permission is null then return false; end if;
  if not private.auth_actor_active() then return false; end if;
  cached := current_setting('hx.perm_cache', true);
  if cached is not null and left(cached, 37) = uid::text || '|' then
    pairs := substr(cached, 38)::text[];
  else
    select coalesce(array_agg(distinct a.branch_id::text || ':' || p.code), '{}'::text[]) into pairs
    from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    join public.branches b on b.id = a.branch_id and b.active
    join public.roles r on r.id = a.role_id and r.active
    cross join lateral (
      select rp.permission_code as code from public.role_permissions rp where rp.role_id = r.id
      union
      select g.permission_code from public.employee_permission_grants g where g.employee_id = e.id and g.branch_id = a.branch_id
    ) p
    where e.auth_user_id = uid and e.active;
    perform set_config('hx.perm_cache', uid::text || '|' || pairs::text, true);
  end if;
  return (target_branch_id::text || ':' || requested_permission) = any(pairs);
end
$perm$;

commit;
