-- D96 (Owner 16/11/2026 "Ok giờ hãy fix các điểm chú ý", audit F1): reversing a receipt made from a SePay bank transaction
-- (public.reverse_payment, latest body 20261011102746) puts the bank transaction back in the accountant's queue
-- (state NEEDS_REVIEW, reason 'reversed'; the link to the reversed receipt, customer, order, service job and payment request
-- is cleared, the audit event `bank_transaction.reopened` keeps the history) and reverses its statement match. A match is
-- reversed by an immutable negative row (`reversal_of_match_id`) on the same receipt, so its matched total becomes 0 and the
-- original row stays. "Ghi thu" from the queue (resolve_bank_transaction) then posts and matches the right customer's receipt.
begin;

alter table public.payment_reconciliation_matches
  add column reversal_of_match_id uuid unique references public.payment_reconciliation_matches(id) on delete restrict;
alter table public.payment_reconciliation_matches drop constraint payment_reconciliation_matches_matched_amount_vnd_check;
alter table public.payment_reconciliation_matches add constraint payment_reconciliation_matches_amount_sign check (
  (reversal_of_match_id is null and matched_amount_vnd > 0) or (reversal_of_match_id is not null and matched_amount_vnd < 0));

CREATE OR REPLACE FUNCTION public.reverse_payment(target_payment_id uuid, reversal_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare original public.payments%rowtype; payload_hash text; receipt public.command_receipts%rowtype; reversal_id uuid; bank public.bank_transactions%rowtype;
begin

  select * into original from public.payments where id=target_payment_id;
  if original.id is null or not private.has_permission(original.branch_id,'finance.payment.reverse') then raise exception 'forbidden_or_payment_not_found' using errcode='42501'; end if;
  if char_length(trim(reversal_reason)) not between 3 and 500 then raise exception 'reversal_reason_required' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('payment_id',target_payment_id,'reason',trim(reversal_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id=reverse_payment.operation_id;
  if found then if receipt.command_name<>'reverse_payment' or receipt.payload_hash<>payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  if original.customer_credit_refund_id is not null then perform 1 from public.customer_credits where id=original.customer_credit_refund_id for update;end if;
  select * into original from public.payments where id=target_payment_id for update;
  if exists(select 1 from public.payments p where p.id=target_payment_id and p.supplier_credit_refund_id is not null) or exists(select 1 from public.supplier_credit_funds f where f.source_payment_id=target_payment_id) then raise exception 'payment_funds_supplier_credit_use_source_workflow' using errcode='23514';end if;
  if exists(select 1 from public.customer_credit_funds f where f.source_payment_id=original.id) then raise exception 'payment_funds_customer_credit_use_source_workflow' using errcode='55000';end if;
  if original.reversal_of_payment_id is not null or exists(select 1 from public.payments where reversal_of_payment_id=original.id) then raise exception 'payment_already_reversed_or_is_reversal' using errcode='55000'; end if;
  insert into public.payments(branch_id,payment_number,direction,customer_id,supplier_id,employee_id,account_id,amount_vnd,method,external_reference,effective_at,reversal_of_payment_id,reversal_reason,posted_by) values(original.branch_id,'REV-'||to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.finance_payment_number_seq')::text,6,'0'),case when original.direction='RECEIPT' then 'DISBURSEMENT' else 'RECEIPT' end,original.customer_id,original.supplier_id,original.employee_id,original.account_id,original.amount_vnd,original.method,original.external_reference,now(),original.id,trim(reversal_reason),(select auth.uid())) returning id into reversal_id;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,payable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by) select reversal_id,receivable_obligation_id,payable_obligation_id,-amount_delta_vnd,id,(select auth.uid()) from public.payment_allocations where payment_id=original.id and reversal_of_allocation_id is null;
  insert into public.advance_allocations(branch_id,advance_id,amount_delta_vnd,reversal_of_advance_allocation_id,source_reversal_payment_id,recorded_by)
  select branch_id,advance_id,-amount_delta_vnd,id,reversal_id,(select auth.uid()) from public.advance_allocations
  where advance_id in(select id from public.advances where payment_id=original.id and reversal_of_advance_id is null)
   and amount_delta_vnd>0;
  insert into public.advances(branch_id,payment_id,advance_side,customer_id,supplier_id,amount_delta_vnd,reversal_of_advance_id,recorded_by) select branch_id,reversal_id,advance_side,customer_id,supplier_id,-amount_delta_vnd,id,(select auth.uid()) from public.advances where payment_id=original.id and reversal_of_advance_id is null;
  if original.customer_credit_refund_id is not null then
    insert into public.customer_credit_settlements(credit_fund_id,settlement_kind,amount_delta_vnd,payment_id,
      reversal_of_settlement_id,source_reversal_payment_id,source_operation_id,recorded_by)
    select credit_fund_id,'REFUND',-amount_delta_vnd,payment_id,id,reversal_id,operation_id,(select auth.uid())
      from public.customer_credit_settlements where payment_id=original.id and amount_delta_vnd>0;
  end if;
  -- D96 (F1): a receipt the SePay feed (or the accountant's "Ghi thu" from the queue) posted goes back to the bank queue: the bank
  -- transaction waits again (NEEDS_REVIEW, reason 'reversed', no customer / order / request / receipt link) and its statement
  -- match is reversed, so the accountant resolves it to the right customer and the new receipt is matched to the statement.
  select * into bank from public.bank_transactions t where t.payment_id = original.id for update;
  if bank.id is not null then
    insert into public.payment_reconciliation_matches(branch_id, payment_id, matched_amount_vnd, statement_effective_at, statement_reference,
      matched_by, reversal_of_match_id)
    select m.branch_id, m.payment_id, -m.matched_amount_vnd, m.statement_effective_at, left('Đảo ' || m.statement_reference, 160),
      (select auth.uid()), m.id
    from public.payment_reconciliation_matches m
    where m.payment_id = original.id and m.reversal_of_match_id is null and m.matched_amount_vnd > 0
      and not exists (select 1 from public.payment_reconciliation_matches x where x.reversal_of_match_id = m.id);
    update public.bank_transactions set state = 'NEEDS_REVIEW', reason = 'reversed', payment_id = null, customer_id = null,
      sales_order_id = null, service_job_id = null, payment_request_id = null, resolved_by = null, resolved_at = null
    where id = bank.id;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values ((select auth.uid()), original.branch_id, 'bank_transaction.reopened', 'bank_transaction', bank.id, operation_id,
      array['state', 'payment_id', 'reconciliation'], 'Đảo phiếu thu ' || original.payment_number);
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'reverse_payment',payload_hash,'payment',reversal_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values((select auth.uid()),original.branch_id,'payment.reversed','payment',original.id,operation_id,array['reversal'],trim(reversal_reason));
  return reversal_id;
end $function$
;

notify pgrst, 'reload schema';
commit;
