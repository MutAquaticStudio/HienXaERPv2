-- D45: a payment request paid in cash at the shop. Nothing is booked until the accountant confirms the cash actually
-- received; the receipt pays the chosen debts first (earliest due first), then other oldest debts, then an advance.
-- Less than asked stays owed; a reversed receipt reopens the request; a later transfer with the code waits.
insert into auth.users(id, email) values
  ('7f319000-0000-4000-8000-0000000000a1', 'chu319@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f319000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'KH320', 'Khách thử 320', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f319000-0000-4000-8000-0000000000a1', '7f319000-0000-4000-8000-000000000040', 'OWNER');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f319000-0000-4000-8000-000000000050', '7f319000-0000-4000-8000-000000000040', 'CT320', 'Công trình 320', 'Đại Mỗ, Hà Nội');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f319000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_TM319', 'Tiền mặt 319', 'CASH', '10000000-0000-4000-8000-000000000001'),
  ('7f319000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_VCB319', 'Vietcombank 319', 'BANK', '10000000-0000-4000-8000-000000000001');

-- KH320 owes: …099 (due in 1 day, 1.5m, not chosen), …101 (due 5, 3m), …102 (due 10, 5m).
create function pg_temp.order_debt(suffix text, due integer, amount bigint) returns void language plpgsql as $$
declare base text := '7f319000-0000-4000-8000-00000000' || suffix;
begin
  insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
  values ((base || '1')::uuid, '20000000-0000-4000-8000-00000000000a', 'SO-2026-319' || suffix, '7f319000-0000-4000-8000-000000000040',
    '7f319000-0000-4000-8000-000000000050', 'Khách thử 320', 'Công trình 320', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
  insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
  values ((base || '2')::uuid, '20000000-0000-4000-8000-00000000000a', (base || '1')::uuid, 'DLV-319' || suffix,
    '7f319000-0000-4000-8000-000000000040', '7f319000-0000-4000-8000-000000000050', 'Khách thử 320', 'Công trình 320', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
  insert into public.delivery_verifications(id, delivery_id, delivery_result_id, verified_by)
  values ((base || '3')::uuid, (base || '2')::uuid, gen_random_uuid(), '10000000-0000-4000-8000-000000000001');
  insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id, delivery_verification_id)
  values ((base || '4')::uuid, '20000000-0000-4000-8000-00000000000a', '7f319000-0000-4000-8000-000000000040', amount, current_date + due,
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
    insert into vault.decrypted_secrets(name, decrypted_secret) values ('hx_sepay_webhook_secret', 'bí-mật-319');
  else
    perform vault.create_secret('bí-mật-319', 'hx_sepay_webhook_secret');
  end if;
end
$vault$;
create function pg_temp.sepay(id integer, content text, amount bigint) returns jsonb language plpgsql as $$
declare
  payload text := jsonb_build_object('id', id, 'accountNumber', '0071000319', 'content', content, 'transferType', 'in', 'transferAmount', amount)::text;
  ts text := floor(extract(epoch from now()))::bigint::text;
  sig text := private.sepay_signature(ts, payload, 'bí-mật-319');
  result jsonb;
begin
  perform set_config('role', 'service_role', true);
  result := public.ingest_sepay_webhook(payload, sig, ts);
  perform set_config('role', 'postgres', true);
  return result;
end $$;
create function pg_temp.owed(suffix text) returns bigint language sql as $$
  select private.current_receivable_outstanding(('7f319000-0000-4000-8000-00000000' || suffix || '4')::uuid) $$;
create function pg_temp.key(suffix text) returns text language sql as $$ select '7f319000-0000-4000-8000-00000000' || suffix || '1' $$;
create function pg_temp.advance() returns bigint language sql as $$
  select coalesce(sum(amount_delta_vnd), 0) from public.advances where customer_id = '7f319000-0000-4000-8000-000000000040' $$;

do $test$
declare
  customer constant uuid := '7f319000-0000-4000-8000-000000000040';
  cash constant uuid := '7f319000-0000-4000-8000-000000000002';
  bank constant uuid := '7f319000-0000-4000-8000-000000000003';
  owner_user constant uuid := '7f319000-0000-4000-8000-0000000000a1';
  op uuid := gen_random_uuid();
  options jsonb; req jsonb; request_id uuid; code text; payment uuid; again uuid; failed text; result jsonb;
begin
  -- No SePay at all: the portal still lists the debts (cash is possible), without QR.
  perform pg_temp.act_as(owner_user);
  options := public.portal_debt_payment_options(customer);
  assert not (options->>'qr_enabled')::boolean and jsonb_array_length(options->'orders') = 3 and options->>'outstanding_amount_vnd' = '9500000',
    'debts listed without SePay: ' || options::text;
  failed := null;
  begin perform public.create_payment_request(customer, array[pg_temp.key('101')], gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'bank_feed_not_ready', 'no QR request without SePay';

  -- The customer picks 101 + 102 and pays cash at the shop: a CASH request with a code, nothing booked yet.
  req := public.create_payment_request(customer, array[pg_temp.key('101'), pg_temp.key('102')], 'CASH', op);
  request_id := (req->>'id')::uuid; code := req->>'code';
  assert req->>'method' = 'CASH' and req->>'amount_vnd' = '8000000' and req->>'note' = 'TT KH320 ' || code and req->>'account_number' is null
    and req->>'state' = 'OPEN', 'cash request: ' || req::text;
  assert (public.create_payment_request(customer, array[pg_temp.key('102'), pg_temp.key('101')], 'CASH', op))->>'id' = request_id::text, 'idempotent';
  perform pg_temp.act_as_admin();
  assert pg_temp.owed('101') = 3000000 and pg_temp.owed('102') = 5000000 and not exists (select 1 from public.payments where customer_id = customer),
    'a request books nothing';

  -- Only finance.payment.post may confirm: the customer, a reader and another branch cannot.
  perform pg_temp.act_as(owner_user);
  failed := null;
  begin perform public.confirm_cash_payment_request(request_id, 8000000, cash, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'customer cannot confirm';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.confirm_cash_payment_request(request_id, 8000000, cash, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'reader cannot confirm';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.confirm_cash_payment_request(request_id, 8000000, cash, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'other branch cannot confirm';

  -- The accountant: a bank account or nothing received is refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.confirm_cash_payment_request(request_id, 8000000, bank, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'cash_account_required', 'cash fund only';
  failed := null;
  begin perform public.confirm_cash_payment_request(request_id, 0, cash, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_payment', 'amount needed';

  -- Rounded down (5m of 8m): earliest due first — 101 settled, 102 keeps 3m owed, 099 untouched; request partly paid.
  op := gen_random_uuid();
  payment := public.confirm_cash_payment_request(request_id, 5000000, cash, op);
  again := public.confirm_cash_payment_request(request_id, 5000000, cash, op);
  assert again = payment, 'same click, same receipt';
  perform pg_temp.act_as_admin();
  assert pg_temp.owed('101') = 0 and pg_temp.owed('102') = 3000000 and pg_temp.owed('099') = 1500000, 'less than asked stays owed';
  assert (select p.method = 'CASH' and p.account_id = cash and p.amount_vnd = 5000000 and p.external_reference = 'Tiền mặt · ' || code
    and p.posted_by = '10000000-0000-4000-8000-000000000001' from public.payments p where p.id = payment), 'cash receipt by the accountant';
  assert (select state = 'PARTIAL' and received_amount_vnd = 5000000 from public.payment_requests where id = request_id), 'request partial';
  assert (select count(*) = 1 from public.payments where customer_id = customer), 'one receipt';

  -- Wrong count: the receipt is reversed — the debts come back and the request reopens.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.reverse_payment(payment, 'Đếm nhầm tiền', gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert pg_temp.owed('101') = 3000000 and pg_temp.owed('102') = 5000000, 'debts back';
  assert (select state = 'OPEN' and received_amount_vnd = 0 and paid_at is null from public.payment_requests where id = request_id), 'request reopened';

  -- More than asked (10m of 8m): 101 and 102 settled, then the oldest other debt 099, the rest an advance.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  payment := public.confirm_cash_payment_request(request_id, 10000000, cash, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert pg_temp.owed('101') = 0 and pg_temp.owed('102') = 0 and pg_temp.owed('099') = 0 and pg_temp.advance() = 500000, 'overflow like D44';
  assert (select state = 'PAID' and paid_at is not null and received_amount_vnd = 10000000 from public.payment_requests where id = request_id), 'paid';
  assert (select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payment_id = payment)
    + (select sum(v.amount_delta_vnd) from public.advances v where v.payment_id = payment) = 10000000, 'allocations + advance = cash received';

  -- Paid requests cannot be confirmed again, nor cancelled.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.confirm_cash_payment_request(request_id, 100, cash, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'payment_request_already_paid', 'no second confirmation';

  -- The customer also transfers with the code later (SePay now on): it waits for the accountant, nothing booked.
  perform public.set_finance_account_bank_details(bank, 'Vietcombank', '0071000319', 'Hiền Xa', true, gen_random_uuid());
  perform public.set_finance_account_bank_feed(bank, true, null, gen_random_uuid());
  perform pg_temp.act_as_admin();
  result := pg_temp.sepay(3001, 'TT KH320 ' || code, 8000000);
  assert result->>'state' = 'NEEDS_REVIEW' and (select reason = 'request_already_paid' from public.bank_transactions where provider_transaction_id = '3001'),
    'cash-paid request: transfer waits';
  assert pg_temp.advance() = 500000, 'nothing more booked';

  -- A cancelled cash request cannot be confirmed.
  set local session_replication_role = replica;
  perform pg_temp.order_debt('201', 3, 400000);
  set local session_replication_role = origin;
  perform pg_temp.act_as(owner_user);
  req := public.create_payment_request(customer, array[pg_temp.key('201')], 'CASH', gen_random_uuid());
  perform public.cancel_payment_request((req->>'id')::uuid, gen_random_uuid());
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.confirm_cash_payment_request((req->>'id')::uuid, 400000, cash, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'payment_request_cancelled', 'cancelled cannot be confirmed';

  -- The customer sees the cash receipt link of their own request only.
  perform pg_temp.act_as(owner_user);
  assert (select count(*) = 2 from public.payment_request_payments), 'customer sees own confirmations (the reversed one and the paid one)';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  assert not exists (select 1 from public.payment_request_payments), 'other branch sees none';
  perform pg_temp.act_as_admin();
end
$test$;
