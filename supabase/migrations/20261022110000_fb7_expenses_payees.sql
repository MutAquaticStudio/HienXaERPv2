-- FB7 (Owner 22/10): "Chi phí" like KiotViet. An expense has a type ("Loại chi", picked or typed), a payee that is anyone
-- ("Khác": marketing, a car dealer…), a supplier or an employee, and is either paid now from a cash/bank account (a
-- disbursement in Sổ quỹ) or owed to a supplier. Buying an asset (a truck) can be kept out of profit. A non-cash expense
-- (stock-count loss, 20261022120000) has no payment at all. Older expenses keep their supplier and payable.
-- 1/3: payee, settlement and profit flags; Sổ quỹ and the expense list name the payee.
begin;
alter table public.expenses alter column supplier_id drop not null;
alter table public.expenses
  add column payee_kind text not null default 'SUPPLIER' check (payee_kind in ('OTHER', 'SUPPLIER', 'EMPLOYEE')),
  add column payee_name text check (payee_name is null or char_length(payee_name) between 1 and 160),
  add column employee_id uuid references public.employees(id) on delete restrict,
  add column settlement text not null default 'PAYABLE' check (settlement in ('PAYABLE', 'PAID_NOW', 'NON_CASH')),
  add column counts_in_profit boolean not null default true,
  add column stock_count_id uuid unique references public.stock_counts(id) on delete restrict,
  add constraint expenses_payee_shape check (
    (payee_kind = 'SUPPLIER' and supplier_id is not null and employee_id is null)
    or (payee_kind = 'EMPLOYEE' and employee_id is not null and supplier_id is null)
    or (payee_kind = 'OTHER' and supplier_id is null and employee_id is null)),
  add constraint expenses_settlement_shape check (settlement <> 'PAYABLE' or payee_kind = 'SUPPLIER');

-- A disbursement paying an expense to someone who is not a customer, supplier or employee carries the payee's name.
alter table public.payments
  add column expense_id uuid references public.expenses(id) on delete restrict,
  add column payee_name text check (payee_name is null or char_length(payee_name) between 1 and 160);
alter table public.payments drop constraint payments_party_shape;
alter table public.payments add constraint payments_party_shape check (
  num_nonnulls(customer_id, supplier_id, employee_id) = 1
  or (num_nonnulls(customer_id, supplier_id, employee_id) = 0 and direction = 'DISBURSEMENT' and expense_id is not null and payee_name is not null)
  or (num_nonnulls(customer_id, supplier_id, employee_id) = 0 and reversal_of_payment_id is not null));
create index payments_expense_idx on public.payments(expense_id) where expense_id is not null;

-- Sổ quỹ names the payee of such a disbursement (same view as 20261011032215 otherwise).
create or replace view public.payment_read with(security_invoker=true) as select
q."id",
q."branch_id",
q."payment_number",
q."direction",
q."customer_id",
q."supplier_id",
q."counterparty_name",
q."account_id",
q."account_code",
q."account_name",
q."account_kind",
q."amount_vnd",
q."allocated_amount_vnd",
case when q.posting_state='REVERSED' or q.reversal_of_payment_id is not null then 0 else b.advance_remaining_vnd::bigint end as advance_amount_vnd,
case when q.posting_state='REVERSED' or q.reversal_of_payment_id is not null then 0 else greatest(0,b.available_amount_vnd::bigint-b.advance_remaining_vnd::bigint) end as unallocated_amount_vnd,
q."method",
q."external_reference",
q."effective_at",
q."posted_at",
q."reversal_of_payment_id",
q."reversal_payment_id",
q."posting_state",
q."reconciled_amount_vnd",
q."reconciliation_difference_vnd",
q."reconciliation_state",
q."cash_delta_vnd",
q."employee_id"
from (SELECT p.id,
    p.branch_id,
    p.payment_number,
    p.direction,
    p.customer_id,
    p.supplier_id,
    COALESCE(c.display_name, s.name, e.display_name, p.payee_name) AS counterparty_name,
    p.account_id,
    a.code AS account_code,
    a.name AS account_name,
    a.account_kind,
    p.amount_vnd,
    COALESCE(alloc.amount_vnd, 0::numeric)::bigint AS allocated_amount_vnd,
    COALESCE(adv.amount_vnd, 0::numeric)::bigint AS advance_amount_vnd,
        CASE
            WHEN p.reversal_of_payment_id IS NULL THEN (p.amount_vnd::numeric - COALESCE(GREATEST(alloc.amount_vnd, 0::numeric), 0::numeric) - COALESCE(GREATEST(adv.amount_vnd, 0::numeric), 0::numeric))::bigint
            ELSE 0::bigint
        END AS unallocated_amount_vnd,
    p.method,
    p.external_reference,
    p.effective_at,
    p.posted_at,
    p.reversal_of_payment_id,
    reversal.id AS reversal_payment_id,
        CASE
            WHEN reversal.id IS NOT NULL THEN 'REVERSED'::text
            ELSE 'POSTED'::text
        END AS posting_state,
    COALESCE(matches.amount_vnd, 0::numeric)::bigint AS reconciled_amount_vnd,
    (p.amount_vnd::numeric - COALESCE(matches.amount_vnd, 0::numeric))::bigint AS reconciliation_difference_vnd,
        CASE
            WHEN COALESCE(matches.amount_vnd, 0::numeric) = 0::numeric THEN 'UNMATCHED'::text
            WHEN matches.amount_vnd < p.amount_vnd::numeric THEN 'PARTIAL'::text
            ELSE 'MATCHED'::text
        END AS reconciliation_state,
        CASE
            WHEN p.direction = 'RECEIPT'::text THEN p.amount_vnd
            ELSE - p.amount_vnd
        END AS cash_delta_vnd,
    p.employee_id
   FROM payments p
     JOIN finance_accounts a ON a.id = p.account_id
     LEFT JOIN customers c ON c.id = p.customer_id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN employees e ON e.id = p.employee_id
     LEFT JOIN payments reversal ON reversal.reversal_of_payment_id = p.id
     LEFT JOIN ( SELECT payment_allocations.payment_id,
            sum(payment_allocations.amount_delta_vnd) AS amount_vnd
           FROM payment_allocations
          GROUP BY payment_allocations.payment_id) alloc ON alloc.payment_id = p.id
     LEFT JOIN ( SELECT advances.payment_id,
            sum(advances.amount_delta_vnd) AS amount_vnd
           FROM advances
          GROUP BY advances.payment_id) adv ON adv.payment_id = p.id
     LEFT JOIN ( SELECT payment_reconciliation_matches.payment_id,
            sum(payment_reconciliation_matches.matched_amount_vnd) AS amount_vnd
           FROM payment_reconciliation_matches
          GROUP BY payment_reconciliation_matches.payment_id) matches ON matches.payment_id = p.id) q left join public.payment_allocation_source_read b on b.id=q.id;

create or replace view public.expense_read with (security_invoker = true) as
select e.id, e.branch_id, e.expense_number, e.category_id, c.code as category_code, c.name as category_name,
  e.supplier_id, s.name as supplier_name, e.amount_vnd, e.effective_at, e.due_date, e.description, e.activity_kind,
  e.sales_order_id, e.customer_id, e.site_id, e.sales_employee_id, e.evidence_object_id, e.approval_state, e.version,
  e.created_at, e.approved_at,
  e.payee_kind, coalesce(s.name, emp.display_name, e.payee_name) as payee_display, e.employee_id, e.settlement, e.counts_in_profit, e.stock_count_id
from public.expenses e
join public.expense_categories c on c.id = e.category_id
left join public.suppliers s on s.id = e.supplier_id
left join public.employees emp on emp.id = e.employee_id;

notify pgrst, 'reload schema';
commit;
