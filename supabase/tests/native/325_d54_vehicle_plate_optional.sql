-- D54: a delivery vehicle needs no plate number; screens show the plate when there is one, otherwise the vehicle name.
do $$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  plain constant uuid := '7e540000-0000-4000-8000-000000000001';
  plated constant uuid := '7e540000-0000-4000-8000-000000000002';
  failed text;
  board jsonb;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');

  -- Created through the catalog without any plate.
  perform public.save_catalog_record('vehicles', plain, branch,
    '{"code":"Xe điện","active":true}', null, 'Tạo xe không biển số', '7e540000-0000-4000-8000-0000000000a1');
  assert (select plate_number is null from public.vehicles where id = plain), 'vehicle saved without a plate';

  -- A second vehicle without a plate is fine too (no uniqueness clash on empty plates).
  perform public.save_catalog_record('vehicles', '7e540000-0000-4000-8000-000000000003', branch,
    '{"code":"Xe cn nhỏ","active":true}', null, 'Tạo xe không biển số', '7e540000-0000-4000-8000-0000000000a2');

  -- A plate can still be recorded, and blank text is not a plate.
  perform public.save_catalog_record('vehicles', plated, branch,
    '{"code":"Ô tô","plate_number":"29C-12345","active":true}', null, 'Tạo xe có biển số', '7e540000-0000-4000-8000-0000000000a3');
  failed := null;
  execute 'reset role';
  begin
    update public.vehicles set plate_number = '  ' where id = plated;
  exception when check_violation then failed := 'blank';
  end;
  assert failed = 'blank', 'blank plate refused';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');

  -- Read models fall back to the vehicle name.
  assert (select plate_number from public.vehicle_status_read where vehicle_id = plain) = 'Xe điện', 'status shows the name when there is no plate';
  assert (select plate_number from public.vehicle_status_read where vehicle_id = plated) = '29C-12345', 'status shows the plate when there is one';

  board := public.dispatch_day(branch, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  assert board::text not like '%"plate": null%', format('dispatch board has no empty vehicle label: %s', board);
end $$;
