-- FB7 item 7: approving a stock count that found less than the books records the loss (average cost × quantity) as one
-- approved, non-cash expense "Hao hụt kiểm kho": in Chi phí and in profit, with no payment and no supplier payable.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('70000000-0000-4000-8000-000000000061', 'nt_kg6', 'Kilôgam thử 6', 'kg');
insert into public.material_groups(id, code, name) values ('71000000-0000-4000-8000-000000000061', 'NT_G6', 'Nhóm thử 6');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('72000000-0000-4000-8000-000000000061', '71000000-0000-4000-8000-000000000061', 'NT_TH6', 'Thép thử 6', '70000000-0000-4000-8000-000000000061'),
  ('72000000-0000-4000-8000-000000000062', '71000000-0000-4000-8000-000000000061', 'NT_DA6', 'Đá thử 6', '70000000-0000-4000-8000-000000000061');
insert into public.warehouses(id, branch_id, code, name) values
  ('7d000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_K6', 'Kho thử 6');
-- The code "HAOHUT" is already taken by another type: the loss type gets its own code.
insert into public.expense_categories(branch_id, code, name, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'HAOHUT', 'Hao hụt cũ', '10000000-0000-4000-8000-000000000001');
-- 100 kg of steel at 1.500 ₫/kg on hand (from an approved count); no stone yet.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7d000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', '7d000000-0000-4000-8000-000000000001', 'NT-KK-6', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7d000000-0000-4000-8000-000000000003', '7d000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000061', 0, 100, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '72000000-0000-4000-8000-000000000061', '70000000-0000-4000-8000-000000000061', 'WAREHOUSE',
   '7d000000-0000-4000-8000-000000000001', 'STOCK_ADJUSTMENT', 100, 150000, 1500, '7d000000-0000-4000-8000-000000000003', now(), '10000000-0000-4000-8000-000000000001');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  steel constant uuid := '72000000-0000-4000-8000-000000000061';
  stone constant uuid := '72000000-0000-4000-8000-000000000062';
  warehouse constant uuid := '7d000000-0000-4000-8000-000000000001';
  approve_op constant uuid := '7d000000-0000-4000-8000-000000000013';
  count_id uuid; gain_count uuid; second_loss uuid; loss public.expenses%rowtype;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- Steel 2 kg short (a loss of 3.000 ₫), stone 5 kg found (a gain): one loss expense for the shortage only.
  count_id := public.open_stock_count(branch, warehouse, now(), '7d000000-0000-4000-8000-000000000011');
  perform public.record_stock_count_lines_batch(count_id, jsonb_build_array(
    jsonb_build_object('material_id', steel, 'counted_base_quantity', '98', 'reason', 'Hao hụt khi cắt'),
    jsonb_build_object('material_id', stone, 'counted_base_quantity', '5', 'adjustment_unit_cost_vnd', '2000', 'reason', 'Tìm thấy ở bãi')), 1,
    '7d000000-0000-4000-8000-000000000012');
  perform public.approve_stock_count(count_id, 3, approve_op);
  select * into loss from public.expenses where stock_count_id = count_id;
  assert loss.amount_vnd = 3000 and loss.approval_state = 'APPROVED' and loss.settlement = 'NON_CASH' and loss.payee_kind = 'OTHER'
    and loss.payee_name = 'Kho Kho thử 6' and loss.supplier_id is null and loss.counts_in_profit, format('loss expense %s', to_jsonb(loss));
  assert loss.description = 'Kiểm kho ' || (select count_number from public.stock_counts where id = count_id) || ': Thép thử 6 −2 kg (Hao hụt khi cắt)',
    format('loss description %s', loss.description);
  assert (select name from public.expense_categories where id = loss.category_id) = 'Hao hụt kiểm kho'
    and (select code from public.expense_categories where id = loss.category_id) like 'HAOHUT-%', 'loss type with its own code';
  assert not exists(select 1 from public.payments where expense_id = loss.id), 'no money moves';
  assert not exists(select 1 from public.payable_obligations where expense_id = loss.id), 'no supplier payable';
  assert (select settlement from public.expense_read where id = loss.id) = 'NON_CASH', 'listed as non-cash';
  -- Profit counts every approved expense kept in profit (245 checks the dashboard rule itself).
  assert not exists(select 1 from public.delivery_expense_sources where expense_id = loss.id), 'an operating cost';

  -- Approving again replays without a second expense.
  perform public.approve_stock_count(count_id, 3, approve_op);
  assert (select count(*) from public.expenses where stock_count_id = count_id) = 1, 'one loss per count';

  -- A count that only finds more records nothing.
  gain_count := public.open_stock_count(branch, warehouse, now(), '7d000000-0000-4000-8000-000000000021');
  perform public.record_stock_count_lines_batch(gain_count, jsonb_build_array(
    jsonb_build_object('material_id', stone, 'counted_base_quantity', '7', 'reason', 'Đếm lại bãi')), 1, '7d000000-0000-4000-8000-000000000022');
  perform public.approve_stock_count(gain_count, 2, '7d000000-0000-4000-8000-000000000023');
  assert not exists(select 1 from public.expenses where stock_count_id = gain_count), 'a gain records no loss';

  -- The next loss reuses the same type.
  second_loss := public.open_stock_count(branch, warehouse, now(), '7d000000-0000-4000-8000-000000000031');
  perform public.record_stock_count_lines_batch(second_loss, jsonb_build_array(
    jsonb_build_object('material_id', stone, 'counted_base_quantity', '6', 'reason', 'Lệch khi kiểm kho')), 1, '7d000000-0000-4000-8000-000000000032');
  perform public.approve_stock_count(second_loss, 2, '7d000000-0000-4000-8000-000000000033');
  assert (select category_id from public.expenses where stock_count_id = second_loss) = loss.category_id, 'loss type reused';
  assert (select amount_vnd from public.expenses where stock_count_id = second_loss) = 2000, 'stone 1 kg at 2.000 ₫';
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.expense_categories where branch_id = branch and name = 'Hao hụt kiểm kho') = 1, 'one loss type';
end
$test$;
