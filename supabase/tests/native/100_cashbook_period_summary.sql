-- FB2 Đợt 6: cashbook_period_summary gives opening, receipts, disbursements and closing for a period and account.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7c000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_TM', 'Tiền mặt thử', 'CASH', '10000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_NH', 'Ngân hàng thử', 'BANK', '10000000-0000-4000-8000-000000000001');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7c000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_KH7', 'Khách sổ quỹ thử', 'BUSINESS');
insert into public.suppliers(id, branch_id, code, name) values
  ('7c000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_NCC7', 'Nhà cung cấp sổ quỹ thử');
-- Before the period: cash in 1.000.000. In the period: cash in 500.000, bank in 2.000.000, cash out 300.000.
-- After the period: cash out 100.000.
insert into public.payments(id, branch_id, payment_number, direction, customer_id, supplier_id, account_id, amount_vnd, method, effective_at, posted_by) values
  ('7c000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-00000000000a', 'NT-PT-1', 'RECEIPT', '7c000000-0000-4000-8000-000000000003', null, '7c000000-0000-4000-8000-000000000001', 1000000, 'CASH', '2026-09-30T10:00:00+07', '10000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-00000000000a', 'NT-PT-2', 'RECEIPT', '7c000000-0000-4000-8000-000000000003', null, '7c000000-0000-4000-8000-000000000001', 500000, 'CASH', '2026-10-01T00:00:00+07', '10000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-00000000000a', 'NT-PT-3', 'RECEIPT', '7c000000-0000-4000-8000-000000000003', null, '7c000000-0000-4000-8000-000000000002', 2000000, 'BANK_TRANSFER', '2026-10-15T09:00:00+07', '10000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-00000000000a', 'NT-PC-1', 'DISBURSEMENT', null, '7c000000-0000-4000-8000-000000000004', '7c000000-0000-4000-8000-000000000001', 300000, 'CASH', '2026-10-31T23:59:00+07', '10000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-00000000000a', 'NT-PC-2', 'DISBURSEMENT', null, '7c000000-0000-4000-8000-000000000004', '7c000000-0000-4000-8000-000000000001', 100000, 'CASH', '2026-11-01T00:00:00+07', '10000000-0000-4000-8000-000000000001');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  cash constant uuid := '7c000000-0000-4000-8000-000000000001';
  from_at constant timestamptz := '2026-10-01T00:00:00+07';
  to_at constant timestamptz := '2026-11-01T00:00:00+07';
  summary jsonb;
  failed text;
begin
  -- Without receivable rights, from another branch or for an empty period it is refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.cashbook_period_summary(branch, from_at, to_at); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.cashbook_period_summary(branch, from_at, to_at); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.cashbook_period_summary(branch, to_at, from_at); exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_cashbook_period', format('reversed period, got %s', failed);

  -- All accounts: the period starts exactly at from_at and stops before to_at.
  summary := public.cashbook_period_summary(branch, from_at, to_at);
  assert summary = jsonb_build_object('opening_vnd', '1000000', 'receipts_vnd', '2500000', 'disbursements_vnd', '300000', 'closing_vnd', '3200000', 'payment_count', 3),
    format('all accounts %s', summary);
  -- One account.
  summary := public.cashbook_period_summary(branch, from_at, to_at, cash);
  assert summary = jsonb_build_object('opening_vnd', '1000000', 'receipts_vnd', '500000', 'disbursements_vnd', '300000', 'closing_vnd', '1200000', 'payment_count', 2),
    format('cash account %s', summary);
  -- The closing balance up to now matches cashbook_summary.
  assert (public.cashbook_period_summary(branch, from_at, '2027-01-01T00:00:00+07')->>'closing_vnd')::numeric
    = (select net_cash_vnd from public.cashbook_summary(branch)), 'closing equals net cash';

  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.cashbook_period_summary(uuid, timestamptz, timestamptz, uuid)', 'execute'), 'anon cannot execute';
end
$test$;
