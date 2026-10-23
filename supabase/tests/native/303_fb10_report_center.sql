-- FB10 (12): report_center answers each KiotViet-style report with rows and headline figures, checking the right per area.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f303000-0000-4000-8000-000000000001', 'nt_kg303', 'Kilôgam thử 303', 'kg'),
  ('7f303000-0000-4000-8000-000000000002', 'nt_bao303', 'Bao thử 303', 'bao'),
  ('7f303000-0000-4000-8000-000000000003', 'nt_vien303', 'Viên thử 303', 'viên'),
  ('7f303000-0000-4000-8000-000000000004', 'nt_m3303', 'Khối thử 303', 'm³');
insert into public.material_groups(id, code, name) values ('7f303000-0000-4000-8000-000000000005', 'NT_G303', 'Nhóm thử 303');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f303000-0000-4000-8000-000000000010', '7f303000-0000-4000-8000-000000000005', 'NT_XM303', 'Xi măng 303', '7f303000-0000-4000-8000-000000000001'),
  ('7f303000-0000-4000-8000-000000000011', '7f303000-0000-4000-8000-000000000005', 'NT_GA303', 'Gạch 303', '7f303000-0000-4000-8000-000000000003'),
  ('7f303000-0000-4000-8000-000000000012', '7f303000-0000-4000-8000-000000000005', 'NT_CA303', 'Cát 303', '7f303000-0000-4000-8000-000000000004');
insert into public.warehouses(id, branch_id, code, name) values
  ('7f303000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_K3031', 'Kho chính 303'),
  ('7f303000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NT_K3032', 'Kho phụ 303');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f303000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-00000000000a', '7f303000-0000-4000-8000-000000000020', 'NT-KK-3031', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001'),
  ('7f303000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', '7f303000-0000-4000-8000-000000000021', 'NT-KK-3032', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f303000-0000-4000-8000-000000000072', '7f303000-0000-4000-8000-000000000070', '7f303000-0000-4000-8000-000000000010', 0, 1000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f303000-0000-4000-8000-000000000073', '7f303000-0000-4000-8000-000000000070', '7f303000-0000-4000-8000-000000000011', 0, 300, 900, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001'),
  ('7f303000-0000-4000-8000-000000000074', '7f303000-0000-4000-8000-000000000071', '7f303000-0000-4000-8000-000000000011', 0, 2000, 900, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f303000-0000-4000-8000-000000000010', '7f303000-0000-4000-8000-000000000001', 'WAREHOUSE', '7f303000-0000-4000-8000-000000000020', 'STOCK_ADJUSTMENT', 1000, 1500000, 1500, '7f303000-0000-4000-8000-000000000072', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f303000-0000-4000-8000-000000000011', '7f303000-0000-4000-8000-000000000003', 'WAREHOUSE', '7f303000-0000-4000-8000-000000000020', 'STOCK_ADJUSTMENT', 300, 270000, 900, '7f303000-0000-4000-8000-000000000073', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', '7f303000-0000-4000-8000-000000000011', '7f303000-0000-4000-8000-000000000003', 'WAREHOUSE', '7f303000-0000-4000-8000-000000000021', 'STOCK_ADJUSTMENT', 2000, 1800000, 900, '7f303000-0000-4000-8000-000000000074', now(), '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  today constant date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  report jsonb; row jsonb; key text; failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- Stock in/out: 1 000 kg cement counted in today.
  report := public.report_center(branch, 'STOCK_IO', today, today, '7f303000-0000-4000-8000-000000000020');
  select r into row from jsonb_array_elements(report->'rows') r where r->>'code' = 'NT_XM303';
  assert row->>'opening' = '0' and (row->>'in')::numeric = 1000 and (row->>'closing')::numeric = 1000, format('stock in/out %s', row);
  report := public.report_center(branch, 'STOCK_IO', today + 1, today + 1, null);
  select r into row from jsonb_array_elements(report->'rows') r where r->>'code' = 'NT_XM303';
  assert (row->>'opening')::numeric = 1000 and row->>'in' = '0', format('opening next day %s', row);
  -- Every report answers with rows and figures.
  foreach key in array array['END_OF_DAY','SALES_BY_DAY','SALES_BY_CUSTOMER','SALES_BY_STAFF','GOODS_SALES','CUSTOMER_DEBT','SUPPLIER','DELIVERY'] loop
    report := public.report_center(branch, key, today - 30, today, null);
    assert jsonb_typeof(report->'rows') = 'array' and jsonb_typeof(report->'kpis') = 'array' and report->>'report' = key, format('%s shape %s', key, report);
  end loop;
  begin perform public.report_center(branch, 'SALES_BY_DAY', today, today - 1, null); exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_report_range', 'range checked';
  -- A reader with orders.read sees sales but not debts.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  report := public.report_center(branch, 'SALES_BY_DAY', today, today, null);
  failed := null;
  begin perform public.report_center(branch, 'CUSTOMER_DEBT', today, today, null); exception when others then failed := sqlstate; end;
  perform pg_temp.act_as_admin();
  assert failed = '42501', 'debts need finance.ar.read';
end
$test$;
