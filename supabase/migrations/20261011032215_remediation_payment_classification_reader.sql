begin;
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
    COALESCE(c.display_name, s.name, e.display_name) AS counterparty_name,
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
notify pgrst,'reload schema';
commit;
