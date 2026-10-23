-- FB10 (6.2): shared weight conversions let a truck in tấn carry cement counted in bao (50 kg); vehicle pickers see "busy".
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f301000-0000-4000-8000-000000000001', 'kg', 'Kilôgam', 'kg'),
  ('7f301000-0000-4000-8000-000000000002', 'tan', 'Tấn', 'tấn'),
  ('7f301000-0000-4000-8000-000000000003', 'nt_bao301', 'Bao thử 301', 'bao');
insert into public.material_groups(id, code, name) values ('7f301000-0000-4000-8000-000000000004', 'NT_G301', 'Nhóm thử 301');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f301000-0000-4000-8000-000000000005', '7f301000-0000-4000-8000-000000000004', 'NT_XM301', 'Xi măng 301', '7f301000-0000-4000-8000-000000000003');
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type) values
  ('7f301000-0000-4000-8000-000000000005', '7f301000-0000-4000-8000-000000000003', '7f301000-0000-4000-8000-000000000001', 50, 1, 'PACKAGING');
insert into public.vehicles(id, branch_id, code, plate_number, capacity_quantity, capacity_uom_id, capacity_verified_at, capacity_verified_by) values
  ('7f301000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_X301', '99C-301.01', 5, '7f301000-0000-4000-8000-000000000002', now(), '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare status record;
begin
  assert private.capacity_factor('7f301000-0000-4000-8000-000000000005', '7f301000-0000-4000-8000-000000000003', '7f301000-0000-4000-8000-000000000002', now()) is null,
    'no shared conversion yet';
  assert private.seed_standard_conversions() >= 1, 'kg ↔ tấn added';
  assert private.seed_standard_conversions() = 0, 'added once';
  assert private.capacity_factor('7f301000-0000-4000-8000-000000000005', '7f301000-0000-4000-8000-000000000003', '7f301000-0000-4000-8000-000000000002', now()) = 0.05,
    '1 bao = 0.05 tấn';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select * into status from public.vehicle_status_read where vehicle_id = '7f301000-0000-4000-8000-000000000010';
  perform pg_temp.act_as_admin();
  assert status.vehicle_id is not null and status.busy_delivery_number is null and status.capacity_symbol = 'tấn', format('free truck %s', status);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not exists (select 1 from public.vehicle_status_read where vehicle_id = '7f301000-0000-4000-8000-000000000010'), 'hidden without delivery.read';
  perform pg_temp.act_as_admin();
end
$test$;
