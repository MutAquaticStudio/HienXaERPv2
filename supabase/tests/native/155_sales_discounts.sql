-- FB3 P5: discounts on a sales order are kept per unit — unit_price_vnd is the price after discount and
-- list_unit_price_vnd the price before — so totals, credit and later steps use the discounted amounts.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7e000000-0000-4000-8000-000000000001', 'nt_kg16', 'Kilôgam thử 16', 'kg');
insert into public.material_groups(id, code, name) values ('7e000000-0000-4000-8000-000000000002', 'NT_G16', 'Nhóm thử 16');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7e000000-0000-4000-8000-000000000003', '7e000000-0000-4000-8000-000000000002', 'NT_GG1', 'Xi măng giảm giá', '7e000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type, credit_limit_vnd) values
  ('7e000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_KHGG', 'Khách giảm giá', 'BUSINESS', 10000000);
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7e000000-0000-4000-8000-000000000005', '7e000000-0000-4000-8000-000000000004', 'CT1', 'Công trình giảm giá', 'Địa chỉ thử');
insert into public.pricing_rules(id, branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('7e000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-00000000000a', 'DEFAULT', '7e000000-0000-4000-8000-000000000003',
   '7e000000-0000-4000-8000-000000000001', 100000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
-- The reader may create orders but not manage prices.
insert into public.role_permissions(role_id, permission_code) values ('40000000-0000-4000-8000-000000000002', 'orders.create');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  customer constant uuid := '7e000000-0000-4000-8000-000000000004';
  site constant uuid := '7e000000-0000-4000-8000-000000000005';
  base_line constant jsonb := jsonb_build_object('material_id', '7e000000-0000-4000-8000-000000000003', 'ordered_uom_id', '7e000000-0000-4000-8000-000000000001',
    'conversion_numerator', '1', 'conversion_denominator', '1', 'rounding_mode', 'HALF_UP', 'unit_price_vnd', '100000',
    'pricing_rule_id', '7e000000-0000-4000-8000-000000000006', 'pricing_rule_version', 1, 'price_source_type', 'LIST', 'override_reason', null);
  -- Line 1: 5 % off (5.000/kg). Line 2: no line discount, 10.000/kg share of the 20.000 order discount.
  discounted jsonb := jsonb_build_array(
    base_line || jsonb_build_object('quantity', '3', 'discount_unit_vnd', '5000', 'discount_mode', 'PERCENT', 'discount_value', '5'),
    base_line || jsonb_build_object('quantity', '2', 'discount_unit_vnd', '10000'));
  order_discount constant jsonb := jsonb_build_object('mode', 'AMOUNT', 'value', '20000');
  op constant uuid := '7e000000-0000-4000-8000-0000000000f1';
  order_id uuid;
  plain_id uuid;
  failed text;
  failed_message text;
begin
  -- Without pricing.manage a discount is refused; the same order without one is accepted.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.create_sales_order_draft(branch, customer, site, null, null, discounted, '7e000000-0000-4000-8000-0000000000e1', order_discount);
  exception when others then failed := sqlstate; failed_message := sqlerrm; end;
  assert failed = '42501' and failed_message = 'discount_requires_permission', format('discount needs pricing.manage, got %s %s', failed, failed_message);
  plain_id := public.create_sales_order_draft(branch, customer, site, null, null, jsonb_build_array(base_line || jsonb_build_object('quantity', '1')), '7e000000-0000-4000-8000-0000000000e2');
  assert (select unit_price_vnd = 100000 and line_total_vnd = 100000 and list_unit_price_vnd is null and discount_unit_vnd = 0
    from public.sales_order_lines where sales_order_id = plain_id), 'an order without discount is unchanged';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- Malformed discounts are refused.
  for failed_message in select unnest(array[
      '{"discount_unit_vnd": "100000"}', '{"discount_unit_vnd": "-1"}', '{"discount_unit_vnd": "0", "discount_mode": "AMOUNT", "discount_value": "10"}',
      '{"discount_unit_vnd": "5000", "discount_mode": "PERCENT", "discount_value": "6"}', '{"discount_unit_vnd": "5000", "discount_mode": "AMOUNT", "discount_value": "5001"}',
      '{"discount_unit_vnd": "5000", "discount_mode": "PERCENT", "discount_value": "100"}', '{"discount_unit_vnd": "5000", "discount_value": "5"}'])
  loop
    failed := null;
    begin perform public.create_sales_order_draft(branch, customer, site, null, null, jsonb_build_array(base_line || jsonb_build_object('quantity', '1') || failed_message::jsonb), gen_random_uuid());
    exception when others then failed := sqlerrm; end;
    assert failed = 'invalid_discount', format('discount %s must be refused, got %s', failed_message, failed);
  end loop;
  failed := null;
  begin perform public.create_sales_order_draft(branch, customer, site, null, null, discounted, gen_random_uuid(), '{"mode": "PERCENT", "value": "100"}');
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_discount', format('100 %% order discount refused, got %s', failed);

  -- The discounted order keeps both prices per line, the typed inputs, and replays.
  order_id := public.create_sales_order_draft(branch, customer, site, null, null, discounted, op, order_discount);
  assert public.create_sales_order_draft(branch, customer, site, null, null, discounted, op, order_discount) = order_id, 'replay';
  failed := null;
  begin perform public.create_sales_order_draft(branch, customer, site, null, null, discounted, op); exception when others then failed := sqlstate; end;
  assert failed = '23505', format('same operation without the order discount conflicts, got %s', failed);
  assert (select order_discount_mode = 'AMOUNT' and order_discount_value = 20000 from public.sales_orders where id = order_id), 'order discount input kept';
  assert (select unit_price_vnd = 95000 and list_unit_price_vnd = 100000 and discount_unit_vnd = 5000 and line_total_vnd = 285000
    and discount_mode = 'PERCENT' and discount_value = 5 from public.sales_order_lines where sales_order_id = order_id and line_number = 1), 'line 1 after 5 %';
  assert (select unit_price_vnd = 90000 and list_unit_price_vnd = 100000 and discount_unit_vnd = 10000 and line_total_vnd = 180000 and discount_mode is null
    from public.sales_order_lines where sales_order_id = order_id and line_number = 2), 'line 2 with its order share';

  -- Confirming holds the customer's credit for the amount after discount.
  perform public.confirm_sales_order(plain_id, '7e000000-0000-4000-8000-0000000000e3');
  perform public.confirm_sales_order(order_id, '7e000000-0000-4000-8000-0000000000e4');
  perform pg_temp.act_as_admin();
  assert (select amount_vnd from public.credit_commitments where sales_order_id = order_id) = 465000, 'credit held after discount';
end
$test$;

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  base_line constant jsonb := jsonb_build_object('material_id', '7e000000-0000-4000-8000-000000000003', 'ordered_uom_id', '7e000000-0000-4000-8000-000000000001',
    'conversion_numerator', '1', 'conversion_denominator', '1', 'rounding_mode', 'HALF_UP', 'unit_price_vnd', '100000',
    'pricing_rule_id', '7e000000-0000-4000-8000-000000000006', 'pricing_rule_version', 1, 'price_source_type', 'LIST', 'override_reason', null);
  order_id uuid;
  line_id uuid;
begin
  -- A draft line keeps its price before discount when edited: dropping the discount brings the list price back.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  order_id := public.create_sales_order_draft(branch, '7e000000-0000-4000-8000-000000000004', '7e000000-0000-4000-8000-000000000005', null, null,
    jsonb_build_array(base_line || jsonb_build_object('quantity', '4', 'discount_unit_vnd', '2500', 'discount_mode', 'AMOUNT', 'discount_value', '2500')),
    '7e000000-0000-4000-8000-0000000000d1', '{"mode": "PERCENT", "value": "2.5"}');
  select id into line_id from public.sales_order_lines where sales_order_id = order_id;
  perform public.update_sales_order_draft(order_id, 1, null, null,
    jsonb_build_array(base_line || jsonb_build_object('quantity', '4', 'source_line_id', line_id)), '7e000000-0000-4000-8000-0000000000d2');
  assert (select unit_price_vnd = 100000 and line_total_vnd = 400000 and list_unit_price_vnd is null and discount_unit_vnd = 0
    from public.sales_order_lines where sales_order_id = order_id), 'discount removed on edit';
  assert (select order_discount_mode is null and order_discount_value is null and draft_version = 2 from public.sales_orders where id = order_id), 'order discount cleared';
  select id into line_id from public.sales_order_lines where sales_order_id = order_id;
  perform public.update_sales_order_draft(order_id, 2, null, null,
    jsonb_build_array(base_line || jsonb_build_object('quantity', '4', 'source_line_id', line_id, 'discount_unit_vnd', '1000')), '7e000000-0000-4000-8000-0000000000d3',
    '{"mode": "AMOUNT", "value": "4000"}');
  assert (select unit_price_vnd = 99000 and line_total_vnd = 396000 and list_unit_price_vnd = 100000 from public.sales_order_lines where sales_order_id = order_id), 'discount added on edit';

  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.create_sales_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid, jsonb)', 'execute'), 'anon cannot create';
  assert not has_function_privilege('anon', 'public.update_sales_order_draft(uuid, integer, timestamptz, text, jsonb, uuid, jsonb)', 'execute'), 'anon cannot update';
  assert has_function_privilege('authenticated', 'public.create_sales_order_draft(uuid, uuid, uuid, timestamptz, text, jsonb, uuid, jsonb)', 'execute'), 'signed-in users can call';
end
$test$;
