-- D98 (Owner 17/11/2026): "Báo cáo hàng đã đặt" of the customer portal (public.customer_portal_ordered_report), the 08:46 summary
-- push (private.customer_daily_order_summary), its built-in switch, the schedule and the snapshot order (newest first).
-- Customer K (branch A): Chủ tài khoản a1, Kế toán a2, Người nhận hàng a3, a6 (inactive). K2: owner a4. K3: owner a5 (only a cancelled order).
-- Days are Vietnam days: 2026-11-10 is "the day"; L3 was created at 00:30 on 10/11 Vietnam time (17:30 UTC on 09/11).
insert into auth.users(id) values
  ('7f390000-0000-4000-8000-0000000000a1'), ('7f390000-0000-4000-8000-0000000000a2'), ('7f390000-0000-4000-8000-0000000000a3'),
  ('7f390000-0000-4000-8000-0000000000a4'), ('7f390000-0000-4000-8000-0000000000a5'), ('7f390000-0000-4000-8000-0000000000a6');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f390000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'NT_K390A', 'Khách 390 A', 'BUSINESS'),
  ('7f390000-0000-4000-8000-000000000042', '20000000-0000-4000-8000-00000000000a', 'NT_K390B', 'Khách 390 B', 'BUSINESS'),
  ('7f390000-0000-4000-8000-000000000043', '20000000-0000-4000-8000-00000000000a', 'NT_K390C', 'Khách 390 C', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role, active, revoked_at) values
  ('7f390000-0000-4000-8000-0000000000a1', '7f390000-0000-4000-8000-000000000041', 'OWNER', true, null),
  ('7f390000-0000-4000-8000-0000000000a2', '7f390000-0000-4000-8000-000000000041', 'FINANCE_CONTACT', true, null),
  ('7f390000-0000-4000-8000-0000000000a3', '7f390000-0000-4000-8000-000000000041', 'RECEIVER', true, null),
  ('7f390000-0000-4000-8000-0000000000a6', '7f390000-0000-4000-8000-000000000041', 'OWNER', false, now()),
  ('7f390000-0000-4000-8000-0000000000a4', '7f390000-0000-4000-8000-000000000042', 'OWNER', true, null),
  ('7f390000-0000-4000-8000-0000000000a5', '7f390000-0000-4000-8000-000000000043', 'OWNER', true, null);
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f390000-0000-4000-8000-000000000051', '7f390000-0000-4000-8000-000000000041', 'CT390A', 'Công trình 390 A', 'Thủ Đức'),
  ('7f390000-0000-4000-8000-000000000052', '7f390000-0000-4000-8000-000000000042', 'CT390B', 'Công trình 390 B', 'Quận 9'),
  ('7f390000-0000-4000-8000-000000000053', '7f390000-0000-4000-8000-000000000043', 'CT390C', 'Công trình 390 C', 'Quận 7');
-- One device per login: d1 Chủ tài khoản, d2 Kế toán, d3 Người nhận hàng, d4 owner of K2, d5 owner of K3.
insert into public.push_subscriptions(id, auth_user_id, endpoint, p256dh, auth_secret) values
  ('7f390000-0000-4000-8000-0000000000d1', '7f390000-0000-4000-8000-0000000000a1', 'https://push.example.test/390-1', repeat('p', 40), repeat('a', 16)),
  ('7f390000-0000-4000-8000-0000000000d2', '7f390000-0000-4000-8000-0000000000a2', 'https://push.example.test/390-2', repeat('p', 40), repeat('a', 16)),
  ('7f390000-0000-4000-8000-0000000000d3', '7f390000-0000-4000-8000-0000000000a3', 'https://push.example.test/390-3', repeat('p', 40), repeat('a', 16)),
  ('7f390000-0000-4000-8000-0000000000d4', '7f390000-0000-4000-8000-0000000000a4', 'https://push.example.test/390-4', repeat('p', 40), repeat('a', 16)),
  ('7f390000-0000-4000-8000-0000000000d5', '7f390000-0000-4000-8000-0000000000a5', 'https://push.example.test/390-5', repeat('p', 40), repeat('a', 16));

-- Catalogue: Cát đen / Sỏi 1x2 in "xe"; Gạch đặc in "viên"; Xi măng PC30 sold in "bao" (1 bao = 50 kg, the base unit).
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f390000-0000-4000-8000-000000000001', 'nt_xe390', 'Xe thử 390', 'xe'), ('7f390000-0000-4000-8000-000000000002', 'nt_vien390', 'Viên thử 390', 'viên'),
  ('7f390000-0000-4000-8000-000000000003', 'nt_bao390', 'Bao thử 390', 'bao'), ('7f390000-0000-4000-8000-000000000004', 'nt_kg390', 'Kilôgam thử 390', 'kg');
insert into public.material_groups(id, code, name) values ('7f390000-0000-4000-8000-000000000005', 'NT_G390', 'Nhóm thử 390');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f390000-0000-4000-8000-000000000011', '7f390000-0000-4000-8000-000000000005', 'NT_CAT390', 'Cát đen', '7f390000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000012', '7f390000-0000-4000-8000-000000000005', 'NT_GACH390', 'Gạch đặc', '7f390000-0000-4000-8000-000000000002'),
  ('7f390000-0000-4000-8000-000000000013', '7f390000-0000-4000-8000-000000000005', 'NT_SOI390', 'Sỏi 1x2', '7f390000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000014', '7f390000-0000-4000-8000-000000000005', 'NT_XM390', 'Xi măng PC30', '7f390000-0000-4000-8000-000000000004');

-- Orders, lines, deliveries, service jobs: fixtures only (no triggers).
set local session_replication_role = replica;
-- Ids increase the OLDER the order is, so the old "order by id desc" would list the oldest first.
-- 101 O2 next day 00:00 · 102 C cancelled · 103 P portal (waiting for approval) · 104 L2 · 105 L1 · 106 L3 · 107 O day before.
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, order_channel, commercial_terms,
  customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by, created_at) values
  ('7f390000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-00000000000a', 'SO-390-O2', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'CONFIRMED', 'INTERNAL', 'Sổ 11.26 dòng 9 · Nhập theo sổ bán hàng', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', '2026-11-10 17:00:00+00'),
  ('7f390000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-00000000000a', 'SO-390-C', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'CANCELLED', 'INTERNAL', null, 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', '2026-11-10 05:00:00+00'),
  ('7f390000-0000-4000-8000-000000000103', '20000000-0000-4000-8000-00000000000a', 'SO-390-P', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'DRAFT', 'CUSTOMER_PORTAL', null, 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '7f390000-0000-4000-8000-0000000000a1', '2026-11-10 04:00:00+00'),
  ('7f390000-0000-4000-8000-000000000104', '20000000-0000-4000-8000-00000000000a', 'SO-390-L2', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'CONFIRMED', 'INTERNAL', 'Sổ 11.26 dòng 2 · Nhập theo sổ bán hàng', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', '2026-11-10 02:00:00+00'),
  ('7f390000-0000-4000-8000-000000000105', '20000000-0000-4000-8000-00000000000a', 'SO-390-L1', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'CONFIRMED', 'INTERNAL', 'Sổ 11.26 dòng 1 · Nhập theo sổ bán hàng', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', '2026-11-10 01:00:00+00'),
  ('7f390000-0000-4000-8000-000000000106', '20000000-0000-4000-8000-00000000000a', 'SO-390-L3', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'CONFIRMED', 'INTERNAL', 'Sổ 11.26 dòng 3 · Nhập theo sổ bán hàng', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', '2026-11-09 17:30:00+00'),
  ('7f390000-0000-4000-8000-000000000107', '20000000-0000-4000-8000-00000000000a', 'SO-390-O', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'CONFIRMED', 'INTERNAL', null, 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', '2026-11-09 05:00:00+00'),
  ('7f390000-0000-4000-8000-000000000108', '20000000-0000-4000-8000-00000000000a', 'SO-390-K2', '7f390000-0000-4000-8000-000000000042', '7f390000-0000-4000-8000-000000000052',
   'CONFIRMED', 'INTERNAL', null, 'Khách 390 B', 'Công trình 390 B', 'Quận 9', '10000000-0000-4000-8000-000000000001', '2026-11-10 03:00:00+00'),
  ('7f390000-0000-4000-8000-000000000109', '20000000-0000-4000-8000-00000000000a', 'SO-390-K3', '7f390000-0000-4000-8000-000000000043', '7f390000-0000-4000-8000-000000000053',
   'CANCELLED', 'INTERNAL', null, 'Khách 390 C', 'Công trình 390 C', 'Quận 7', '10000000-0000-4000-8000-000000000001', '2026-11-10 03:00:00+00');
insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
  conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason) values
  ('7f390000-0000-4000-8000-000000000201', '7f390000-0000-4000-8000-000000000101', 1, '7f390000-0000-4000-8000-000000000014', 'Xi măng PC30', '7f390000-0000-4000-8000-000000000003', '7f390000-0000-4000-8000-000000000004', 1, 50, 1, 'HALF_UP', 120000, 120000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-000000000202', '7f390000-0000-4000-8000-000000000102', 1, '7f390000-0000-4000-8000-000000000011', 'Cát đen', '7f390000-0000-4000-8000-000000000001', '7f390000-0000-4000-8000-000000000001', 5, 1, 1, 'HALF_UP', 1000000, 5000000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-000000000203', '7f390000-0000-4000-8000-000000000103', 1, '7f390000-0000-4000-8000-000000000011', 'Cát đen', '7f390000-0000-4000-8000-000000000001', '7f390000-0000-4000-8000-000000000001', 1.5, 1, 1, 'HALF_UP', 1000000, 1500000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-000000000204', '7f390000-0000-4000-8000-000000000103', 2, '7f390000-0000-4000-8000-000000000013', 'Sỏi 1x2', '7f390000-0000-4000-8000-000000000001', '7f390000-0000-4000-8000-000000000001', 3, 1, 1, 'HALF_UP', 600000, 1800000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-000000000205', '7f390000-0000-4000-8000-000000000104', 1, '7f390000-0000-4000-8000-000000000012', 'Gạch đặc', '7f390000-0000-4000-8000-000000000002', '7f390000-0000-4000-8000-000000000002', 1000, 1, 1, 'HALF_UP', 2000, 2000000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-000000000206', '7f390000-0000-4000-8000-000000000105', 1, '7f390000-0000-4000-8000-000000000011', 'Cát đen', '7f390000-0000-4000-8000-000000000001', '7f390000-0000-4000-8000-000000000001', 1, 1, 1, 'HALF_UP', 1000000, 1000000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-000000000207', '7f390000-0000-4000-8000-000000000106', 1, '7f390000-0000-4000-8000-000000000014', 'Xi măng PC30', '7f390000-0000-4000-8000-000000000003', '7f390000-0000-4000-8000-000000000004', 10, 50, 1, 'HALF_UP', 120000, 1200000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-000000000208', '7f390000-0000-4000-8000-000000000107', 1, '7f390000-0000-4000-8000-000000000012', 'Gạch đặc', '7f390000-0000-4000-8000-000000000002', '7f390000-0000-4000-8000-000000000002', 500, 1, 1, 'HALF_UP', 2000, 1000000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-000000000209', '7f390000-0000-4000-8000-000000000108', 1, '7f390000-0000-4000-8000-000000000011', 'Cát đen', '7f390000-0000-4000-8000-000000000001', '7f390000-0000-4000-8000-000000000001', 4, 1, 1, 'HALF_UP', 1000000, 4000000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử'),
  ('7f390000-0000-4000-8000-00000000020a', '7f390000-0000-4000-8000-000000000109', 1, '7f390000-0000-4000-8000-000000000011', 'Cát đen', '7f390000-0000-4000-8000-000000000001', '7f390000-0000-4000-8000-000000000001', 1, 1, 1, 'HALF_UP', 1000000, 1000000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử');

-- Deliveries: 301 Gạch 600/1000 (VERIFIED) · 302 Xi măng 250 kg = 5 bao (VERIFIED) · 303 Cát đen L1 1 xe (VERIFIED)
-- · 304 Sỏi 3 xe (VERIFIED) · 305 Xi măng 250 kg planned only (RESULT_SUBMITTED: NOT counted).
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, execution_state, result_kind, customer_id, site_id, customer_name_snapshot,
  site_name_snapshot, delivery_address_snapshot, created_by, verified_at) values
  ('7f390000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-00000000000a', '7f390000-0000-4000-8000-000000000104', 'DLV-39001', 'VERIFIED', 'PARTIAL', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', now()),
  ('7f390000-0000-4000-8000-000000000302', '20000000-0000-4000-8000-00000000000a', '7f390000-0000-4000-8000-000000000106', 'DLV-39002', 'VERIFIED', 'PARTIAL', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', now()),
  ('7f390000-0000-4000-8000-000000000303', '20000000-0000-4000-8000-00000000000a', '7f390000-0000-4000-8000-000000000105', 'DLV-39003', 'VERIFIED', 'FULL', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', now()),
  ('7f390000-0000-4000-8000-000000000304', '20000000-0000-4000-8000-00000000000a', '7f390000-0000-4000-8000-000000000103', 'DLV-39004', 'VERIFIED', 'FULL', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', now()),
  ('7f390000-0000-4000-8000-000000000305', '20000000-0000-4000-8000-00000000000a', '7f390000-0000-4000-8000-000000000106', 'DLV-39005', 'RESULT_SUBMITTED', 'PARTIAL', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051', 'Khách 390 A', 'Công trình 390 A', 'Thủ Đức', '10000000-0000-4000-8000-000000000001', null);
insert into public.delivery_lines(id, delivery_id, sales_order_line_id, supply_allocation_id, material_id, base_uom_id, source_mode, planned_base_quantity,
  conversion_numerator, conversion_denominator, unit_price_vnd) values
  ('7f390000-0000-4000-8000-000000000401', '7f390000-0000-4000-8000-000000000301', '7f390000-0000-4000-8000-000000000205', gen_random_uuid(), '7f390000-0000-4000-8000-000000000012', '7f390000-0000-4000-8000-000000000002', 'SUPPLIER_DIRECT', 1000, 1, 1, 2000),
  ('7f390000-0000-4000-8000-000000000402', '7f390000-0000-4000-8000-000000000302', '7f390000-0000-4000-8000-000000000207', gen_random_uuid(), '7f390000-0000-4000-8000-000000000014', '7f390000-0000-4000-8000-000000000004', 'SUPPLIER_DIRECT', 250, 50, 1, 2400),
  ('7f390000-0000-4000-8000-000000000403', '7f390000-0000-4000-8000-000000000303', '7f390000-0000-4000-8000-000000000206', gen_random_uuid(), '7f390000-0000-4000-8000-000000000011', '7f390000-0000-4000-8000-000000000001', 'SUPPLIER_DIRECT', 1, 1, 1, 1000000),
  ('7f390000-0000-4000-8000-000000000404', '7f390000-0000-4000-8000-000000000304', '7f390000-0000-4000-8000-000000000204', gen_random_uuid(), '7f390000-0000-4000-8000-000000000013', '7f390000-0000-4000-8000-000000000001', 'SUPPLIER_DIRECT', 3, 1, 1, 600000),
  ('7f390000-0000-4000-8000-000000000405', '7f390000-0000-4000-8000-000000000305', '7f390000-0000-4000-8000-000000000207', gen_random_uuid(), '7f390000-0000-4000-8000-000000000014', '7f390000-0000-4000-8000-000000000004', 'SUPPLIER_DIRECT', 250, 50, 1, 2400);
insert into public.delivery_results(id, delivery_id, result_kind, submitted_by) values
  ('7f390000-0000-4000-8000-000000000501', '7f390000-0000-4000-8000-000000000301', 'PARTIAL', '10000000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000502', '7f390000-0000-4000-8000-000000000302', 'PARTIAL', '10000000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000503', '7f390000-0000-4000-8000-000000000303', 'FULL', '10000000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000504', '7f390000-0000-4000-8000-000000000304', 'FULL', '10000000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000505', '7f390000-0000-4000-8000-000000000305', 'PARTIAL', '10000000-0000-4000-8000-000000000001');
insert into public.delivery_verifications(id, delivery_id, delivery_result_id, verified_by) values
  ('7f390000-0000-4000-8000-000000000601', '7f390000-0000-4000-8000-000000000301', '7f390000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000602', '7f390000-0000-4000-8000-000000000302', '7f390000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000603', '7f390000-0000-4000-8000-000000000303', '7f390000-0000-4000-8000-000000000503', '10000000-0000-4000-8000-000000000001'),
  ('7f390000-0000-4000-8000-000000000604', '7f390000-0000-4000-8000-000000000304', '7f390000-0000-4000-8000-000000000504', '10000000-0000-4000-8000-000000000001');
insert into public.delivery_verification_lines(delivery_verification_id, delivery_line_id, actual_base_quantity, accepted_base_quantity, billable_base_quantity, receivable_amount_vnd) values
  ('7f390000-0000-4000-8000-000000000601', '7f390000-0000-4000-8000-000000000401', 600, 600, 600, 1200000),
  ('7f390000-0000-4000-8000-000000000602', '7f390000-0000-4000-8000-000000000402', 250, 250, 250, 600000),
  ('7f390000-0000-4000-8000-000000000603', '7f390000-0000-4000-8000-000000000403', 1, 1, 1, 1000000),
  ('7f390000-0000-4000-8000-000000000604', '7f390000-0000-4000-8000-000000000404', 3, 3, 3, 1800000);

-- Service jobs of K: 801 scheduled (day) · 802 verified 3 "ca" = 900.000 (day, created later) · 803 cancelled (day) · 804 the day before.
insert into public.service_jobs(id, branch_id, job_number, customer_id, site_id, service_type, description, scheduled_start, scheduled_end, planned_quantity,
  unit_label, execution_state, created_by, created_at, verified_at) values
  ('7f390000-0000-4000-8000-000000000801', '20000000-0000-4000-8000-00000000000a', 'SJ-390-1', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'Máy xúc', 'Đào móng', '2026-11-12 01:00:00+00', '2026-11-12 05:00:00+00', 2, 'ca', 'SCHEDULED', '10000000-0000-4000-8000-000000000001', '2026-11-10 06:00:00+00', null),
  ('7f390000-0000-4000-8000-000000000802', '20000000-0000-4000-8000-00000000000a', 'SJ-390-2', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'Vận chuyển', 'Chở đất', '2026-11-11 01:00:00+00', '2026-11-11 05:00:00+00', 4, 'chuyến', 'VERIFIED', '10000000-0000-4000-8000-000000000001', '2026-11-10 07:00:00+00', now()),
  ('7f390000-0000-4000-8000-000000000803', '20000000-0000-4000-8000-00000000000a', 'SJ-390-3', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'Dọn bãi', 'Dọn dẹp', '2026-11-11 01:00:00+00', '2026-11-11 05:00:00+00', 1, 'công', 'CANCELLED', '10000000-0000-4000-8000-000000000001', '2026-11-10 08:00:00+00', null),
  ('7f390000-0000-4000-8000-000000000804', '20000000-0000-4000-8000-00000000000a', 'SJ-390-4', '7f390000-0000-4000-8000-000000000041', '7f390000-0000-4000-8000-000000000051',
   'San móng', 'San nền', '2026-11-11 01:00:00+00', '2026-11-11 05:00:00+00', 1, 'công', 'SCHEDULED', '10000000-0000-4000-8000-000000000001', '2026-11-09 06:00:00+00', null);
insert into public.service_verifications(service_job_id, work_item_id, result_id, actual_quantity, billable_quantity, compensable_quantity, billable_amount_vnd, verified_by) values
  ('7f390000-0000-4000-8000-000000000802', gen_random_uuid(), gen_random_uuid(), 3, 3, 3, 900000, '10000000-0000-4000-8000-000000000001');
set local session_replication_role = origin;

do $test$
declare
  k constant uuid := '7f390000-0000-4000-8000-000000000041';
  k2 constant uuid := '7f390000-0000-4000-8000-000000000042';
  k3 constant uuid := '7f390000-0000-4000-8000-000000000043';
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  staff constant uuid := '10000000-0000-4000-8000-000000000001';
  a1 constant uuid := '7f390000-0000-4000-8000-0000000000a1';
  a2 constant uuid := '7f390000-0000-4000-8000-0000000000a2';
  a3 constant uuid := '7f390000-0000-4000-8000-0000000000a3';
  a4 constant uuid := '7f390000-0000-4000-8000-0000000000a4';
  a6 constant uuid := '7f390000-0000-4000-8000-0000000000a6';
  r jsonb;
  g jsonb;
  failed text;
  code text;
  made integer;
  before_jobs integer;
  one_day constant date := '2026-11-10';
begin
  -- 1. One day, Chủ tài khoản: 4 live orders (L1, L2, L3 by Vietnam day, P waiting for approval), 1 cancelled counted apart.
  perform pg_temp.act_as(a1);
  r := public.customer_portal_ordered_report(k, one_day, one_day);
  assert r->>'from' = '2026-11-10' and r->>'to' = '2026-11-10' and r->>'role' = 'OWNER' and (r->>'show_money')::boolean, 'header';
  assert (r->>'generated_at')::timestamptz is not null, 'generated_at is a timestamp';
  assert (r->>'order_count')::integer = 4, format('4 live orders, got %s', r->>'order_count');
  assert (r->>'cancelled_count')::integer = 1, 'the cancelled order is counted apart';
  assert (r->>'material_kinds')::integer = 4, '4 kinds of goods';
  assert (r->>'delivered_kinds')::integer = 1, 'only Sỏi 1x2 is delivered in full';
  assert r->>'total_vnd' = '7500000', format('total of the live orders, got %s', r->>'total_vnd');
  assert jsonb_array_length(r->'goods') = 4, 'goods grouped by material + unit';
  assert (select array_agg(x->>'name' order by n) from jsonb_array_elements(r->'goods') with ordinality t(x, n)) = array['Cát đen', 'Gạch đặc', 'Sỏi 1x2', 'Xi măng PC30'], 'goods sorted by name';
  -- Cát đen: the ledger order (1 xe) and the portal order (1,5 xe) merge into 2,5 xe; 1 xe of it delivered.
  g := r->'goods'->0;
  assert g->>'material_id' = '7f390000-0000-4000-8000-000000000011' and g->>'uom_symbol' = 'xe', 'Cát đen in xe';
  assert g->>'ordered_qty' = '2.5' and g->>'delivered_qty' = '1' and g->>'remaining_qty' = '1.5' and g->>'amount_vnd' = '2500000', format('Cát đen merged, got %s', g);
  assert jsonb_array_length(g->'orders') = 2 and g->'orders'->0->>'order_number' = 'SO-390-P' and g->'orders'->0->>'quantity' = '1.5'
    and g->'orders'->0->>'state' = 'DRAFT' and g->'orders'->0->>'day' = '2026-11-10' and g->'orders'->0->>'order_id' = '7f390000-0000-4000-8000-000000000103', 'newest order first, portal order waiting';
  assert g->'orders'->1->>'order_number' = 'SO-390-L1' and g->'orders'->1->>'quantity' = '1' and g->'orders'->1->>'state' = 'CONFIRMED', 'the ledger order behind it';
  -- The cancelled Cát đen order (5 xe) is nowhere.
  assert not (r::text like '%SO-390-C%'), 'cancelled order not listed';
  g := r->'goods'->1;
  assert g->>'name' = 'Gạch đặc' and g->>'ordered_qty' = '1000' and g->>'delivered_qty' = '600' and g->>'remaining_qty' = '400' and g->>'amount_vnd' = '2000000', 'Gạch: 600 of 1000 delivered';
  g := r->'goods'->2;
  assert g->>'name' = 'Sỏi 1x2' and g->>'ordered_qty' = '3' and g->>'delivered_qty' = '3' and g->>'remaining_qty' = '0' and g->>'amount_vnd' = '1800000', 'Sỏi delivered in full';
  -- Xi măng: ordered 10 bao, 250 kg verified = 5 bao; the planned (not verified) delivery counts for nothing.
  g := r->'goods'->3;
  assert g->>'name' = 'Xi măng PC30' and g->>'uom_symbol' = 'bao' and g->>'ordered_qty' = '10' and g->>'delivered_qty' = '5' and g->>'remaining_qty' = '5'
    and g->>'amount_vnd' = '1200000', format('Xi măng converted back to bao, got %s', g);
  assert g->'orders'->0->>'day' = '2026-11-10' and g->'orders'->0->>'order_number' = 'SO-390-L3', 'the day of an order is its Vietnam day (00:30 on 10/11)';
  assert jsonb_array_length(r->'days') = 1 and r->'days'->0->>'day' = '2026-11-10' and (r->'days'->0->>'order_count')::integer = 4 and r->'days'->0->>'amount_vnd' = '7500000', 'one day';
  -- Services of the day: verified job (3 chuyến = 900.000) first (created later), the scheduled one, not the cancelled one nor the day before.
  assert jsonb_array_length(r->'services') = 2, 'services of the day without the cancelled one';
  assert r->'services'->0->>'service_job_id' = '7f390000-0000-4000-8000-000000000802' and r->'services'->0->>'name' = 'Vận chuyển' and r->'services'->0->>'unit_label' = 'chuyến'
    and r->'services'->0->>'quantity' = '3' and r->'services'->0->>'day' = '2026-11-10' and r->'services'->0->>'amount_vnd' = '900000', format('verified job, got %s', r->'services'->0);
  assert r->'services'->1->>'name' = 'Máy xúc' and r->'services'->1->>'quantity' = '2' and r->'services'->1->>'amount_vnd' = '0', 'scheduled job: planned quantity, no money yet';

  -- 2. Several days: 9/11 .. 11/11, newest day first; same goods merge across days.
  r := public.customer_portal_ordered_report(k, '2026-11-09', '2026-11-11');
  assert (r->>'order_count')::integer = 6 and (r->>'cancelled_count')::integer = 1 and r->>'total_vnd' = '8620000', format('three days, got %s', r);
  assert (select array_agg(x->>'day' order by n) from jsonb_array_elements(r->'days') with ordinality t(x, n)) = array['2026-11-11', '2026-11-10', '2026-11-09'], 'days newest first';
  assert r->'days'->0->>'amount_vnd' = '120000' and (r->'days'->0->>'order_count')::integer = 1 and r->'days'->2->>'amount_vnd' = '1000000' and (r->'days'->2->>'order_count')::integer = 1, 'per day amounts';
  assert jsonb_array_length(r->'goods') = 4, 'still 4 goods';
  g := r->'goods'->1;
  assert g->>'name' = 'Gạch đặc' and g->>'ordered_qty' = '1500' and g->>'delivered_qty' = '600' and g->>'remaining_qty' = '900' and jsonb_array_length(g->'orders') = 2, 'Gạch of two days merged';
  g := r->'goods'->3;
  assert g->>'ordered_qty' = '11' and g->>'delivered_qty' = '5' and g->>'remaining_qty' = '6' and g->'orders'->0->>'day' = '2026-11-11', 'Xi măng of two days merged';
  assert jsonb_array_length(r->'services') = 3, 'services of the three days (not the cancelled one)';
  -- A day with nothing.
  r := public.customer_portal_ordered_report(k, '2026-11-01', '2026-11-02');
  assert (r->>'order_count')::integer = 0 and r->'goods' = '[]'::jsonb and r->'days' = '[]'::jsonb and r->'services' = '[]'::jsonb and r->>'total_vnd' = '0', 'empty period';

  -- 3. "Kế toán" sees money too; "Người nhận hàng" sees goods and quantities only: no money key anywhere.
  perform pg_temp.act_as(a2);
  r := public.customer_portal_ordered_report(k, one_day, one_day);
  assert r->>'role' = 'FINANCE_CONTACT' and (r->>'show_money')::boolean and r->>'total_vnd' = '7500000', 'finance contact sees money';
  perform pg_temp.act_as(a3);
  r := public.customer_portal_ordered_report(k, one_day, one_day);
  assert r->>'role' = 'RECEIVER' and not (r->>'show_money')::boolean, 'receiver: no money';
  assert (r->>'order_count')::integer = 4 and jsonb_array_length(r->'goods') = 4 and r->'goods'->0->>'ordered_qty' = '2.5' and r->'goods'->3->>'delivered_qty' = '5', 'receiver still sees the goods';
  assert r::text not like '%amount_vnd%' and r::text not like '%total_vnd%' and r::text not like '%_vnd%', format('no money key at all, got %s', r);
  assert not (r ? 'total_vnd') and not (r->'goods'->0 ? 'amount_vnd') and not (r->'days'->0 ? 'amount_vnd') and not (r->'services'->0 ? 'amount_vnd'), 'keys absent in goods, days, services';
  assert jsonb_array_length(r->'services') = 2 and r->'services'->0->>'quantity' = '3', 'receiver sees the service jobs without money';
  r := public.customer_portal_ordered_report(k, '2026-11-09', '2026-11-11');
  assert r::text not like '%_vnd%', 'no money in a long period either';

  -- 4. Who may ask: another customer's login, a login of staff, an inactive membership, nobody.
  perform pg_temp.act_as(a4);
  begin perform public.customer_portal_ordered_report(k, one_day, one_day); exception when insufficient_privilege then failed := sqlerrm; end;
  assert failed = 'forbidden', format('another customer: forbidden, got %s', failed);
  failed := null;
  perform pg_temp.act_as(staff);
  begin perform public.customer_portal_ordered_report(k, one_day, one_day); exception when insufficient_privilege then failed := sqlerrm; end;
  assert failed = 'forbidden', 'staff login without a membership: forbidden';
  failed := null;
  perform pg_temp.act_as(a6);
  begin perform public.customer_portal_ordered_report(k, one_day, one_day); exception when insufficient_privilege then failed := sqlerrm; end;
  assert failed = 'forbidden', 'inactive membership: forbidden';
  failed := null;
  perform pg_temp.act_as(a4);
  assert (public.customer_portal_ordered_report(k2, one_day, one_day)->>'order_count')::integer = 1 and public.customer_portal_ordered_report(k2, one_day, one_day)->>'total_vnd' = '4000000', 'K2 sees only its own order';
  perform pg_temp.act_as_admin();
  perform set_config('role', 'anon', true);
  begin perform public.customer_portal_ordered_report(k, one_day, one_day); exception when insufficient_privilege then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed like 'permission denied for function%', format('anon is stopped at the privilege, got %s', failed);
  failed := null;
  assert not has_function_privilege('anon', 'public.customer_portal_ordered_report(uuid, date, date)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.customer_portal_ordered_report(uuid, date, date)', 'EXECUTE'), 'grants: authenticated only';
  assert not has_function_privilege('authenticated', 'private.customer_ordered_report(uuid, date, date, boolean, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.customer_daily_order_summary(date)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.customer_daily_order_summary(date)', 'EXECUTE'), 'the private functions are closed';

  -- 5. The period: from after to, more than 92 days, nothing given.
  perform pg_temp.act_as(a1);
  assert (public.customer_portal_ordered_report(k, '2026-08-11', '2026-11-10')->>'order_count')::integer = 5, '92 days (11/08 .. 10/11) are allowed';
  foreach code in array array['2026-11-11/2026-11-10', '2026-08-10/2026-11-10', '/2026-11-10', '2026-11-10/', '/'] loop
    failed := null;
    begin perform public.customer_portal_ordered_report(k, nullif(split_part(code, '/', 1), '')::date, nullif(split_part(code, '/', 2), '')::date);
    exception when invalid_parameter_value then failed := sqlerrm; end;
    assert failed = 'invalid_report_period', format('period %s refused, got %s', code, failed);
  end loop;
  failed := null;
  begin perform public.customer_portal_ordered_report(null, one_day, one_day); exception when invalid_parameter_value then failed := sqlerrm; end;
  assert failed = 'invalid_report_period', 'no customer given';
  failed := null;

  -- 6. The snapshot lists the orders newest first (ids were made to run the other way round).
  r := public.customer_portal_snapshot(k);
  assert (select array_agg(x->>'number' order by n) from jsonb_array_elements(r->'orders') with ordinality t(x, n))
    = array['SO-390-O2', 'SO-390-C', 'SO-390-P', 'SO-390-L2', 'SO-390-L1', 'SO-390-L3', 'SO-390-O'], 'snapshot orders: newest creation time first';
  assert r->>'membership_role' = 'OWNER' and (r->>'can_view_debt')::boolean and r->'debt' is not null, 'the rest of the snapshot is unchanged';
  perform pg_temp.act_as(a3);
  assert public.customer_portal_snapshot(k)->'debt' = 'null'::jsonb and not (public.customer_portal_snapshot(k)->>'can_view_debt')::boolean, 'receiver: still no debt';

  -- 7. The morning summary for 10/11: one push per customer with a live order that day, ledger orders included.
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:%') = 0, 'nothing queued yet';
  made := private.customer_daily_order_summary(one_day);
  assert made = 2, format('K and K2 are told, K3 (only a cancelled order) is not, got %s', made);
  assert (select count(*) from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:' || k || ':2026-11-10:%') = 3, 'K: three devices (owner, finance, receiver)';
  assert (select count(*) from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:' || k2 || ':2026-11-10:%') = 1, 'K2: its owner device';
  assert not exists (select 1 from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:' || k3 || ':%'), 'K3 gets nothing';
  assert (select count(distinct payload->>'title') from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:%') = 1
    and (select payload->>'title' from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:' || k || ':%' limit 1) = 'Hàng anh/chị đặt ngày 10/11', 'title with the day';
  -- Money roles: total in the body; the receiver: goods only. First 3 goods, then "và N món khác".
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key = 'customer:customer.daily_summary:' || k || ':2026-11-10:7f390000-0000-4000-8000-0000000000d1')
    = 'Cát đen 2,5 xe · Gạch đặc 1.000 viên · Sỏi 1x2 3 xe · và 1 món khác · Tổng 7.500.000 ₫', 'owner body';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key = 'customer:customer.daily_summary:' || k || ':2026-11-10:7f390000-0000-4000-8000-0000000000d2')
    = 'Cát đen 2,5 xe · Gạch đặc 1.000 viên · Sỏi 1x2 3 xe · và 1 món khác · Tổng 7.500.000 ₫', 'finance body';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key = 'customer:customer.daily_summary:' || k || ':2026-11-10:7f390000-0000-4000-8000-0000000000d3')
    = 'Cát đen 2,5 xe · Gạch đặc 1.000 viên · Sỏi 1x2 3 xe · và 1 món khác', 'receiver body without money';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:' || k2 || ':%') = 'Cát đen 4 xe · Tổng 4.000.000 ₫', 'K2: one line, no "và N món khác"';
  assert (select bool_and(payload->>'link' = '/customer/reports/ordered?from=2026-11-10&to=2026-11-10' and payload->>'kind' = 'customer.daily_summary')
    from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:%'), 'link opens the same day, kind is the built-in key';
  -- Run again (the same day): nothing is sent twice.
  select count(*) into before_jobs from public.outbound_jobs;
  made := private.customer_daily_order_summary(one_day);
  assert made = 0 and (select count(*) from public.outbound_jobs) = before_jobs, 'a rerun adds nothing';

  -- 8. Switched off in Cài đặt → Quy tắc tự động: nothing is sent; back on: sent.
  perform pg_temp.act_as(staff);
  assert public.set_builtin_push(branch, 'customer.daily_summary', false, gen_random_uuid()) = false, 'built-in key accepted and switched off';
  perform pg_temp.act_as_admin();
  assert not private.builtin_push_on(branch, 'customer.daily_summary'), 'off';
  select count(*) into before_jobs from public.outbound_jobs;
  made := private.customer_daily_order_summary('2026-11-09');
  assert made = 0 and (select count(*) from public.outbound_jobs) = before_jobs, 'switched off: no push';
  perform pg_temp.act_as(staff);
  perform public.set_builtin_push(branch, 'customer.daily_summary', true, gen_random_uuid());
  perform pg_temp.act_as_admin();
  made := private.customer_daily_order_summary('2026-11-09');
  assert made = 1, format('back on: K has an order on 09/11 (the day before the ledger one), got %s', made);
  assert (select payload->>'title' from public.outbound_jobs where dedupe_key like 'customer:customer.daily_summary:' || k || ':2026-11-09:%' limit 1) = 'Hàng anh/chị đặt ngày 09/11', 'title of the other day';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key = 'customer:customer.daily_summary:' || k || ':2026-11-09:7f390000-0000-4000-8000-0000000000d3') = 'Gạch đặc 500 viên', 'receiver: no total';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key = 'customer:customer.daily_summary:' || k || ':2026-11-09:7f390000-0000-4000-8000-0000000000d1') = 'Gạch đặc 500 viên · Tổng 1.000.000 ₫', 'owner: total';
  -- A day with no order at all, and an unknown built-in key.
  assert private.customer_daily_order_summary('2026-10-01') = 0, 'no orders, no push';
  perform pg_temp.act_as(staff);
  failed := null;
  begin perform public.set_builtin_push(branch, 'customer.nope', true, gen_random_uuid()); exception when invalid_parameter_value then failed := sqlerrm; end;
  assert failed = 'automation_rule_invalid', 'unknown keys are still refused';
  perform pg_temp.act_as_admin();

  -- 9. Number text and the schedule.
  assert private.vn_number_text(1000) = '1.000' and private.vn_number_text(2.5) = '2,5' and private.vn_number_text(1000.50) = '1.000,5'
    and private.vn_number_text(0) = '0' and private.vn_number_text(1234567.125) = '1.234.567,125' and private.vn_number_text(10.000000) = '10', 'quantities as the app shows them';
  if to_regclass('cron.job') is not null then
    assert (select schedule from cron.job where jobname = 'hx-customer-ordered-summary') = '46 1 * * *', 'scheduled at 08:46 Vietnam time';
    assert (select command from cron.job where jobname = 'hx-customer-ordered-summary') = 'select private.customer_daily_order_summary()', 'runs the summary';
  end if;
end
$test$;
