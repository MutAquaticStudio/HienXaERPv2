-- D75: a service type is shown to customers only when the owner turns it on (`portal_visible`, default off) and under a group
-- name (`portal_group`). Customers merge by name and pick the unit, so two visible types may not share name + unit.
-- The columns are saved through the same catalog command as the rest of the type, with service.manage.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  chac_xe constant uuid := '7f750000-0000-4000-8000-000000000011';
  chac_to constant uuid := '7f750000-0000-4000-8000-000000000012';
  chac_dup constant uuid := '7f750000-0000-4000-8000-000000000013';
  failed text;
  row_data public.service_types%rowtype;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- A new type is hidden from customers unless it says otherwise.
  perform public.save_catalog_record('service_types', chac_xe, branch,
    '{"code":"CHAC-GACH-XE","name":"Chạc gạch","unit_label":"xe cn nhỏ","default_price_vnd":"170000","resource_kind":"VEHICLE","active":true}', null,
    'Tạo loại dịch vụ', '7f750000-0000-4000-8000-0000000000a1');
  select * into row_data from public.service_types where id = chac_xe;
  assert row_data.portal_visible = false and row_data.portal_group is null, 'hidden by default';

  -- Turning it on and naming the group goes through the audited catalog command (expected values must match).
  perform public.save_catalog_record('service_types', chac_xe, branch, '{"portal_visible":true,"portal_group":"Chạc"}',
    '{"portal_visible":false,"portal_group":null}', 'Hiện cho khách', '7f750000-0000-4000-8000-0000000000a2');
  select * into row_data from public.service_types where id = chac_xe;
  assert row_data.portal_visible and row_data.portal_group = 'Chạc', 'shown to customers under the group';
  assert exists (select 1 from public.audit_events e where e.entity_id = chac_xe and e.action = 'catalog.save' and 'portal_visible' = any(e.changed_fields)), 'audited';

  -- The same name with another unit is another option of the same service.
  perform public.save_catalog_record('service_types', chac_to, branch,
    '{"code":"CHAC-GACH-TO","name":"Chạc gạch","unit_label":"xe cn to","default_price_vnd":"340000","resource_kind":"VEHICLE","portal_visible":true,"portal_group":"Chạc","active":true}', null,
    'Tạo loại dịch vụ', '7f750000-0000-4000-8000-0000000000a3');

  -- Same name and same unit twice for customers would show two identical options: refused. Hidden or stopped copies are fine.
  failed := null;
  begin
    perform public.save_catalog_record('service_types', chac_dup, branch,
      '{"code":"CHAC-GACH-DUP","name":" chạc GẠCH ","unit_label":"Xe CN Nhỏ","resource_kind":"VEHICLE","portal_visible":true,"portal_group":"Chạc","active":true}', null,
      'Tạo loại dịch vụ', '7f750000-0000-4000-8000-0000000000a4');
  exception when unique_violation then failed := sqlerrm; end;
  assert failed like '%service_types_portal_option_unique%', format('duplicate option refused, got %s', failed);
  perform public.save_catalog_record('service_types', chac_dup, branch,
    '{"code":"CHAC-GACH-DUP","name":"Chạc gạch","unit_label":"xe cn nhỏ","resource_kind":"VEHICLE","portal_visible":false,"active":true}', null,
    'Tạo loại dịch vụ', '7f750000-0000-4000-8000-0000000000a5');
  assert not exists (select 1 from public.service_types where id = chac_dup and portal_visible), 'hidden duplicate allowed';
  failed := null;
  begin
    perform public.save_catalog_record('service_types', chac_dup, branch, '{"portal_visible":true}', '{"portal_visible":false}', 'Hiện cho khách',
      '7f750000-0000-4000-8000-0000000000a6');
  exception when unique_violation then failed := 'unique'; end;
  assert failed = 'unique', 'turning on a duplicate is refused';
  perform public.save_catalog_record('service_types', chac_xe, branch, '{"active":false}', '{"active":true}', 'Ngừng dùng', '7f750000-0000-4000-8000-0000000000a7');
  perform public.save_catalog_record('service_types', chac_dup, branch, '{"portal_visible":true}', '{"portal_visible":false}', 'Hiện cho khách',
    '7f750000-0000-4000-8000-0000000000a8');
  assert (select portal_visible from public.service_types where id = chac_dup), 'a stopped type frees the option';

  -- A group name cannot be longer than 60 characters.
  failed := null;
  begin
    perform public.save_catalog_record('service_types', chac_to, branch, jsonb_build_object('portal_group', repeat('x', 61)), '{"portal_group":"Chạc"}',
      'Đổi nhóm', '7f750000-0000-4000-8000-0000000000a9');
  exception when check_violation then failed := 'check'; end;
  assert failed = 'check', 'group name length';

  -- Only service.manage in the branch changes it; a reader cannot, and another branch cannot.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin
    perform public.save_catalog_record('service_types', chac_to, branch, '{"portal_visible":false}', '{"portal_visible":true}', 'Ẩn', '7f750000-0000-4000-8000-0000000000aa');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader cannot change portal visibility, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin
    perform public.save_catalog_record('service_types', chac_to, branch, '{"portal_visible":false}', '{"portal_visible":true}', 'Ẩn', '7f750000-0000-4000-8000-0000000000ab');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('another branch cannot change it, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select portal_visible from public.service_types where id = chac_to), 'still visible';
end
$test$;
