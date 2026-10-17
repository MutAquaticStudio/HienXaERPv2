-- FB2 Đợt 7 (D12): save_custom_role lets the holder of roles.manage create and edit custom roles, never handing out
-- roles.manage or a permission the editor lacks, and never touching preset roles.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000004');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'NT_E4', 'Quản trị hẹp thử');
insert into public.roles(id, code, name, system_role) values
  ('40000000-0000-4000-8000-000000000004', 'nt_limited_admin', 'Quản trị hẹp thử', false),
  ('40000000-0000-4000-8000-000000000005', 'nt_preset', 'Vai trò mẫu thử', true);
insert into public.role_permissions(role_id, permission_code) values
  ('40000000-0000-4000-8000-000000000004', 'roles.manage'),
  ('40000000-0000-4000-8000-000000000004', 'inventory.read'),
  ('40000000-0000-4000-8000-000000000005', 'inventory.read');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000004');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  op constant uuid := '7d000000-0000-4000-8000-000000000001';
  created_role uuid;
  codes text[];
  failed text;
begin
  -- Without roles.manage, or for another branch, nothing is saved.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_custom_role(branch, null, 'Thủ kho ca tối', array['inventory.read'], null, true, op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.save_custom_role(branch, null, 'Thủ kho ca tối', array['inventory.read'], null, true, op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch must be refused, got %s', failed);

  -- roles.manage never goes into a custom role; unknown permissions and empty roles are refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_custom_role(branch, null, 'Phó quản trị', array['inventory.read', 'roles.manage'], null, true, op); exception when others then failed := sqlerrm; end;
  assert failed = 'owner_only_permission', format('roles.manage must stay owner only, got %s', failed);
  failed := null;
  begin perform public.save_custom_role(branch, null, 'Vai trò lạ', array['khong.ton.tai'], null, true, op); exception when others then failed := sqlerrm; end;
  assert failed = 'unknown_permission', format('unknown permission, got %s', failed);
  failed := null;
  begin perform public.save_custom_role(branch, null, 'Vai trò rỗng', array[]::text[], null, true, op); exception when others then failed := sqlerrm; end;
  assert failed = 'role_permissions_required', format('empty role, got %s', failed);

  -- Create (duplicates collapse), replay, payload conflict, duplicate name.
  created_role := public.save_custom_role(branch, null, 'Thủ kho ca tối', array['inventory.read', 'inventory.count', 'inventory.read'], null, true, op);
  perform pg_temp.act_as_admin();
  assert (select system_role from public.roles where id = created_role) = false and (select code from public.roles where id = created_role) like 'custom_%', 'custom role row';
  select array_agg(permission_code order by permission_code) into codes from public.role_permissions where role_id = created_role;
  assert codes = array['inventory.count', 'inventory.read'], format('permissions %s', codes);
  assert exists (select 1 from public.audit_events where entity_id = created_role and action = 'role.custom_created'), 'creation audited';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.save_custom_role(branch, null, 'Thủ kho ca tối', array['inventory.read', 'inventory.count', 'inventory.read'], null, true, op) = created_role, 'replay';
  failed := null;
  begin perform public.save_custom_role(branch, null, 'Thủ kho ca sáng', array['inventory.read'], null, true, op); exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict, got %s', failed);
  failed := null;
  begin perform public.save_custom_role(branch, null, 'thủ kho ca tối', array['inventory.read'], null, true, '7d000000-0000-4000-8000-000000000002'); exception when others then failed := sqlerrm; end;
  assert failed = 'role_name_taken', format('duplicate name, got %s', failed);

  -- Edit against the permissions last read; a stale read is refused.
  failed := null;
  begin perform public.save_custom_role(branch, created_role, 'Thủ kho ca tối', array['inventory.read'], array['inventory.read'], true, '7d000000-0000-4000-8000-000000000003'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('stale permissions, got %s', failed);
  perform public.save_custom_role(branch, created_role, 'Thủ kho đêm', array['inventory.read', 'delivery.read'], array['inventory.read', 'inventory.count'], true, '7d000000-0000-4000-8000-000000000004');
  perform pg_temp.act_as_admin();
  select array_agg(permission_code order by permission_code) into codes from public.role_permissions where role_id = created_role;
  assert codes = array['delivery.read', 'inventory.read'] and (select name from public.roles where id = created_role) = 'Thủ kho đêm', format('edited %s', codes);

  -- Preset roles and roles holding roles.manage stay read-only.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_custom_role(branch, '40000000-0000-4000-8000-000000000005', 'Vai trò mẫu đổi', array['inventory.read'], array['inventory.read'], true, '7d000000-0000-4000-8000-000000000005'); exception when others then failed := sqlerrm; end;
  assert failed = 'role_not_editable', format('preset role, got %s', failed);
  failed := null;
  begin perform public.save_custom_role(branch, '40000000-0000-4000-8000-000000000004', 'Quản trị hẹp', array['inventory.read'], array['inventory.read', 'roles.manage'], true, '7d000000-0000-4000-8000-000000000006'); exception when others then failed := sqlerrm; end;
  assert failed = 'role_not_editable', format('administrator role, got %s', failed);

  -- An editor may only hand out permissions they hold themselves.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000004');
  failed := null;
  begin perform public.save_custom_role(branch, null, 'Kế toán phụ', array['finance.payment.post'], null, true, '7d000000-0000-4000-8000-000000000007'); exception when others then failed := sqlerrm; end;
  assert failed = 'role_exceeds_actor_permissions', format('beyond own rights, got %s', failed);
  assert public.save_custom_role(branch, null, 'Xem kho', array['inventory.read'], null, true, '7d000000-0000-4000-8000-000000000008') is not null, 'within own rights';

  -- A role still assigned cannot be retired; once free it can.
  perform pg_temp.act_as_admin();
  insert into public.employee_branch_access(employee_id, branch_id, role_id) values ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', created_role);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_custom_role(branch, created_role, 'Thủ kho đêm', array[]::text[], array['delivery.read', 'inventory.read'], false, '7d000000-0000-4000-8000-000000000009'); exception when others then failed := sqlerrm; end;
  assert failed = 'role_in_use', format('role in use, got %s', failed);
  perform pg_temp.act_as_admin();
  update public.employee_branch_access set active = false, revoked_at = now() where role_id = created_role;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_custom_role(branch, created_role, 'Thủ kho đêm', array[]::text[], array['delivery.read', 'inventory.read'], false, '7d000000-0000-4000-8000-00000000000a');
  perform pg_temp.act_as_admin();
  assert (select active from public.roles where id = created_role) = false, 'retired';
  assert not has_function_privilege('anon', 'public.save_custom_role(uuid, uuid, text, text[], text[], boolean, uuid)', 'execute'), 'anon cannot execute';
end
$test$;
