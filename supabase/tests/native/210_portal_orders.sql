-- FB3 D15: the customer portal shows only what this customer can buy at its own price ("Còn hàng / Đặt trước", no stock
-- numbers), a submitted order is a DRAFT "Chờ duyệt" priced on the server, the business is told and confirms it with the
-- normal confirm; the customer can cancel while it waits and sees why an order was cancelled.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id, email) values
  ('7f210000-0000-4000-8000-0000000000a1', 'chu210@example.test'),
  ('7f210000-0000-4000-8000-0000000000a2', 'nhan210@example.test'),
  ('7f210000-0000-4000-8000-0000000000a3', 'khac210@example.test');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f210000-0000-4000-8000-000000000001', 'nt_kg210', 'Kilôgam thử 210', 'kg'),
  ('7f210000-0000-4000-8000-000000000002', 'nt_bao210', 'Bao thử 210', 'bao'),
  ('7f210000-0000-4000-8000-000000000003', 'nt_vien210', 'Viên thử 210', 'viên');
insert into public.material_groups(id, code, name) values ('7f210000-0000-4000-8000-000000000005', 'NT_G210', 'Nhóm thử 210');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f210000-0000-4000-8000-000000000010', '7f210000-0000-4000-8000-000000000005', 'NT_XM210', 'Xi măng 210', '7f210000-0000-4000-8000-000000000001'),
  ('7f210000-0000-4000-8000-000000000011', '7f210000-0000-4000-8000-000000000005', 'NT_GA210', 'Gạch 210', '7f210000-0000-4000-8000-000000000003'),
  ('7f210000-0000-4000-8000-000000000012', '7f210000-0000-4000-8000-000000000005', 'NT_CA210', 'Cát 210 không giá', '7f210000-0000-4000-8000-000000000003');
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type) values
  ('7f210000-0000-4000-8000-000000000010', '7f210000-0000-4000-8000-000000000002', '7f210000-0000-4000-8000-000000000001', 50, 1, 'PACKAGING');
insert into public.customer_price_groups(branch_id, code, name) values ('20000000-0000-4000-8000-00000000000a', 'SI210', 'Khách sỉ thử 210');
insert into public.customers(id, branch_id, code, display_name, customer_type, tier_code, credit_limit_vnd) values
  ('7f210000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_KH2101', 'Khách sỉ 210', 'BUSINESS', 'SI210', 100000000),
  ('7f210000-0000-4000-8000-000000000042', '20000000-0000-4000-8000-00000000000a', 'NT_KH2102', 'Khách khác 210', 'BUSINESS', null, null);
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f210000-0000-4000-8000-000000000041', '7f210000-0000-4000-8000-000000000040', 'CT1', 'Công trình 210', 'Địa chỉ 210', 'Anh Nhận', '0901210099'),
  ('7f210000-0000-4000-8000-000000000043', '7f210000-0000-4000-8000-000000000042', 'CT1', 'Công trình khác 210', 'Địa chỉ khác', null, null);
-- Cement: list 90 000 đ/bao, wholesale tier 85 000 đ/bao; bricks 1 300 đ; the other customer has its own 1 000 đ brick price.
insert into public.pricing_rules(branch_id, scope_type, customer_id, material_id, customer_tier_code, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'DEFAULT', null, '7f210000-0000-4000-8000-000000000010', null, '7f210000-0000-4000-8000-000000000002', 90000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'CUSTOMER_TIER', null, '7f210000-0000-4000-8000-000000000010', 'SI210', '7f210000-0000-4000-8000-000000000002', 85000, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'DEFAULT', null, '7f210000-0000-4000-8000-000000000011', null, '7f210000-0000-4000-8000-000000000003', 1300, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'CUSTOMER_MATERIAL', '7f210000-0000-4000-8000-000000000042', '7f210000-0000-4000-8000-000000000011', null, '7f210000-0000-4000-8000-000000000003', 1000, 1, 'CONTRACT', now() - interval '1 day', '10000000-0000-4000-8000-000000000001');
-- 1 000 kg of cement in stock, no bricks.
insert into public.warehouses(id, branch_id, code, name) values ('7f210000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-00000000000a', 'NT_K210', 'Kho 210');
insert into public.stock_counts(id, branch_id, warehouse_id, count_number, state, cutoff_at, created_by) values
  ('7f210000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-00000000000a', '7f210000-0000-4000-8000-000000000020', 'NT-KK-210', 'APPROVED', now(), '10000000-0000-4000-8000-000000000001');
insert into public.stock_count_lines(id, stock_count_id, material_id, expected_base_quantity, counted_base_quantity, adjustment_unit_cost_vnd, reason, recorded_by) values
  ('7f210000-0000-4000-8000-000000000072', '7f210000-0000-4000-8000-000000000070', '7f210000-0000-4000-8000-000000000010', 0, 1000, 1500, 'Tồn đầu thử', '10000000-0000-4000-8000-000000000001');
insert into public.inventory_movements(branch_id, material_id, base_uom_id, location_kind, warehouse_id, movement_type, base_quantity_delta,
  inventory_value_delta_vnd, unit_cost_vnd_per_base, source_stock_count_line_id, occurred_at, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '7f210000-0000-4000-8000-000000000010', '7f210000-0000-4000-8000-000000000001', 'WAREHOUSE', '7f210000-0000-4000-8000-000000000020',
   'STOCK_ADJUSTMENT', 1000, 1500000, 1500, '7f210000-0000-4000-8000-000000000072', now(), '10000000-0000-4000-8000-000000000001');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f210000-0000-4000-8000-0000000000a1', '7f210000-0000-4000-8000-000000000040', 'OWNER'),
  ('7f210000-0000-4000-8000-0000000000a2', '7f210000-0000-4000-8000-000000000040', 'RECEIVER'),
  ('7f210000-0000-4000-8000-0000000000a3', '7f210000-0000-4000-8000-000000000042', 'OWNER');

do $test$
declare
  customer uuid := '7f210000-0000-4000-8000-000000000040';
  site uuid := '7f210000-0000-4000-8000-000000000041';
  cement uuid := '7f210000-0000-4000-8000-000000000010';
  brick uuid := '7f210000-0000-4000-8000-000000000011';
  catalog jsonb;
  items jsonb;
  lines jsonb;
  ordered uuid;
  second uuid;
  detail jsonb;
  failed boolean;
begin
  -- Catalog: own price (tier beats list), sale units only with a price, stock as a flag only.
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a1');
  catalog := public.customer_portal_catalog(null, null, 60);
  items := (select jsonb_agg(i) from jsonb_array_elements(catalog->'items') i where i->>'code' like 'NT_%210');
  assert jsonb_array_length(items) = 2, format('two offers %s', items);
  assert exists (select 1 from jsonb_array_elements(items) i where i->>'code' = 'NT_XM210' and i->>'uom_symbol' = 'bao'
    and i->>'unit_price_vnd' = '85000' and (i->>'in_stock')::boolean), 'cement per bag at the tier price, in stock';
  assert exists (select 1 from jsonb_array_elements(items) i where i->>'code' = 'NT_GA210' and i->>'unit_price_vnd' = '1300'
    and not (i->>'in_stock')::boolean), 'bricks at the list price, ordered in';
  assert position('1000' in (select string_agg(i->>'unit_price_vnd', ',') from jsonb_array_elements(items) i)) = 0, 'no other customer price';
  assert not (catalog::text like '%counted%' or catalog::text like '%cost%'), 'no stock numbers or costs';
  assert catalog->'sites'->0->>'id' = site::text, 'own sites';
  assert jsonb_array_length(public.customer_portal_catalog(null, 'gạch', 60)->'items') >= 1, 'search';

  -- Others cannot read the ordering catalog.
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a2');
  failed := false; begin perform public.customer_portal_catalog(null, null, 60); exception when insufficient_privilege then failed := true; end;
  assert failed, 'receiver cannot order';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := false; begin perform public.customer_portal_catalog(null, null, 60); exception when insufficient_privilege then failed := true; end;
  assert failed, 'employee has no customer';

  -- Submit: priced on the server, DRAFT "Chờ duyệt", replay-safe.
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a1');
  lines := jsonb_build_array(
    jsonb_build_object('material_id', cement, 'ordered_uom_id', '7f210000-0000-4000-8000-000000000002', 'quantity', '10'),
    jsonb_build_object('material_id', brick, 'ordered_uom_id', '7f210000-0000-4000-8000-000000000003', 'quantity', '500', 'unit_price_vnd', 1));
  ordered := public.submit_portal_order(customer, site, null, now() + interval '2 days', lines, 'Giao buổi sáng', '7f210000-0000-4000-8000-0000000000b1');
  assert public.submit_portal_order(customer, site, null, (select requested_delivery_at from public.sales_orders where id = ordered), lines, 'Giao buổi sáng',
    '7f210000-0000-4000-8000-0000000000b1') = ordered, 'replay';
  failed := false;
  begin perform public.submit_portal_order(customer, site, null, null, lines, 'Khác', '7f210000-0000-4000-8000-0000000000b1');
  exception when unique_violation then failed := true; end;
  assert failed, 'same operation, other payload';
  perform pg_temp.act_as_admin();
  assert (select order_channel = 'CUSTOMER_PORTAL' and commercial_state = 'DRAFT' and portal_note = 'Giao buổi sáng'
    and submitted_by = '7f210000-0000-4000-8000-0000000000a1' from public.sales_orders where id = ordered), 'portal draft';
  assert (select array_agg(unit_price_vnd order by line_number) = array[85000, 1300]::bigint[]
    and sum(line_total_vnd) = 850000 + 650000 from public.sales_order_lines where sales_order_id = ordered), 'server prices, not the posted ones';
  assert exists (select 1 from public.notifications n where n.kind = 'order.portal_submitted' and n.entity_id = ordered
    and n.required_permission = 'orders.confirm'), 'business told';

  -- Not someone else's site, not an item without a price for this customer, not a receiver.
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a1');
  failed := false;
  begin perform public.submit_portal_order(customer, '7f210000-0000-4000-8000-000000000043', null, null, lines, null, '7f210000-0000-4000-8000-0000000000b2');
  exception when foreign_key_violation then failed := true; end;
  assert failed, 'site of another customer';
  failed := false;
  begin perform public.submit_portal_order(customer, site, null, null, jsonb_build_array(jsonb_build_object('material_id', '7f210000-0000-4000-8000-000000000012',
    'ordered_uom_id', '7f210000-0000-4000-8000-000000000003', 'quantity', '1')), null, '7f210000-0000-4000-8000-0000000000b3');
  exception when others then failed := sqlerrm = 'portal_price_unavailable'; end;
  assert failed, 'no price';
  failed := false;
  begin perform public.submit_portal_order(customer, site, null, null, jsonb_build_array(jsonb_build_object('material_id', cement,
    'ordered_uom_id', '7f210000-0000-4000-8000-000000000001', 'quantity', '20')), null, '7f210000-0000-4000-8000-0000000000b4');
  exception when others then failed := sqlerrm = 'portal_price_unavailable'; end;
  assert failed, 'no price in kg';
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a2');
  failed := false;
  begin perform public.submit_portal_order(customer, site, null, null, lines, null, '7f210000-0000-4000-8000-0000000000b5');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'receiver cannot order';

  -- A new delivery address becomes a site of the customer.
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a1');
  second := public.submit_portal_order(customer, null, jsonb_build_object('name', 'Nhà mới', 'address', '9 Nguyễn Trãi, Hà Nội', 'receiver_phone', '0901210100'),
    null, jsonb_build_array(lines->0), null, '7f210000-0000-4000-8000-0000000000b6');
  perform pg_temp.act_as_admin();
  assert (select s.name = 'Nhà mới' and s.customer_id = customer and s.code like 'DG-%' from public.sales_orders o join public.customer_sites s on s.id = o.site_id where o.id = second), 'new site';

  -- The customer's view: lines with prices for the owner, without for the receiver; may still cancel.
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a1');
  detail := public.customer_portal_order(ordered);
  assert detail->>'channel' = 'CUSTOMER_PORTAL' and (detail->>'can_cancel')::boolean and detail->>'portal_note' = 'Giao buổi sáng'
    and jsonb_array_length(detail->'lines') = 2 and detail->'lines'->0->>'unit_price_vnd' = '85000' and detail->'lines'->0->>'uom_symbol' = 'bao', format('owner view %s', detail);
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a2');
  detail := public.customer_portal_order(ordered);
  assert not (detail->>'can_cancel')::boolean and not (detail->'lines'->0 ? 'unit_price_vnd'), 'receiver view';
  failed := false;
  begin perform public.cancel_portal_order(ordered, 'Không cần nữa', '7f210000-0000-4000-8000-0000000000c1');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'receiver cannot cancel';
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a3');
  failed := false;
  begin perform public.cancel_portal_order(ordered, 'Không cần nữa', '7f210000-0000-4000-8000-0000000000c2');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'other customer cannot cancel';

  -- Owner cancels the first; the reason shows on the order.
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a1');
  perform public.cancel_portal_order(ordered, 'Đặt nhầm số lượng', '7f210000-0000-4000-8000-0000000000c3');
  assert public.cancel_portal_order(ordered, 'Đặt nhầm số lượng', '7f210000-0000-4000-8000-0000000000c3') = ordered, 'cancel replay';
  detail := public.customer_portal_order(ordered);
  assert detail->>'state' = 'CANCELLED' and detail->>'cancel_reason' = 'Khách hủy: Đặt nhầm số lượng' and not (detail->>'can_cancel')::boolean, format('cancelled %s', detail);
  failed := false;
  begin perform public.cancel_portal_order(ordered, 'Lần nữa', '7f210000-0000-4000-8000-0000000000c4');
  exception when check_violation then failed := true; end;
  assert failed, 'already cancelled';

  -- The business approves the second with the normal confirm; the customer can no longer cancel it.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.confirm_sales_order(second, '7f210000-0000-4000-8000-0000000000d1');
  perform pg_temp.act_as('7f210000-0000-4000-8000-0000000000a1');
  detail := public.customer_portal_order(second);
  assert detail->>'state' = 'CONFIRMED' and not (detail->>'can_cancel')::boolean, 'approved';
  failed := false;
  begin perform public.cancel_portal_order(second, 'Muốn hủy', '7f210000-0000-4000-8000-0000000000c5');
  exception when check_violation then failed := true; end;
  assert failed, 'approved order is not cancelled from the portal';
  assert (select count(*) from jsonb_array_elements(public.customer_portal_snapshot(null)->'orders') o where o->>'channel' = 'CUSTOMER_PORTAL') = 2, 'listed with channel';

  -- Anonymous callers have no access at all.
  perform pg_temp.act_as_admin();
  set local role anon;
  failed := false; begin perform public.customer_portal_catalog(null, null, 60); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon catalog';
  failed := false; begin perform public.submit_portal_order(customer, site, null, null, lines, null, gen_random_uuid()); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon submit';
  reset role;
end
$test$;
