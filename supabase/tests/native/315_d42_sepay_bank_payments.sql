-- D42: money the bank (SePay) reports is posted once, to the right customer and order, only when the request is signed with
-- the Vault secret; anything unmatched waits for the accountant; the customer portal gets the exact amount and note.
insert into auth.users(id, email) values ('7f315000-0000-4000-8000-0000000000a1', 'chu315@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f315000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'KH-315', 'Khách thử 315', 'BUSINESS'),
  ('7f315000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'KH316', 'Khách thử 316', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f315000-0000-4000-8000-0000000000a1', '7f315000-0000-4000-8000-000000000040', 'OWNER');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f315000-0000-4000-8000-000000000050', '7f315000-0000-4000-8000-000000000040', 'CT315', 'Công trình 315', 'Quận 1, TP.HCM');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f315000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_VCB315', 'Vietcombank 315', 'BANK', '10000000-0000-4000-8000-000000000001');

-- Two debts of KH-315: an older opening balance and a newer one from order SO-2026-031501 (delivered and verified).
set local session_replication_role = replica;
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
values ('7f315000-0000-4000-8000-000000000060', '20000000-0000-4000-8000-00000000000a', 'SO-2026-031501', '7f315000-0000-4000-8000-000000000040',
  '7f315000-0000-4000-8000-000000000050', 'Khách thử 315', 'Công trình 315', 'Q1', '10000000-0000-4000-8000-000000000001');
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
values ('7f315000-0000-4000-8000-000000000061', '20000000-0000-4000-8000-00000000000a', '7f315000-0000-4000-8000-000000000060', 'DLV-315',
  '7f315000-0000-4000-8000-000000000040', '7f315000-0000-4000-8000-000000000050', 'Khách thử 315', 'Công trình 315', 'Q1', '10000000-0000-4000-8000-000000000001');
insert into public.delivery_verifications(id, delivery_id, delivery_result_id, verified_by)
values ('7f315000-0000-4000-8000-000000000062', '7f315000-0000-4000-8000-000000000061', gen_random_uuid(), '10000000-0000-4000-8000-000000000001');
insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id, delivery_verification_id) values
  ('7f315000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-00000000000a', '7f315000-0000-4000-8000-000000000040', 1000000, current_date - 30,
    '10000000-0000-4000-8000-000000000001', gen_random_uuid(), null),
  ('7f315000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-00000000000a', '7f315000-0000-4000-8000-000000000040', 3000000, current_date + 7,
    '10000000-0000-4000-8000-000000000001', null, '7f315000-0000-4000-8000-000000000062');
set local session_replication_role = origin;

-- Vault stand-in for the native harness (Supabase has the real one).
do $vault$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    create schema if not exists vault;
    create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz default now());
    insert into vault.decrypted_secrets(name, decrypted_secret) values ('hx_sepay_webhook_secret', 'bí-mật-thử');
  else
    perform vault.create_secret('bí-mật-thử', 'hx_sepay_webhook_secret');
  end if;
end
$vault$;

create function pg_temp.sepay(payload jsonb) returns jsonb language plpgsql as $$
declare ts text := floor(extract(epoch from now()))::bigint::text; sig text := private.sepay_signature(ts, payload::text, 'bí-mật-thử'); result jsonb;
begin
  perform set_config('role', 'service_role', true);
  result := public.ingest_sepay_webhook(payload::text, sig, ts);
  perform set_config('role', 'postgres', true);
  return result;
end $$;
create function pg_temp.owed(obligation uuid) returns bigint language sql as $$ select private.current_receivable_outstanding(obligation) $$;

do $test$
declare
  customer constant uuid := '7f315000-0000-4000-8000-000000000040';
  vcb constant uuid := '7f315000-0000-4000-8000-000000000002';
  opening constant uuid := '7f315000-0000-4000-8000-000000000070';
  ordered constant uuid := '7f315000-0000-4000-8000-000000000071';
  failed text; result jsonb; options jsonb; ts text := floor(extract(epoch from now()))::bigint::text; waiting uuid; body text; stale text;
begin
  -- Same signature as SePay's documented formula (checked against Node crypto).
  assert private.sepay_signature('1700000000', '{"id":1,"content":"Thanh toán"}', 'bí-mật-thử')
    = 'sha256=b7915ae17bf19a9a73434bd5c0ee1db7e492ab22adf52618d2dfe51b834bb3dd', 'HMAC matches the SePay formula';

  -- Turning the feed on needs an account number; then the portal gets the payment options.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.set_finance_account_bank_feed(vcb, true, null, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'bank_feed_needs_account_number', 'feed needs an account number';
  perform public.set_finance_account_bank_details(vcb, 'Vietcombank', '0071000315', 'Hiền Xa', true, gen_random_uuid());
  perform public.set_finance_account_bank_feed(vcb, true, null, gen_random_uuid());
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.set_finance_account_bank_feed(vcb, false, null, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'reader cannot switch the feed';

  perform pg_temp.act_as('7f315000-0000-4000-8000-0000000000a1');
  options := public.portal_debt_payment_options(customer);
  assert options->>'outstanding_amount_vnd' = '4000000' and options->>'all_note' = 'TT KH315' and options->>'account_number' = '0071000315', 'totals: ' || options::text;
  assert jsonb_array_length(options->'orders') = 2
    and (select bool_or(o->>'label' = 'SO-2026-031501' and o->>'note' = 'SO2026031501 KH315' and o->>'outstanding_amount_vnd' = '3000000')
      from jsonb_array_elements(options->'orders') o), 'per-order note and amount: ' || options::text;
  assert not (public.portal_bank_payment_status(customer, now() - interval '1 minute')->>'paid')::boolean, 'nothing paid yet';

  -- Only the server route (service_role) may call the webhook; signed-in users and anon may not.
  failed := null;
  begin perform public.ingest_sepay_webhook('{}', 'sha256=00', ts); exception when others then failed := sqlerrm; end;
  assert failed like 'permission denied%', 'customer cannot call the webhook';
  perform pg_temp.act_as_admin();
  perform set_config('role', 'anon', true);
  failed := null;
  begin perform public.ingest_sepay_webhook('{}', 'sha256=00', ts); exception when others then failed := sqlerrm; end;
  assert failed like 'permission denied%', 'anon cannot call the webhook';
  failed := null;
  begin perform count(*) from public.bank_transactions; exception when others then failed := sqlerrm; end;
  assert failed like 'permission denied%', 'anon cannot read bank transactions';

  -- Even the route is refused with a wrong signature or an old timestamp, and nothing is stored.
  perform pg_temp.act_as_admin();
  body := '{"id":901,"transferType":"in","transferAmount":100,"accountNumber":"0071000315","content":"x"}';
  stale := private.sepay_signature('1700000000', body, 'bí-mật-thử');
  perform set_config('role', 'service_role', true);
  failed := null;
  begin perform public.ingest_sepay_webhook(body, 'sha256=00', ts); exception when others then failed := sqlerrm; end;
  assert failed = 'sepay_signature_invalid', 'bad signature';
  failed := null;
  begin perform public.ingest_sepay_webhook(body, stale, '1700000000'); exception when others then failed := sqlerrm; end;
  assert failed = 'sepay_signature_invalid', 'stale timestamp';
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.bank_transactions), 'nothing stored';

  -- Order code, partial amount: the order's debt first, the opening balance untouched.
  result := pg_temp.sepay(jsonb_build_object('id', 1001, 'gateway', 'Vietcombank', 'transactionDate', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS'),
    'accountNumber', '0071000315', 'code', 'SO2026031501', 'content', 'SO2026031501 KH315 chuyen tien', 'transferType', 'in',
    'transferAmount', 1200000, 'referenceCode', 'FT315A'));
  assert result->>'state' = 'POSTED', 'posted: ' || result::text;
  assert pg_temp.owed(ordered) = 1800000 and pg_temp.owed(opening) = 1000000, 'order first';
  assert (select p.method = 'BANK_TRANSFER' and p.account_id = vcb and p.posted_by = '10000000-0000-4000-8000-000000000001'
      and r.reconciliation_state = 'MATCHED'
    from public.bank_transactions t join public.payments p on p.id = t.payment_id join public.payment_read r on r.id = p.id
    where t.provider_transaction_id = '1001' and t.sales_order_id = '7f315000-0000-4000-8000-000000000060'), 'receipt reconciled, posted by who switched it on';
  assert exists (select 1 from public.notifications n where n.kind = 'payment.bank_received' and n.title like 'Đã nhận 1.200.000 ₫%'), 'finance told';

  -- SePay retries / admin replays: nothing more is posted.
  result := pg_temp.sepay(jsonb_build_object('id', 1001, 'accountNumber', '0071000315', 'content', 'SO2026031501 KH315', 'transferType', 'in', 'transferAmount', 1200000));
  assert (result->>'duplicate')::boolean and pg_temp.owed(ordered) = 1800000, 'replay posts nothing';
  assert (select count(*) = 1 from public.payments where customer_id = customer), 'one receipt';

  -- Customer code only, more than owed: oldest debt first, then the order, the rest is an advance.
  result := pg_temp.sepay(jsonb_build_object('id', 1002, 'accountNumber', '0071000315', 'content', 'MBVCB.123 TT KH315', 'transferType', 'in', 'transferAmount', 3000000));
  assert result->>'state' = 'POSTED' and pg_temp.owed(opening) = 0 and pg_temp.owed(ordered) = 0, 'all settled';
  assert (select sum(amount_delta_vnd) = 200000 from public.advances where customer_id = customer), 'rest is an advance';
  perform pg_temp.act_as('7f315000-0000-4000-8000-0000000000a1');
  assert (public.portal_bank_payment_status(customer, now() - interval '1 minute')->>'paid')::boolean, 'portal sees the payment';
  perform pg_temp.act_as_admin();

  -- Money out, other accounts and zero are stored but never posted.
  result := pg_temp.sepay(jsonb_build_object('id', 1003, 'accountNumber', '0071000315', 'content', 'TT KH315', 'transferType', 'out', 'transferAmount', 50000));
  assert result->>'state' = 'IGNORED', 'money out';
  result := pg_temp.sepay(jsonb_build_object('id', 1004, 'accountNumber', '999999', 'content', 'TT KH315', 'transferType', 'in', 'transferAmount', 50000));
  assert result->>'state' = 'IGNORED' and (select reason = 'unknown_account' from public.bank_transactions where provider_transaction_id = '1004'), 'unknown account';

  -- No code: waits for the accountant, who posts it to the customer they choose (or dismisses it).
  result := pg_temp.sepay(jsonb_build_object('id', 1005, 'accountNumber', '0071000315', 'content', 'chuyen tien hang', 'transferType', 'in', 'transferAmount', 70000));
  assert result->>'state' = 'NEEDS_REVIEW', 'waits';
  select id into waiting from public.bank_transactions where provider_transaction_id = '1005';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert not exists (select 1 from public.bank_transactions), 'reader without finance.payment.post sees no bank lines';
  failed := null;
  begin perform public.resolve_bank_transaction(waiting, customer, null, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'reader cannot post it';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert exists (select 1 from public.bank_transactions where id = waiting and state = 'NEEDS_REVIEW'), 'accountant sees the waiting line';
  perform public.resolve_bank_transaction(waiting, customer, null, gen_random_uuid());
  assert (select state = 'POSTED' and reason = 'resolved' and resolved_by = '10000000-0000-4000-8000-000000000001' from public.bank_transactions where id = waiting), 'resolved';
  failed := null;
  begin perform public.dismiss_bank_transaction(waiting, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'bank_transaction_not_waiting', 'posted line cannot be dismissed';

  -- Order of one customer with another customer's code: not guessed.
  perform pg_temp.act_as_admin();
  result := pg_temp.sepay(jsonb_build_object('id', 1006, 'accountNumber', '0071000315', 'content', 'SO2026031501 KH316', 'transferType', 'in', 'transferAmount', 10000));
  assert result->>'state' = 'NEEDS_REVIEW' and (select reason = 'customer_mismatch' from public.bank_transactions where provider_transaction_id = '1006'), 'mismatch waits';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.dismiss_bank_transaction((select id from public.bank_transactions where provider_transaction_id = '1006'), gen_random_uuid());
  assert (select state = 'IGNORED' and reason = 'dismissed' from public.bank_transactions where provider_transaction_id = '1006'), 'dismissed';

  -- The person who switched the feed on left the branch: the money waits instead of failing the webhook.
  perform pg_temp.act_as_admin();
  update public.employees set active = false, deactivated_at = now() where id = '30000000-0000-4000-8000-000000000001';
  result := pg_temp.sepay(jsonb_build_object('id', 1007, 'accountNumber', '0071000315', 'content', 'TT KH315', 'transferType', 'in', 'transferAmount', 5000));
  assert result->>'state' = 'NEEDS_REVIEW' and (select reason = 'post_failed' and payment_id is null and customer_id = customer
    from public.bank_transactions where provider_transaction_id = '1007'), 'kept for the accountant: ' || result::text;
  assert auth.uid() is null, 'impersonation does not leak';
  update public.employees set active = true, deactivated_at = null where id = '30000000-0000-4000-8000-000000000001';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');

  -- Feed off: the portal falls back to the plain bank box (no options).
  perform public.set_finance_account_bank_feed(vcb, false, null, gen_random_uuid());
  perform pg_temp.act_as('7f315000-0000-4000-8000-0000000000a1');
  assert public.portal_debt_payment_options(customer) is null, 'no QR without automatic confirmation';
end
$test$;
