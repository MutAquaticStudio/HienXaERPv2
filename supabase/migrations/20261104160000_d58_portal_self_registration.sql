-- D58 (Owner 04/11/2026): khách tự đăng ký không bao giờ kẹt ở "có đăng nhập, không có hồ sơ khách".
-- (1) The register page asks whether the shop takes self-registrations before a login is made: like the logo (D49), anon
--     may read one more column of the single company_profile row, portal_branch_id — a branch id, nothing about the
--     business. Open = a receiving branch is chosen. (2) Cài đặt chooses that branch (roles.manage of that branch, audited);
--     before this the column could only be set by hand, so a company with two branches could not take any.
begin;

grant select (portal_branch_id) on public.company_profile to anon;

create or replace function public.set_portal_branch(target_branch_id uuid, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  profile public.company_profile%rowtype;
begin
  if me is null or set_portal_branch.operation_id is null or target_branch_id is null
    or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.branches b where b.id = target_branch_id and b.active) then
    raise exception 'branch_inactive' using errcode = '23514';
  end if;
  select * into profile from public.company_profile p limit 1 for update;
  if not found then raise exception 'company_profile_missing' using errcode = '23514'; end if;
  if profile.portal_branch_id is not distinct from target_branch_id then return target_branch_id; end if;
  update public.company_profile p set portal_branch_id = target_branch_id where p.id = profile.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, target_branch_id, 'company.portal_branch_set', 'company_profile', profile.id, set_portal_branch.operation_id,
    array['portal_branch_id'], 'Chọn chi nhánh nhận khách tự đăng ký');
  return target_branch_id;
end
$function$;
revoke all on function public.set_portal_branch(uuid, uuid) from public, anon;
grant execute on function public.set_portal_branch(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
