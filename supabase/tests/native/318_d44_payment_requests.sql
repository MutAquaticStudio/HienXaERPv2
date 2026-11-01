-- D44: one QR for several chosen debts. Each transfer with the request code gives one receipt that pays the chosen debts
-- first (earliest due first, never more than owed), then other oldest debts, then an advance; a second transfer for a
-- settled request and a code of another customer wait for the accountant. Money always adds up.
insert into auth.users(id, email) values
  ('7f318000-0000-4000-8000-0000000000a1', 'chu318@example.test'),
  ('7f318000-0000-4000-8000-0000000000a2', 'nguoinhan318@example.test'),
  ('7f318000-0000-4000-8000-0000000000a3', 'khac318@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f318000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'KH318', 'Khách thử 318', 'BUSINESS'),
  ('7f318000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'KH319', 'Khách thử 319', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f318000-0000-4000-8000-0000000000a1', '7f318000-0000-4000-8000-000000000040', 'OWNER'),
  ('7f318000-0000-4000-8000-0000000000a2', '7f318000-0000-4000-8000-000000000040', 'RECEIVER'),
  ('7f318000-0000-4000-8000-0000000000a3', '7f318000-0000-4000-8000-000000000041', 'OWNER');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f318000-0000-4000-8000-000000000050', '7f318000-0000-4000-8000-000000000040', 'CT318', 'Công trình 318', 'Đại Mỗ, Hà Nội');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f318000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_VCB318', 'Vietcombank 318', 'BANK', '10000000-0000-4000-8000-000000000001');

-- KH318 owes: SO-…099 (due in 1 day, 1.5m, not chosen), 101 (due 5, 3m), 102 (due 10, 5m), 103 (due 15, 2m).
create function pg_temp.order_debt(suffix text, due integer, amount bigint) returns void language plpgsql as $$
declare base text := '7f318000-0000-4000-8000-00000000' || suffix;
begin
  insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
  values ((base || '1')::uuid, '20000000-0000-4000-8000-00000000000a', 'SO-2026-318' || suffix, '7f318000-0000-4000-8000-000000000040',
    '7f318000-0000-4000-8000-000000000050', 'Khách thử 318', 'Công trình 318', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
  insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
  values ((base || '2')::uuid, '20000000-0000-4000-8000-00000000000a', (base || '1')::uuid, 'DLV-318' || suffix,
    '7f318000-0000-4000-8000-000000000040', '7f318000-0000-4000-8000-000000000050', 'Khách thử 318', 'Công trình 318', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
  insert into public.delivery_verifications(id, delivery_id, delivery_result_id, verified_by)
  values ((base || '3')::uuid, (base || '2')::uuid, gen_random_uuid(), '10000000-0000-4000-8000-000000000001');
  insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id, delivery_verification_id)
  values ((base || '4')::uuid, '20000000-0000-4000-8000-00000000000a', '7f318000-0000-4000-8000-000000000040', amount, current_date + due,
    '10000000-0000-4000-8000-000000000001', null, (base || '3')::uuid);
end $$;
set local session_replication_role = replica;
select pg_temp.order_debt('099', 1, 1500000), pg_temp.order_debt('101', 5, 3000000), pg_temp.order_debt('102', 10, 5000000), pg_temp.order_debt('103', 15, 2000000);
set local session_replication_role = origin;

do $vault$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    create schema if not exists vault;
    create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz default now());
    insert into vault.decrypted_secrets(name, decrypted_secret) values ('hx_sepay_webhook_secret', 'bí-mật-318');
  else
    perform vault.create_secret('bí-mật-318', 'hx_sepay_webhook_secret');
  end if;
end
$vault$;

create function pg_temp.sepay(id integer, content text, amount bigint) returns jsonb language plpgsql as $$
declare
  payload text := jsonb_build_object('id', id, 'accountNumber', '0071000318', 'content', content, 'transferType', 'in', 'transferAmount', amount)::text;
  ts text := floor(extract(epoch from now()))::bigint::text;
  sig text := private.sepay_signature(ts, payload, 'bí-mật-318');
  result jsonb;
begin
  perform set_config('role', 'service_role', true);
  result := public.ingest_sepay_webhook(payload, sig, ts);
  perform set_config('role', 'postgres', true);
  return result;
end $$;
create function pg_temp.owed(suffix text) returns bigint language sql as $$
  select private.current_receivable_outstanding(('7f318000-0000-4000-8000-00000000' || suffix || '4')::uuid) $$;
create function pg_temp.key(suffix text) returns text language sql as $$ select '7f318000-0000-4000-8000-00000000' || suffix || '1' $$;
create function pg_temp.advance() returns bigint language sql as $$
  select coalesce(sum(amount_delta_vnd), 0) from public.advances where customer_id = '7f318000-0000-4000-8000-000000000040' $$;
-- Every posted transfer: allocations + advance = money in.
create function pg_temp.books_balance() returns boolean language sql as $$
  select bool_and(t.amount_vnd = coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payment_id = t.payment_id), 0)
    + coalesce((select sum(v.amount_delta_vnd) from public.advances v where v.payment_id = t.payment_id), 0))
  from public.bank_transactions t where t.state = 'POSTED' $$;

do $test$
declare
  customer constant uuid := '7f318000-0000-4000-8000-000000000040';
  vcb constant uuid := '7f318000-0000-4000-8000-000000000002';
  owner_user constant uuid := '7f318000-0000-4000-8000-0000000000a1';
  op uuid := gen_random_uuid();
  req jsonb; again jsonb; staff_req jsonb; result jsonb; failed text; request_id uuid; code text;
begin
  -- Bank account with automatic confirmation, shown to customers.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.set_finance_account_bank_details(vcb, 'Vietcombank', '0071000318', 'Hiền Xa', true, gen_random_uuid());
  perform public.set_finance_account_bank_feed(vcb, true, 'SEVQR', gen_random_uuid());

  -- Who may make a request: the customer's owner yes; a receiver, another customer and anon no.
  perform pg_temp.act_as('7f318000-0000-4000-8000-0000000000a2');
  failed := null;
  begin perform public.create_payment_request(customer, array[pg_temp.key('101')], gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'receiver cannot';
  perform pg_temp.act_as('7f318000-0000-4000-8000-0000000000a3');
  failed := null;
  begin perform public.create_payment_request(customer, array[pg_temp.key('101')], gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'another customer cannot';

  -- The owner chooses 101, 102, 103 (and sends a made-up key, ignored): one request, 10m, note with prefix and code.
  perform pg_temp.act_as(owner_user);
  req := public.create_payment_request(customer, array[pg_temp.key('101'), pg_temp.key('102'), pg_temp.key('103'), 'không-có'], op);
  code := req->>'code';
  request_id := (req->>'id')::uuid;
  assert code ~ '^YC[A-HJKMNP-Z2-9]{5}$', 'code shape: ' || code;
  assert req->>'amount_vnd' = '10000000' and req->>'note' = 'SEVQR TT KH318 ' || code and jsonb_array_length(req->'lines') = 3
    and req->>'account_number' = '0071000318' and req->>'state' = 'OPEN', 'request: ' || req::text;
  assert char_length(req->>'note') <= 25, 'note fits a bank transfer';
  -- Same click twice: the same request; same operation with other debts: refused.
  again := public.create_payment_request(customer, array[pg_temp.key('103'), pg_temp.key('102'), pg_temp.key('101'), 'không-có'], op);
  assert again->>'id' = req->>'id', 'idempotent';
  failed := null;
  begin perform public.create_payment_request(customer, array[pg_temp.key('099')], op); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', 'same operation, other debts';
  failed := null;
  begin perform public.create_payment_request(customer, array['không-có'], gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'payment_request_nothing_owed', 'nothing to pay';
  -- The customer sees only their requests; the other customer sees none.
  assert (select count(*) = 1 from public.payment_requests) and (select count(*) = 3 from public.payment_request_lines), 'owner reads own request';
  perform pg_temp.act_as('7f318000-0000-4000-8000-0000000000a3');
  assert not exists (select 1 from public.payment_requests) and not exists (select 1 from public.payment_request_lines), 'other customer reads nothing';
  perform pg_temp.act_as_admin();
  perform set_config('role', 'anon', true);
  failed := null;
  begin perform count(*) from public.payment_requests; exception when others then failed := sqlerrm; end;
  assert failed like 'permission denied%', 'anon reads nothing';
  perform pg_temp.act_as_admin();

  -- B. Pays less (6m): earliest due of the chosen first — 101 settled, 102 partly, 103 and 099 untouched.
  result := pg_temp.sepay(2001, 'SEVQR TT KH318 ' || code, 6000000);
  assert result->>'state' = 'POSTED', 'posted: ' || result::text;
  assert pg_temp.owed('101') = 0 and pg_temp.owed('102') = 2000000 and pg_temp.owed('103') = 2000000 and pg_temp.owed('099') = 1500000, 'partial order';
  assert (select state = 'PARTIAL' and received_amount_vnd = 6000000 from public.payment_requests where id = request_id), 'request partial';
  assert (select t.payment_request_id = request_id and p.external_reference like '%' || code from public.bank_transactions t
    join public.payments p on p.id = t.payment_id where t.provider_transaction_id = '2001'), 'receipt names the request';
  assert exists (select 1 from public.notifications where kind = 'payment.bank_received' and body like code || ' (3 khoản)%'), 'finance told with the code';

  -- D. The accountant meanwhile takes cash for 102 (2m left) — the next transfer skips it.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.post_payment('20000000-0000-4000-8000-00000000000a', 'RECEIPT', customer, null, vcb, 2000000, now(), 'CASH', null,
    jsonb_build_array(jsonb_build_object('obligation_id', '7f318000-0000-4000-8000-000000001024', 'amount_vnd', 2000000)), 0, gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert pg_temp.owed('102') = 0, 'cash took 102';

  -- C. Pays more than the request still owes (4m for 103's 2m): 103, then the oldest other debt 099 (1.5m), 0.5m advance.
  result := pg_temp.sepay(2002, 'MBVCB.99 SEVQR TT KH318 ' || code || ' chuyen tien', 4000000);
  assert result->>'state' = 'POSTED', 'posted again: ' || result::text;
  assert pg_temp.owed('103') = 0 and pg_temp.owed('099') = 0 and pg_temp.advance() = 500000, 'overflow like D42';
  assert (select state = 'PAID' and paid_at is not null and received_amount_vnd = 10000000 from public.payment_requests where id = request_id), 'request paid';

  -- E. Same code again after it is paid: waits for the accountant, nothing posted.
  result := pg_temp.sepay(2003, 'TT KH318 ' || code, 10000000);
  assert result->>'state' = 'NEEDS_REVIEW' and (select reason = 'request_already_paid' and payment_id is null and customer_id = customer
    and payment_request_id = request_id from public.bank_transactions where provider_transaction_id = '2003'), 'second transfer waits';
  assert pg_temp.advance() = 500000, 'nothing more booked';
  assert exists (select 1 from public.notifications where kind = 'payment.bank_needs_review' and title like 'Khách chuyển lại cho yêu cầu đã trả%'), 'accountant told';

  -- Retry of the same SePay transaction: nothing new.
  result := pg_temp.sepay(2002, 'SEVQR TT KH318 ' || code, 4000000);
  assert (result->>'duplicate')::boolean, 'replay';
  assert pg_temp.books_balance(), 'allocations + advance = money in';

  -- New debts; a staff member (finance.ar.read) makes a request for the customer; another customer's code next to it waits.
  set local session_replication_role = replica;
  perform pg_temp.order_debt('201', 3, 800000);
  perform pg_temp.order_debt('202', 4, 700000);
  set local session_replication_role = origin;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  staff_req := public.create_payment_request(customer, array[pg_temp.key('201'), pg_temp.key('202')], gen_random_uuid());
  assert staff_req->>'amount_vnd' = '1500000' and (select created_via = 'STAFF' from public.payment_requests where id = (staff_req->>'id')::uuid), 'staff request';
  perform pg_temp.act_as_admin();
  result := pg_temp.sepay(2004, 'TT KH319 ' || (staff_req->>'code'), 1500000);
  assert result->>'state' = 'NEEDS_REVIEW' and (select reason = 'customer_mismatch' from public.bank_transactions where provider_transaction_id = '2004'), 'mismatch waits';

  -- Spaces dropped by the bank: recognised because the customer code is there too.
  result := pg_temp.sepay(2005, 'SEVQRTTKH318' || (staff_req->>'code'), 800000);
  assert result->>'state' = 'POSTED' and pg_temp.owed('201') = 0 and pg_temp.owed('202') = 700000, 'compact note, earliest due first';

  -- A. Exact amount after cancelling: still recognised (the customer's intent), request keeps its cancelled state.
  perform pg_temp.act_as(owner_user);
  perform public.cancel_payment_request((staff_req->>'id')::uuid, gen_random_uuid());
  perform pg_temp.act_as_admin();
  result := pg_temp.sepay(2006, 'TT KH318 ' || (staff_req->>'code'), 700000);
  assert result->>'state' = 'POSTED' and pg_temp.owed('202') = 0, 'late transfer after cancel still pays the chosen debt';
  assert (select state = 'CANCELLED' and received_amount_vnd = 1500000 from public.payment_requests where id = (staff_req->>'id')::uuid), 'cancelled stays cancelled';
  failed := null;
  perform pg_temp.act_as(owner_user);
  begin perform public.cancel_payment_request(request_id, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'payment_request_already_paid', 'paid request cannot be cancelled';

  -- Unknown code: back to the D42 rules (customer code → oldest debts / advance).
  perform pg_temp.act_as_admin();
  result := pg_temp.sepay(2007, 'TT KH318 YCZZZZZ', 100000);
  assert result->>'state' = 'POSTED' and (select payment_request_id is null from public.bank_transactions where provider_transaction_id = '2007'), 'unknown code ignored';
  assert pg_temp.books_balance(), 'books still balance';

  -- Staff of another branch (…002, branch B) and a reader without finance.ar.read (…003) cannot make requests or see them.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.create_payment_request(customer, array[pg_temp.key('201')], gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'other branch cannot';
  assert not exists (select 1 from public.payment_requests), 'other branch reads nothing';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.create_payment_request(customer, array[pg_temp.key('201')], gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'reader cannot';
  perform pg_temp.act_as_admin();
end
$test$;
