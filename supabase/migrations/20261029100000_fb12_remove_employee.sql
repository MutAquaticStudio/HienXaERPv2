-- FB12 (D34e): "Xóa nhân viên". A person with no trace in the books (no document, job, earning, attendance, payment, audit
-- as actor…) is deleted with their branch access; the app then deletes the sign-in account. Anyone with history is set to
-- "Ngừng làm việc" instead: sign-in blocked (inactive employee), every branch access revoked, hidden from the pickers, the
-- name kept on old documents. "Dùng lại" brings them back with the access they had. The history check follows every foreign
-- key to the employee or to their sign-in account, so new tables are covered without changing this function.
begin;

create or replace function private.employee_has_history(target_employee_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $function$
declare e public.employees%rowtype; ref record; found_row boolean;
begin
  select * into e from public.employees where id=target_employee_id;
  if e.id is null then return false; end if;
  for ref in
    select c.conrelid::regclass::text table_name, a.attname column_name, c.confrelid::regclass::text target
    from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and array_length(c.conkey,1)=1 and n.nspname in ('public','private')
      and c.confrelid in ('public.employees'::regclass,'auth.users'::regclass)
      and c.conrelid not in ('public.employees'::regclass,'public.employee_branch_access'::regclass,'public.employee_permission_grants'::regclass)
  loop
    execute format('select exists(select 1 from %s where %I=$1)', ref.table_name, ref.column_name)
      into found_row using case when ref.target='public.employees' then e.id else e.auth_user_id end;
    if found_row then return true; end if;
  end loop;
  return false;
end $function$;
revoke all on function private.employee_has_history(uuid) from public,anon,authenticated,service_role;

-- Returns {"result": "DELETED" | "DEACTIVATED", "auth_user_id": …}; the app deletes the sign-in account of a deleted person.
create or replace function public.remove_employee(target_employee_id uuid, operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare e public.employees%rowtype; receipt public.command_receipts%rowtype; h text; result text; branch uuid;
begin
  select * into e from public.employees where id=target_employee_id for update;
  -- Allowed to whoever manages roles in a branch where the person works; never oneself, never another role manager.
  select a.branch_id into branch from public.employee_branch_access a
    where a.employee_id=e.id and private.has_permission(a.branch_id,'roles.manage') order by a.active desc, a.branch_id limit 1;
  if auth.uid() is null or e.id is null or branch is null or e.id=private.current_employee_id() or remove_employee.operation_id is null
    or exists (select 1 from public.employee_branch_access a join public.role_permissions rp on rp.role_id=a.role_id
      where a.employee_id=e.id and a.active and rp.permission_code='roles.manage') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  h:=private.command_payload_hash(jsonb_build_object('employee',target_employee_id));
  select * into receipt from public.command_receipts r where r.operation_id=remove_employee.operation_id;
  if found then
    if receipt.command_name<>'remove_employee' or receipt.payload_hash<>h or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode='23505'; end if;
    return jsonb_build_object('result',case when exists(select 1 from public.employees where id=target_employee_id) then 'DEACTIVATED' else 'DELETED' end,
      'auth_user_id',e.auth_user_id,'replayed',true);
  end if;
  if private.employee_has_history(e.id) then
    update public.employees set active=false, deactivated_at=coalesce(deactivated_at,now()) where id=e.id;
    update public.employee_branch_access set active=false, revoked_at=coalesce(revoked_at,now()) where employee_id=e.id and active;
    result:='DEACTIVATED';
  else
    delete from public.employee_permission_grants where employee_id=e.id;
    delete from public.employee_branch_access where employee_id=e.id;
    delete from public.employees where id=e.id;
    result:='DELETED';
  end if;
  insert into public.command_receipts values(remove_employee.operation_id,auth.uid(),'remove_employee',h,'employee',target_employee_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
    values(auth.uid(),branch,case result when 'DELETED' then 'employee.deleted' else 'employee.deactivated' end,'employee',target_employee_id,
      remove_employee.operation_id,array['active','branch_access'],e.display_name||' ('||e.code||')');
  return jsonb_build_object('result',result,'auth_user_id',e.auth_user_id);
end $function$;
revoke all on function public.remove_employee(uuid,uuid) from public,anon;
grant execute on function public.remove_employee(uuid,uuid) to authenticated;

-- "Dùng lại": the person works again with the branch access they had (roles still active).
create or replace function public.restore_employee(target_employee_id uuid, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare e public.employees%rowtype; branch uuid;
begin
  select * into e from public.employees where id=target_employee_id for update;
  select a.branch_id into branch from public.employee_branch_access a
    where a.employee_id=e.id and private.has_permission(a.branch_id,'roles.manage') order by a.branch_id limit 1;
  if auth.uid() is null or e.id is null or branch is null or restore_employee.operation_id is null then
    raise exception 'forbidden' using errcode='42501'; end if;
  if e.active then return e.id; end if;
  update public.employees set active=true, deactivated_at=null where id=e.id;
  update public.employee_branch_access a set active=true, revoked_at=null
    where a.employee_id=e.id and not a.active and exists(select 1 from public.roles r where r.id=a.role_id and r.active)
      and private.has_permission(a.branch_id,'roles.manage');
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
    values(auth.uid(),branch,'employee.restored','employee',e.id,restore_employee.operation_id,array['active','branch_access'],e.display_name||' ('||e.code||')');
  return e.id;
end $function$;
revoke all on function public.restore_employee(uuid,uuid) from public,anon;
grant execute on function public.restore_employee(uuid,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
