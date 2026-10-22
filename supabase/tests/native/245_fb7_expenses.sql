-- FB7 item 10: "Ghi chi phí" like KiotViet — any payee (Khác / NCC / Nhân viên), paid now from a cash or bank account
-- (a disbursement in Sổ quỹ) or owed to a supplier, optionally kept out of profit (buying a truck).
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7e000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_TM', 'Tiền mặt thử', 'CASH', '10000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_NH', 'Ngân hàng thử', 'BANK', '10000000-0000-4000-8000-000000000001');
insert into public.suppliers(id, branch_id, code, name, payment_terms_days) values
  ('7e000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_NCC_CP', 'Nhà xe thử', 7);
insert into public.expense_categories(id, branch_id, code, name, created_by) values
  ('7e000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'NT_DN', 'Điện nước', '10000000-0000-4000-8000-000000000001');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  cash constant uuid := '7e000000-0000-4000-8000-000000000001';
  bank constant uuid := '7e000000-0000-4000-8000-000000000002';
  supplier constant uuid := '7e000000-0000-4000-8000-000000000003';
  utilities constant uuid := '7e000000-0000-4000-8000-000000000004';
  worker constant uuid := '30000000-0000-4000-8000-000000000001';
  at constant timestamptz := now() - interval '1 hour';
  op_marketing constant uuid := '7e000000-0000-4000-8000-0000000000a1';
  marketing uuid; again uuid; salary uuid; owed uuid; paid_supplier uuid; truck uuid; power uuid;
  row_expense public.expenses%rowtype; row_payment public.payments%rowtype; payable_id uuid; opex_before bigint; opex_after bigint;
  failed text;
begin
  -- Others' branch, a reader and anon cannot record an expense.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.record_operating_expense(branch, utilities, null, 100000, at, 'OTHER', null, null, 'Điện lực', 'PAID_NOW', cash, true, null, null, gen_random_uuid());
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.record_operating_expense(branch, utilities, null, 100000, at, 'OTHER', null, null, 'Điện lực', 'PAID_NOW', cash, true, null, null, gen_random_uuid());
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch must be refused, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  opex_before := (public.finance_dashboard_snapshot(branch, now() - interval '1 day', now() + interval '1 day', now())->'operating_expense'->>'value_vnd')::bigint;

  -- Marketing paid in cash to a company that is not a supplier: no supplier, a disbursement in Sổ quỹ naming the payee;
  -- the typed type "Marketing" is created for the branch.
  marketing := public.record_operating_expense(branch, null, 'Marketing', 2000000, at, 'OTHER', null, null, 'Công ty quảng cáo ABC',
    'PAID_NOW', cash, true, 'Chạy quảng cáo tháng 10', null, op_marketing);
  select * into row_expense from public.expenses where id = marketing;
  assert row_expense.approval_state = 'APPROVED' and row_expense.supplier_id is null and row_expense.payee_kind = 'OTHER'
    and row_expense.payee_name = 'Công ty quảng cáo ABC' and row_expense.settlement = 'PAID_NOW' and row_expense.counts_in_profit
    and row_expense.description = 'Chạy quảng cáo tháng 10', format('marketing expense %s', to_jsonb(row_expense));
  assert (select name from public.expense_categories where id = row_expense.category_id) = 'Marketing', 'typed type created';
  assert (select payee_display from public.expense_read where id = marketing) = 'Công ty quảng cáo ABC', 'expense list names the payee';
  assert not exists(select 1 from public.payable_obligations where expense_id = marketing), 'no supplier payable';
  select * into row_payment from public.payments where expense_id = marketing;
  assert row_payment.direction = 'DISBURSEMENT' and row_payment.amount_vnd = 2000000 and row_payment.account_id = cash
    and row_payment.method = 'CASH' and row_payment.supplier_id is null, format('marketing payment %s', to_jsonb(row_payment));
  assert (select counterparty_name from public.payment_read where id = row_payment.id) = 'Công ty quảng cáo ABC', 'Sổ quỹ names the payee';
  assert (select cash_delta_vnd from public.payment_read where id = row_payment.id) = -2000000, 'cash goes down';

  -- Pressing again returns the same expense; the same operation with other content is refused.
  again := public.record_operating_expense(branch, null, 'Marketing', 2000000, at, 'OTHER', null, null, 'Công ty quảng cáo ABC',
    'PAID_NOW', cash, true, 'Chạy quảng cáo tháng 10', null, op_marketing);
  assert again = marketing and (select count(*) from public.payments where expense_id = marketing) = 1, 'replay is idempotent';
  failed := null;
  begin perform public.record_operating_expense(branch, null, 'Marketing', 2100000, at, 'OTHER', null, null, 'Công ty quảng cáo ABC',
    'PAID_NOW', cash, true, 'Chạy quảng cáo tháng 10', null, op_marketing);
  exception when others then failed := sqlerrm; end;
  assert failed = 'operation_payload_conflict', format('changed replay, got %s', failed);

  -- A typed type that already exists (any case) is reused.
  power := public.record_operating_expense(branch, null, 'điện NƯỚC', 500000, at, 'OTHER', null, null, null, 'PAID_NOW', cash, true, null, null, gen_random_uuid());
  assert (select category_id from public.expenses where id = power) = utilities, 'existing type reused';
  assert (select payee_name from public.expenses where id = power) = 'Khác', 'blank payee is Khác';

  -- Salary paid to an employee by bank transfer.
  salary := public.record_operating_expense(branch, null, 'Lương thưởng', 7000000, at, 'EMPLOYEE', null, worker, null, 'PAID_NOW', bank, true, null, null, gen_random_uuid());
  select * into row_payment from public.payments where expense_id = salary;
  assert row_payment.method = 'BANK_TRANSFER' and row_payment.payee_name = 'Nhân viên thử 1', format('salary payment %s', to_jsonb(row_payment));
  assert (select payee_display from public.expense_read where id = salary) = 'Nhân viên thử 1', 'employee payee shown';

  -- Owed to a supplier: a payable due after the supplier's terms, no payment.
  owed := public.record_operating_expense(branch, null, 'Vận chuyển', 1500000, at, 'SUPPLIER', supplier, null, null, 'PAYABLE', null, true, null, null, gen_random_uuid());
  select id into payable_id from public.payable_obligations where expense_id = owed and original_amount_vnd = 1500000 and supplier_id = supplier;
  assert payable_id is not null, 'supplier payable recorded';
  assert (select due_date from public.payable_obligations where id = payable_id) = (at at time zone 'Asia/Ho_Chi_Minh')::date + 7, 'due after terms';
  assert not exists(select 1 from public.payments where expense_id = owed), 'owed is not paid';

  -- Paid to a supplier now: the payable is settled at once, so the supplier's balance does not move.
  paid_supplier := public.record_operating_expense(branch, null, 'Vận chuyển', 800000, at, 'SUPPLIER', supplier, null, null, 'PAID_NOW', cash, true, null, null, gen_random_uuid());
  select id into payable_id from public.payable_obligations where expense_id = paid_supplier;
  select * into row_payment from public.payments where expense_id = paid_supplier;
  assert row_payment.supplier_id = supplier and row_payment.payee_name is null, 'supplier payment';
  assert (select sum(amount_delta_vnd) from public.payment_allocations where payable_obligation_id = payable_id and payment_id = row_payment.id) = 800000,
    'payable settled by the payment';

  -- A truck is paid in cash but kept out of profit.
  truck := public.record_operating_expense(branch, null, 'Mua tài sản/xe', 300000000, at, 'OTHER', null, null, 'Đại lý xe tải', 'PAID_NOW', bank, false, null, null, gen_random_uuid());
  assert not (select counts_in_profit from public.expenses where id = truck), 'truck kept out of profit';
  opex_after := (public.finance_dashboard_snapshot(branch, now() - interval '1 day', now() + interval '1 day', now())->'operating_expense'->>'value_vnd')::bigint;
  assert opex_after - opex_before = 2000000 + 500000 + 7000000 + 1500000 + 800000, format('opex %s → %s leaves the truck out', opex_before, opex_after);

  -- Invalid shapes are refused: owed to someone who is not a supplier, paid without an account, nothing to pay, no type.
  failed := null;
  begin perform public.record_operating_expense(branch, utilities, null, 100000, at, 'OTHER', null, null, 'A', 'PAYABLE', null, true, null, null, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_expense', format('payable to other, got %s', failed);
  failed := null;
  begin perform public.record_operating_expense(branch, utilities, null, 100000, at, 'OTHER', null, null, 'A', 'PAID_NOW', null, true, null, null, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_expense', format('paid without account, got %s', failed);
  failed := null;
  begin perform public.record_operating_expense(branch, utilities, null, 0, at, 'OTHER', null, null, 'A', 'PAID_NOW', cash, true, null, null, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_expense', format('zero amount, got %s', failed);
  failed := null;
  begin perform public.record_operating_expense(branch, null, ' ', 100000, at, 'OTHER', null, null, 'A', 'PAID_NOW', cash, true, null, null, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_expense', format('no type, got %s', failed);
  failed := null;
  begin perform public.record_operating_expense(branch, utilities, null, 100000, at, 'SUPPLIER', null, null, null, 'PAYABLE', null, true, null, null, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_expense_supplier', format('supplier missing, got %s', failed);

  -- A wrong disbursement can still be reversed from Sổ quỹ.
  perform public.reverse_payment((select id from public.payments where expense_id = marketing), 'Ghi nhầm quỹ', gen_random_uuid());
  assert exists(select 1 from public.payments p join public.payments o on o.id = p.reversal_of_payment_id where o.expense_id = marketing), 'reversed';

  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.record_operating_expense(uuid, uuid, text, bigint, timestamptz, text, uuid, uuid, text, text, uuid, boolean, text, uuid, uuid)', 'execute'),
    'anon cannot execute';
  -- Older expenses keep the supplier shape.
  failed := null;
  begin
    insert into public.expenses(branch_id, expense_number, category_id, supplier_id, amount_vnd, effective_at, due_date, description, activity_kind, approval_state, created_by, payee_kind)
    values (branch, 'NT-EXP-X', utilities, null, 1000, now(), current_date, 'Thiếu nhà cung cấp', 'OPERATIONS', 'DRAFT', '10000000-0000-4000-8000-000000000001', 'SUPPLIER');
  exception when check_violation then failed := 'check';
  end;
  assert failed = 'check', 'a supplier expense needs its supplier';
end
$test$;
