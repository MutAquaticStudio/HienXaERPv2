-- D96 (D4): the customer's "Giao thiếu / Chưa giao được" push shows only a reason someone typed for the customer, never the
-- internal notes written when "Đã tới nơi" was skipped ("Nhân viên báo giao thay thợ", "Thợ chưa bấm Đã tới nơi").
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('7f374000-0000-4000-8000-0000000000a1');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f374000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'NT_K374', 'Khách 374', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f374000-0000-4000-8000-0000000000a1', '7f374000-0000-4000-8000-000000000041', 'OWNER');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f374000-0000-4000-8000-000000000051', '7f374000-0000-4000-8000-000000000041', 'CT374', 'Công trình 374', 'Thủ Đức', 'Anh Nhận', '0901374000');
insert into public.push_subscriptions(id, auth_user_id, endpoint, p256dh, auth_secret) values
  ('7f374000-0000-4000-8000-0000000000d1', '7f374000-0000-4000-8000-0000000000a1', 'https://push.example.test/374', repeat('p', 40), repeat('a', 16));
set local session_replication_role = replica;
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, order_channel, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, commercial_terms, created_by) values
  ('7f374000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-00000000000a', 'NT-SO-374', '7f374000-0000-4000-8000-000000000041',
   '7f374000-0000-4000-8000-000000000051', 'CONFIRMED', 'INTERNAL', 'Khách 374', 'Công trình 374', 'Thủ Đức', 'Giao trong ngày',
   '10000000-0000-4000-8000-000000000001');
-- 1 office report without a reason, 2 worker without a reason, 3 a reason typed, 4 blank.
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, execution_state, customer_id, site_id, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, scheduled_at, created_by)
select ('7f374000-0000-4000-8000-00000000020' || n)::uuid, '20000000-0000-4000-8000-00000000000a', '7f374000-0000-4000-8000-000000000101',
  'DLV-3740' || n, 'RESULT_SUBMITTED', '7f374000-0000-4000-8000-000000000041', '7f374000-0000-4000-8000-000000000051', 'Khách 374', 'Công trình 374',
  'Thủ Đức', now(), '10000000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;
insert into public.delivery_results(delivery_id, result_kind, missing_arrival_reason, note, submitted_by) values
  ('7f374000-0000-4000-8000-000000000201', 'FAILED', 'Nhân viên báo giao thay thợ', 'Ghi chú nội bộ', '10000000-0000-4000-8000-000000000001'),
  ('7f374000-0000-4000-8000-000000000202', 'PARTIAL', ' Thợ chưa bấm Đã tới nơi ', null, '10000000-0000-4000-8000-000000000001'),
  ('7f374000-0000-4000-8000-000000000203', 'FAILED', ' Công trình khóa cổng ', null, '10000000-0000-4000-8000-000000000001'),
  ('7f374000-0000-4000-8000-000000000204', 'PARTIAL', null, 'Ghi chú nội bộ', '10000000-0000-4000-8000-000000000001');
set local session_replication_role = origin;
select set_config('request.jwt.claim.sub', '', true);

do $test$
begin
  assert private.customer_delivery_reason('Nhân viên báo giao thay thợ') is null, 'office note is internal';
  assert private.customer_delivery_reason('  Thợ chưa bấm Đã tới nơi') is null, 'worker note is internal';
  assert private.customer_delivery_reason('   ') is null and private.customer_delivery_reason(null) is null, 'blank';
  assert private.customer_delivery_reason(' Hết hàng ') = 'Hết hàng', 'a typed reason, trimmed';

  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'FAILED', verified_at = now() where id = '7f374000-0000-4000-8000-000000000201';
  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'PARTIAL', verified_at = now() where id = '7f374000-0000-4000-8000-000000000202';
  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'FAILED', verified_at = now() where id = '7f374000-0000-4000-8000-000000000203';
  update public.deliveries set execution_state = 'VERIFIED', result_kind = 'PARTIAL', verified_at = now() where id = '7f374000-0000-4000-8000-000000000204';
  set constraints all immediate;
  set constraints all deferred;
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_problem:7f374000-0000-4000-8000-000000000201:%')
    = 'Công trình 374 · Cửa hàng sẽ liên hệ lại', 'office report: no internal note';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_problem:7f374000-0000-4000-8000-000000000202:%')
    = 'Công trình 374 · Cửa hàng sẽ liên hệ lại', 'worker without a reason: no internal note';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_problem:7f374000-0000-4000-8000-000000000203:%')
    = 'Công trình 374 · Công trình khóa cổng', 'typed reason shown';
  assert (select payload->>'body' from public.outbound_jobs where dedupe_key like 'customer:customer.delivery_problem:7f374000-0000-4000-8000-000000000204:%')
    = 'Công trình 374 · Cửa hàng sẽ liên hệ lại', 'no reason, never the note';
end
$test$;
