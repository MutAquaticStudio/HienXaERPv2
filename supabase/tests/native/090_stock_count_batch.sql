-- FB2 Đợt 5: record_stock_count_lines_batch records a whole count sheet atomically through record_stock_count_line, and
-- cancel_stock_count closes an open count without touching stock.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('70000000-0000-4000-8000-000000000051', 'nt_kg5', 'Kilôgam thử 5', 'kg');
insert into public.material_groups(id, code, name) values ('71000000-0000-4000-8000-000000000051', 'NT_G5', 'Nhóm thử 5');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('72000000-0000-4000-8000-000000000051', '71000000-0000-4000-8000-000000000051', 'NT_TH5', 'Thép thử 5', '70000000-0000-4000-8000-000000000051'),
  ('72000000-0000-4000-8000-000000000052', '71000000-0000-4000-8000-000000000051', 'NT_DA5', 'Đá thử 5', '70000000-0000-4000-8000-000000000051');
insert into public.warehouses(id, branch_id, code, name) values
  ('7b000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_K5', 'Kho thử 5');
-- 100 kg of steel at 1.500 ₫/kg on hand (from an approved count); no stone yet.
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7b000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', '7b000000-0000-4000-8000-000000000001', 'NT-KK-5', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7b000000-0000-4000-8000-000000000003', '7b000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000051', 0, 100, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '72000000-0000-4000-8000-000000000051', '70000000-0000-4000-8000-000000000051', 'WAREHOUSE',
   '7b000000-0000-4000-8000-000000000001', 'STOCK_ADJUSTMENT', 100, 150000, 1500, '7b000000-0000-4000-8000-000000000003', now(), '10000000-0000-4000-8000-000000000001');

do $test$
declare
  steel constant uuid := '72000000-0000-4000-8000-000000000051';
  stone constant uuid := '72000000-0000-4000-8000-000000000052';
  warehouse constant uuid := '7b000000-0000-4000-8000-000000000001';
  approved_count constant uuid := '7b000000-0000-4000-8000-000000000002';
  op constant uuid := '7b000000-0000-4000-8000-000000000010';
  sheet jsonb;
  result jsonb;
  count_id uuid;
  second_count uuid;
  version_now integer;
  movements integer;
  failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  count_id := public.open_stock_count('20000000-0000-4000-8000-00000000000a', warehouse, now(), '7b000000-0000-4000-8000-000000000011');
  select version into version_now from public.stock_counts where id = count_id;
  sheet := jsonb_build_array(
    jsonb_build_object('material_id', steel, 'counted_base_quantity', '98', 'reason', 'Hao hụt khi cắt'),
    jsonb_build_object('material_id', stone, 'counted_base_quantity', '5', 'adjustment_unit_cost_vnd', '2000', 'reason', 'Tìm thấy ở bãi'));

  -- Readers and other branches cannot record or cancel.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.record_stock_count_lines_batch(count_id, sheet, version_now, op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader batch must be refused, got %s', failed);
  failed := null;
  begin perform public.cancel_stock_count(count_id, version_now, 'Đếm nhầm kho', op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader cancel must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.record_stock_count_lines_batch(count_id, sheet, version_now, op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch must be refused, got %s', failed);

  -- Malformed sheets are refused before anything is written.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.record_stock_count_lines_batch(count_id, '[]'::jsonb, version_now, op); exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_stock_count_lines', format('empty sheet, got %s', failed);
  failed := null;
  begin perform public.record_stock_count_lines_batch(count_id, jsonb_build_array(sheet->0, sheet->0), version_now, op); exception when others then failed := sqlerrm; end;
  assert failed = 'duplicate_stock_count_line', format('duplicate material, got %s', failed);

  -- One bad line (variance without a reason) rolls back the whole sheet.
  failed := null;
  begin
    perform public.record_stock_count_lines_batch(count_id, jsonb_build_array(sheet->0,
      jsonb_build_object('material_id', stone, 'counted_base_quantity', '5', 'adjustment_unit_cost_vnd', '2000')), version_now, op);
  exception when others then failed := sqlerrm; end;
  assert failed = 'variance_reason_required', format('missing reason, got %s', failed);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.stock_count_lines where stock_count_id = count_id), 'no line may survive a failed sheet';
  assert (select version from public.stock_counts where id = count_id) = version_now, 'version unchanged after a failed sheet';

  -- The sheet records every line against the cutoff book quantity, with history, in one command.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.record_stock_count_lines_batch(count_id, sheet, version_now, op);
  assert (result->>'replayed')::boolean = false and (result->>'version')::int = version_now + 2, format('batch result %s', result);
  perform pg_temp.act_as_admin();
  assert (select version from public.stock_counts where id = count_id) = version_now + 2, 'count version advanced per line';
  assert (select expected_base_quantity from public.stock_count_lines where stock_count_id = count_id and material_id = steel) = 100, 'steel book quantity';
  assert (select expected_base_quantity from public.stock_count_lines where stock_count_id = count_id and material_id = stone) = 0, 'stone book quantity';
  assert (select count(*) from public.stock_count_observations o join public.stock_count_lines l on l.id = o.stock_count_line_id where l.stock_count_id = count_id) = 2, 'one observation per line';
  assert exists (select 1 from public.audit_events where entity_id = count_id and action = 'stock_count.lines_batch_recorded'), 'batch audited';

  -- Retrying the same command replays; reusing its id for another sheet conflicts; a stale version is refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.record_stock_count_lines_batch(count_id, sheet, version_now, op);
  assert (result->>'replayed')::boolean and (select count(*) from public.stock_count_lines where stock_count_id = count_id) = 2, format('replay %s', result);
  failed := null;
  begin perform public.record_stock_count_lines_batch(count_id, jsonb_build_array(sheet->0), version_now, op); exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict, got %s', failed);
  failed := null;
  begin perform public.record_stock_count_lines_batch(count_id, jsonb_build_array(sheet->0), version_now, '7b000000-0000-4000-8000-000000000012'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('stale version, got %s', failed);

  -- Approving the sheet posts both adjustments as before.
  perform public.approve_stock_count(count_id, version_now + 2, '7b000000-0000-4000-8000-000000000013');
  perform pg_temp.act_as_admin();
  assert (select sum(base_quantity_delta) from public.inventory_movements where warehouse_id = warehouse and material_id = steel) = 98, 'steel after count';
  assert (select sum(base_quantity_delta) from public.inventory_movements where warehouse_id = warehouse and material_id = stone) = 5, 'stone after count';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.cancel_stock_count(count_id, version_now + 3, 'Không còn cần', '7b000000-0000-4000-8000-000000000014'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('an approved count cannot be cancelled, got %s', failed);
  failed := null;
  begin perform public.cancel_stock_count(approved_count, 1, 'Không còn cần', '7b000000-0000-4000-8000-000000000015'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('fixture approved count cannot be cancelled, got %s', failed);

  -- Cancelling an open count needs a reason, posts nothing and locks the count.
  second_count := public.open_stock_count('20000000-0000-4000-8000-00000000000a', warehouse, now(), '7b000000-0000-4000-8000-000000000016');
  perform public.record_stock_count_lines_batch(second_count, jsonb_build_array(jsonb_build_object('material_id', steel, 'counted_base_quantity', '98')), 1, '7b000000-0000-4000-8000-000000000017');
  perform pg_temp.act_as_admin();
  select count(*) into movements from public.inventory_movements where warehouse_id = warehouse;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.cancel_stock_count(second_count, 2, ' ', '7b000000-0000-4000-8000-000000000018'); exception when others then failed := sqlerrm; end;
  assert failed = 'cancel_reason_required', format('reason required, got %s', failed);
  assert public.cancel_stock_count(second_count, 2, 'Đếm nhầm kho', '7b000000-0000-4000-8000-000000000018') = second_count, 'cancelled';
  assert (select state from public.stock_counts where id = second_count) = 'CANCELLED' and (select version from public.stock_counts where id = second_count) = 3, 'cancelled state';
  assert public.cancel_stock_count(second_count, 2, 'Đếm nhầm kho', '7b000000-0000-4000-8000-000000000018') = second_count, 'cancel replays';
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.inventory_movements where warehouse_id = warehouse) = movements, 'cancel posts no stock movement';
  assert (select count(*) from public.stock_count_lines where stock_count_id = second_count) = 1, 'recorded lines stay as history';
  assert exists (select 1 from public.audit_events where entity_id = second_count and action = 'stock_count.cancelled' and reason = 'Đếm nhầm kho'), 'cancel audited';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.record_stock_count_lines_batch(second_count, jsonb_build_array(sheet->0), 3, '7b000000-0000-4000-8000-000000000019'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('a cancelled count takes no lines, got %s', failed);
  failed := null;
  begin perform public.approve_stock_count(second_count, 3, '7b000000-0000-4000-8000-00000000001a'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('a cancelled count cannot be approved, got %s', failed);

  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.record_stock_count_lines_batch(uuid, jsonb, integer, uuid)', 'execute'), 'anon cannot record';
  assert not has_function_privilege('anon', 'public.cancel_stock_count(uuid, integer, text, uuid)', 'execute'), 'anon cannot cancel';
end
$test$;
