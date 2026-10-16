-- QA-FB-A10: save_pricing_rules_batch is all-or-nothing, idempotent and reuses save_pricing_rule.
insert into public.units_of_measure(id, code, name, symbol) values ('70000000-0000-4000-8000-000000000001', 'nt_bao', 'Bao thử', 'bao');
insert into public.material_groups(id, code, name) values ('71000000-0000-4000-8000-000000000001', 'NT_G', 'Nhóm thử');
-- Customer price groups are a branch catalog (20261016160000); the VIP group must exist before its prices.
insert into public.customer_price_groups(branch_id, code, name) values ('20000000-0000-4000-8000-00000000000a', 'VIP', 'Khách VIP thử');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'NT_M1', 'Vật tư thử 1', '70000000-0000-4000-8000-000000000001'),
  ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'NT_M2', 'Vật tư thử 2', '70000000-0000-4000-8000-000000000001');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  bao constant uuid := '70000000-0000-4000-8000-000000000001';
  m1 constant uuid := '72000000-0000-4000-8000-000000000001';
  m2 constant uuid := '72000000-0000-4000-8000-000000000002';
  old_rule constant uuid := '73000000-0000-4000-8000-000000000001';
  tier_rule constant uuid := '73000000-0000-4000-8000-000000000002';
  batch_op constant uuid := '74000000-0000-4000-8000-000000000001';
  starts timestamptz := date_trunc('day', now()) - interval '10 days';
  applies timestamptz := date_trunc('day', now());
  items jsonb;
  result jsonb;
  failed text;
  rules_before integer;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_pricing_rule(old_rule, branch, null, null, jsonb_build_object('scope_type', 'DEFAULT', 'material_id', m1, 'price_uom_id', bao,
    'unit_price_vnd', 90000, 'source_type', 'LIST', 'effective_from', starts), 'Giá ban đầu', '74000000-0000-4000-8000-0000000000f1');
  perform public.save_pricing_rule(tier_rule, branch, null, null, jsonb_build_object('scope_type', 'CUSTOMER_TIER', 'customer_tier_code', 'VIP', 'material_id', m2, 'price_uom_id', bao,
    'unit_price_vnd', 70000, 'source_type', 'LIST', 'effective_from', starts), 'Giá VIP', '74000000-0000-4000-8000-0000000000f2');

  items := jsonb_build_array(
    jsonb_build_object('material_id', m1, 'price_uom_id', bao, 'unit_price_vnd', 99000, 'supersedes_id', old_rule, 'expected_version', 1),
    jsonb_build_object('material_id', m2, 'price_uom_id', bao, 'unit_price_vnd', 120000));

  -- A stale item makes the whole batch fail and leaves nothing behind.
  perform pg_temp.act_as_admin(); select count(*) into rules_before from public.pricing_rules where branch_id = branch;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin
    perform public.save_pricing_rules_batch(branch, jsonb_set(items, '{0,expected_version}', '7'), applies, 'Tăng giá tháng 10', '74000000-0000-4000-8000-000000000002');
  exception when others then failed := sqlstate;
  end;
  assert failed = 'PT409', format('stale item must fail the batch, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.pricing_rules where branch_id = branch) = rules_before, 'no partial write after a failed batch';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.save_pricing_rules_batch(branch, items, applies, 'Tăng giá tháng 10', batch_op);
  assert (result->>'count')::int = 2 and (result->>'replayed')::boolean = false, format('batch result %s', result);
  perform pg_temp.act_as_admin();
  assert (select unit_price_vnd from public.pricing_rules where id = (result->'rule_ids'->>0)::uuid) = 99000, 'replacement price saved';
  assert (select version from public.pricing_rules where id = (result->'rule_ids'->>0)::uuid) = 2, 'replacement is version 2';
  assert (select effective_to from public.pricing_rules where id = old_rule) = applies, 'old version ends where the new one starts';
  assert (select scope_type from public.pricing_rules where id = (result->'rule_ids'->>1)::uuid) = 'DEFAULT', 'new general price created';
  assert (select count(*) from public.audit_events where action = 'pricing.save' and reason = 'Tăng giá tháng 10') = 2, 'one audit event per rule';
  assert (select count(*) from public.audit_events where action = 'pricing.save_batch' and trace_id = batch_op) = 1, 'one batch audit event';
  rules_before := (select count(*) from public.pricing_rules where branch_id = branch);

  -- Same operation, same payload: replay without writing.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.save_pricing_rules_batch(branch, items, applies, 'Tăng giá tháng 10', batch_op);
  assert (result->>'replayed')::boolean, 'repeat is a replay';
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.pricing_rules where branch_id = branch) = rules_before, 'replay writes nothing';

  -- Same operation, different payload.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_pricing_rules_batch(branch, items, applies, 'Lý do khác hẳn', batch_op);
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict expected, got %s', failed);

  -- Customer-specific rules are not edited through the price book.
  failed := null;
  begin perform public.save_pricing_rules_batch(branch, jsonb_build_array(jsonb_build_object('material_id', m2, 'price_uom_id', bao, 'unit_price_vnd', 1, 'supersedes_id', tier_rule, 'expected_version', 1)), applies, 'Thử phạm vi', '74000000-0000-4000-8000-000000000003');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('customer rule must be refused, got %s', failed);

  -- Duplicates and oversized batches are refused.
  failed := null;
  begin perform public.save_pricing_rules_batch(branch, jsonb_build_array(items->1, items->1), applies, 'Trùng dòng', '74000000-0000-4000-8000-000000000004');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('duplicate refused, got %s', failed);
  failed := null;
  begin perform public.save_pricing_rules_batch(branch, (select jsonb_agg(jsonb_build_object('material_id', gen_random_uuid(), 'price_uom_id', bao, 'unit_price_vnd', 1)) from generate_series(1, 501)), applies, 'Quá nhiều dòng', '74000000-0000-4000-8000-000000000005');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('over 500 items refused, got %s', failed);

  -- An actor without pricing.manage cannot use it.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_pricing_rules_batch(branch, items, applies, 'Không có quyền', '74000000-0000-4000-8000-000000000006');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader refused, got %s', failed);
end
$test$;
