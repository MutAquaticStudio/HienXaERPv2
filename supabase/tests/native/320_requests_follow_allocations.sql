-- QA 02/11: a request whose debts are paid through another document follows the money: PAID when nothing is owed
-- (so a cash request leaves "Chờ thu tiền mặt" and cannot be confirmed again), and reopens when that money is reversed.
insert into auth.users(id, email) values
  ('7f320000-0000-4000-8000-0000000000a1', 'chu320@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f320000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'KH321', 'Khách thử 321', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f320000-0000-4000-8000-0000000000a1', '7f320000-0000-4000-8000-000000000040', 'OWNER');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f320000-0000-4000-8000-000000000050', '7f320000-0000-4000-8000-000000000040', 'CT321', 'Công trình 321', 'Đại Mỗ, Hà Nội');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f320000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_TM320', 'Tiền mặt 320', 'CASH', '10000000-0000-4000-8000-000000000001'),
  ('7f320000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_VCB320', 'Vietcombank 320', 'BANK', '10000000-0000-4000-8000-000000000001');

-- KH321 owes: …099 (due in 1 day, 1.5m, not chosen), …101 (due 5, 3m), …102 (due 10, 5m).
create function pg_temp.order_debt(suffix text, due integer, amount bigint) returns void language plpgsql as $$
declare base text := '7f320000-0000-4000-8000-00000000' || suffix;
begin
  insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
  values ((base || '1')::uuid, '20000000-0000-4000-8000-00000000000a', 'SO-2026-320' || suffix, '7f320000-0000-4000-8000-000000000040',
    '7f320000-0000-4000-8000-000000000050', 'Khách thử 321', 'Công trình 321', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
  insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
  values ((base || '2')::uuid, '20000000-0000-4000-8000-00000000000a', (base || '1')::uuid, 'DLV-320' || suffix,
    '7f320000-0000-4000-8000-000000000040', '7f320000-0000-4000-8000-000000000050', 'Khách thử 321', 'Công trình 321', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
  insert into public.delivery_verifications(id, delivery_id, delivery_result_id, verified_by)
  values ((base || '3')::uuid, (base || '2')::uuid, gen_random_uuid(), '10000000-0000-4000-8000-000000000001');
  insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id, delivery_verification_id)
  values ((base || '4')::uuid, '20000000-0000-4000-8000-00000000000a', '7f320000-0000-4000-8000-000000000040', amount, current_date + due,
    '10000000-0000-4000-8000-000000000001', null, (base || '3')::uuid);
end $$;
set local session_replication_role = replica;
select pg_temp.order_debt('099', 1, 1500000), pg_temp.order_debt('101', 5, 3000000), pg_temp.order_debt('102', 10, 5000000);
set local session_replication_role = origin;

do $vault$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    create schema if not exists vault;
    create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz default now());
    insert into vault.decrypted_secrets(name, decrypted_secret) values ('hx_sepay_webhook_secret', 'bí-mật-320');
  else
    perform vault.create_secret('bí-mật-320', 'hx_sepay_webhook_secret');
  end if;
end
$vault$;
create function pg_temp.sepay(id integer, content text, amount bigint) returns jsonb language plpgsql as $$
declare
  payload text := jsonb_build_object('id', id, 'accountNumber', '0071000320', 'content', content, 'transferType', 'in', 'transferAmount', amount)::text;
  ts text := floor(extract(epoch from now()))::bigint::text;
  sig text := private.sepay_signature(ts, payload, 'bí-mật-320');
  result jsonb;
begin
  perform set_config('role', 'service_role', true);
  result := public.ingest_sepay_webhook(payload, sig, ts);
  perform set_config('role', 'postgres', true);
  return result;
end $$;
create function pg_temp.owed(suffix text) returns bigint language sql as $$
  select private.current_receivable_outstanding(('7f320000-0000-4000-8000-00000000' || suffix || '4')::uuid) $$;
create function pg_temp.key(suffix text) returns text language sql as $$ select '7f320000-0000-4000-8000-00000000' || suffix || '1' $$;
create function pg_temp.advance() returns bigint language sql as $$
  select coalesce(sum(amount_delta_vnd), 0) from public.advances where customer_id = '7f320000-0000-4000-8000-000000000040' $$;

do $test$
declare
  customer constant uuid := '7f320000-0000-4000-8000-000000000040';
  cash constant uuid := '7f320000-0000-4000-8000-000000000002';
  owner_user constant uuid := '7f320000-0000-4000-8000-0000000000a1';
  first_req jsonb; second_req jsonb; manual_req jsonb; first_pay uuid; second_pay uuid; failed text;
begin
  -- Two cash requests over the same debt 102: the customer asks twice (101+102, then 102 alone).
  perform pg_temp.act_as(owner_user);
  first_req := public.create_payment_request(customer, array[pg_temp.key('101'), pg_temp.key('102')], 'CASH', gen_random_uuid());
  second_req := public.create_payment_request(customer, array[pg_temp.key('102')], 'CASH', gen_random_uuid());

  -- The accountant takes 5m on the first (101 settled, 102 keeps 3m), then 3m on the second (102 settled).
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  first_pay := public.confirm_cash_payment_request((first_req->>'id')::uuid, 5000000, cash, gen_random_uuid());
  assert (select state = 'PARTIAL' from public.payment_requests where id = (first_req->>'id')::uuid), 'first partly paid';
  second_pay := public.confirm_cash_payment_request((second_req->>'id')::uuid, 3000000, cash, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert pg_temp.owed('101') = 0 and pg_temp.owed('102') = 0, 'both debts settled';
  -- The first request follows: nothing owed any more → PAID, out of "Chờ thu tiền mặt", no second confirmation.
  assert (select state = 'PAID' and paid_at is not null and received_amount_vnd = 5000000 from public.payment_requests where id = (first_req->>'id')::uuid),
    'first request follows the money paid on the second';
  assert not exists (select 1 from public.payment_requests where method = 'CASH' and state in ('OPEN', 'PARTIAL') and customer_id = customer), 'nothing waits for cash';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.confirm_cash_payment_request((first_req->>'id')::uuid, 500000, cash, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'payment_request_already_paid', 'cannot take cash again for settled debts';

  -- The second receipt is reversed: 102 owes again, and both requests reopen.
  perform public.reverse_payment(second_pay, 'Thu nhầm', gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert pg_temp.owed('102') = 3000000, '102 owes again';
  assert (select state = 'PARTIAL' and paid_at is null from public.payment_requests where id = (first_req->>'id')::uuid), 'first reopened (partly paid)';
  assert (select state = 'OPEN' and received_amount_vnd = 0 from public.payment_requests where id = (second_req->>'id')::uuid), 'second reopened';

  -- A request settled entirely by a manual receipt (no money through the request) is PAID too.
  perform pg_temp.act_as(owner_user);
  manual_req := public.create_payment_request(customer, array[pg_temp.key('099')], 'CASH', gen_random_uuid());
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.post_payment('20000000-0000-4000-8000-00000000000a', 'RECEIPT', customer, null, cash, 1500000, now(), 'CASH', null,
    jsonb_build_array(jsonb_build_object('obligation_id', '7f320000-0000-4000-8000-000000000994', 'amount_vnd', 1500000)), 0, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert (select state = 'PAID' and received_amount_vnd = 0 from public.payment_requests where id = (manual_req->>'id')::uuid), 'paid by a manual receipt';
  -- A cancelled request is left as it is.
  assert not exists (select 1 from public.payment_requests where state = 'CANCELLED'), 'no cancelled request touched';
end
$test$;
