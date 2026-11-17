-- D96 (F1): reversing a receipt that the SePay feed posted for the wrong customer puts the bank transaction back in the queue
-- (NEEDS_REVIEW, reason 'reversed', links cleared) and reverses its statement match; "Ghi thu" from the queue then posts the
-- right customer's receipt and matches it. A reversal of an ordinary receipt touches no bank transaction.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f372000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH3721', 'Khách 372 gõ nhầm', 'BUSINESS'),
  ('7f372000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_KH3722', 'Khách 372 thật', 'BUSINESS');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f372000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', 'NT_NH372', 'Ngân hàng 372', 'BANK', '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  owner constant uuid := '10000000-0000-4000-8000-000000000001';
  wrong constant uuid := '7f372000-0000-4000-8000-000000000001';
  right_customer constant uuid := '7f372000-0000-4000-8000-000000000002';
  account constant uuid := '7f372000-0000-4000-8000-000000000010';
  tx constant uuid := '7f372000-0000-4000-8000-000000000020';
  receipt uuid; other uuid; again uuid;
begin
  -- The feed posted 2 000 000 ₫ for the wrong customer and matched it to the statement line.
  perform pg_temp.act_as(owner);
  receipt := public.post_payment('20000000-0000-4000-8000-00000000000a', 'RECEIPT', wrong, null, account, 2000000, now(), 'BANK_TRANSFER',
    'SePay FT372', '[]'::jsonb, 2000000, '7f372000-0000-4000-8000-0000000000a1');
  other := public.post_payment('20000000-0000-4000-8000-00000000000a', 'RECEIPT', wrong, null, account, 300000, now(), 'CASH',
    null, '[]'::jsonb, 300000, '7f372000-0000-4000-8000-0000000000a2');
  perform pg_temp.act_as_admin();
  insert into public.bank_transactions(id, provider_transaction_id, branch_id, account_id, transfer_type, amount_vnd, transaction_at, raw, state, reason,
    customer_id, payment_id, content)
  values (tx, 'SEPAY-372', '20000000-0000-4000-8000-00000000000a', account, 'in', 2000000, now(), '{}'::jsonb, 'POSTED', 'matched', wrong, receipt,
    'CK NT_KH3721');
  insert into public.payment_reconciliation_matches(branch_id, payment_id, matched_amount_vnd, statement_effective_at, statement_reference, matched_by)
  values ('20000000-0000-4000-8000-00000000000a', receipt, 2000000, now(), 'SePay SEPAY-372', owner);

  -- An ordinary receipt: nothing in the bank queue changes.
  perform pg_temp.act_as(owner);
  perform public.reverse_payment(other, 'Ghi nhầm tiền mặt', '7f372000-0000-4000-8000-0000000000b1');
  perform pg_temp.act_as_admin();
  assert (select state from public.bank_transactions where id = tx) = 'POSTED', 'other reversals leave the bank line';

  -- The accountant reverses the wrong receipt.
  perform pg_temp.act_as(owner);
  perform public.reverse_payment(receipt, 'Khách gõ nhầm mã khách', '7f372000-0000-4000-8000-0000000000b2');
  assert public.reverse_payment(receipt, 'Khách gõ nhầm mã khách', '7f372000-0000-4000-8000-0000000000b2') is not null, 'replay';
  perform pg_temp.act_as_admin();
  assert (select state || ':' || reason from public.bank_transactions where id = tx) = 'NEEDS_REVIEW:reversed', 'back in the queue';
  assert (select payment_id is null and customer_id is null and sales_order_id is null and payment_request_id is null
    from public.bank_transactions where id = tx), 'links cleared';
  assert (select sum(matched_amount_vnd) from public.payment_reconciliation_matches where payment_id = receipt) = 0, 'statement match reversed';
  assert (select count(*) from public.payment_reconciliation_matches where payment_id = receipt) = 2, 'original match kept, reversal row added';
  assert exists (select 1 from public.audit_events where action = 'bank_transaction.reopened' and entity_id = tx), 'reopening audited';

  -- "Ghi thu" from the queue for the right customer.
  perform pg_temp.act_as(owner);
  again := public.resolve_bank_transaction(tx, right_customer, null, '7f372000-0000-4000-8000-0000000000c1');
  perform pg_temp.act_as_admin();
  assert (select state || ':' || reason from public.bank_transactions where id = tx) = 'POSTED:resolved', 'resolved';
  assert (select payment_id from public.bank_transactions where id = tx) = again, 'linked to the new receipt';
  assert (select customer_id from public.payments where id = again) = right_customer, 'right customer';
  assert (select sum(matched_amount_vnd) from public.payment_reconciliation_matches where payment_id = again) = 2000000, 'new receipt matched';

  -- The amount sign follows the reversal link.
  begin
    insert into public.payment_reconciliation_matches(branch_id, payment_id, matched_amount_vnd, statement_effective_at, statement_reference, matched_by)
    values ('20000000-0000-4000-8000-00000000000a', again, -5, now(), 'Sai dấu', owner);
    assert false, 'negative match without a reversal link refused';
  exception when check_violation then null;
  end;
end
$test$;
