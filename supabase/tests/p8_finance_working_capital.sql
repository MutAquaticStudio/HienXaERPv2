begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

select has_table('public', 'receivables', 'Receivable exists');
select has_table('public', 'payables', 'Payable exists');
select has_table('public', 'receivable_ledger_entries', 'AR ledger exists');
select has_table('public', 'payable_ledger_entries', 'AP ledger exists');
select has_table('public', 'payments', 'Payment exists');
select has_table('public', 'payment_allocations', 'PaymentAllocation exists');
select has_table('public', 'payment_allocation_proposals', 'Allocation proposal is separate');
select has_table('public', 'customer_advances', 'CustomerAdvance exists');
select has_table('public', 'supplier_advances', 'SupplierAdvance exists');
select has_table('public', 'advance_allocations', 'Advance allocation exists');
select has_table('public', 'financial_accounts', 'FinancialAccount exists');
select has_table('public', 'financial_movements', 'FinancialMovement exists');
select has_table('public', 'expenses', 'Expense exists');
select has_table('public', 'expense_allocations', 'ExpenseAllocation exists');
select has_table('public', 'finance_adjustments', 'Adjustment and reversal record exists');
select has_table('public', 'bank_transactions', 'BankTransaction exists');
select has_table('public', 'reconciliation_matches', 'ReconciliationMatch exists');

select has_function('app_private', 'recognize_delivery_finance', array['uuid', 'uuid', 'uuid'], 'Delivery recognition is database-controlled');
select has_function('app_private', 'create_financial_account', array['text', 'text', 'financial_account_type', 'text', 'text', 'text', 'uuid'], 'Account creation is database-controlled');
select has_function('app_private', 'create_payment', array['payment_direction', 'uuid', 'uuid', 'uuid', 'uuid', 'text', 'numeric', 'date', 'text', 'text', 'uuid'], 'Payment creation is database-controlled');
select has_function('app_private', 'allocate_payment', array['uuid', 'uuid', 'uuid', 'numeric', 'uuid'], 'Allocation is database-controlled');
select has_function('app_private', 'post_payment', array['uuid', 'uuid'], 'Payment posting is database-controlled');
select has_function('app_private', 'reverse_payment', array['uuid', 'text', 'uuid'], 'Payment reversal is compensating');
select has_function('app_private', 'apply_customer_advance', array['uuid', 'uuid', 'numeric', 'uuid'], 'Customer advance is separately allocated');
select has_function('app_private', 'apply_supplier_advance', array['uuid', 'uuid', 'numeric', 'uuid'], 'Supplier advance is separately allocated');
select has_function('app_private', 'post_finance_adjustment', array['finance_adjustment_target', 'uuid', 'numeric', 'text', 'uuid'], 'Adjustment is database-controlled');
select has_function('app_private', 'reverse_finance_adjustment', array['uuid', 'text', 'uuid'], 'Adjustment reversal is compensating');
select has_function('app_private', 'reconcile_payment', array['uuid', 'uuid', 'uuid'], 'Bank reconciliation is database-controlled');
select has_function(
  'app_private', 'allocate_expense',
  array['uuid', 'text', 'uuid', 'numeric', 'direct_cost_category', 'text', 'uuid'],
  'Expense allocation is database-controlled'
);

select has_view('public', 'finance_aging', 'Aging view exists');
select has_view('public', 'finance_working_capital_summary', 'Working-capital view exists');
select has_trigger('public', 'delivery_readiness_events', 'delivery_completed_recognize_finance', 'Delivery completion recognizes finance atomically');
select has_trigger('public', 'financial_movements', 'financial_movements_immutable', 'Money movements are immutable');
select has_trigger('public', 'expenses', 'expenses_account_currency_guard', 'Expense currency must match its account');
select has_trigger('public', 'bank_transactions', 'bank_transactions_account_currency_guard', 'Bank transaction currency must match its account');

select ok(
  not has_table_privilege('authenticated', 'public.receivables', 'INSERT')
    and not has_table_privilege('authenticated', 'public.receivables', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.payments', 'INSERT')
    and not has_table_privilege('authenticated', 'public.payments', 'UPDATE'),
  'Browser clients cannot edit debt or payments directly'
);
select ok(
  has_table_privilege('authenticated', 'public.receivables', 'SELECT')
    and has_table_privilege('authenticated', 'public.financial_movements', 'SELECT'),
  'Authenticated finance reads are available behind RLS'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('DRIVER', 'OPERATOR_WORKER')
      and permission.code in (
        'finance.manage', 'receivable.adjust', 'payable.adjust', 'payment.create',
        'payment.allocate', 'payment.post', 'payment.reverse',
        'reconciliation.manage', 'expense.manage'
      )$$,
  $$values (0::bigint)$$,
  'Workers receive no finance mutation permission'
);

select * from finish(true);
rollback;
