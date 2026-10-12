begin;
create table public.payment_notice_match_reversals(
 id uuid primary key default gen_random_uuid(),match_id uuid not null unique references public.payment_notice_matches(id),branch_id uuid not null references public.branches(id),
 reason text not null check(char_length(trim(reason)) between 3 and 500),recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),source_operation_id uuid not null unique
);
alter table public.payment_notice_match_reversals enable row level security;
create policy notice_match_reversal_read on public.payment_notice_match_reversals for select to authenticated using(private.has_permission(branch_id,'finance.payment_notice.review'));
grant select on public.payment_notice_match_reversals to authenticated;revoke insert,update,delete on public.payment_notice_match_reversals from authenticated,anon;
create trigger notice_match_reversal_immutable before update or delete on public.payment_notice_match_reversals for each row execute function private.reject_r7_posted_mutation();
create function public.reverse_payment_notice_match(target_match_id uuid,reversal_reason text,expected_notice_version integer,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
declare m public.payment_notice_matches%rowtype;n public.payment_notices%rowtype;r public.command_receipts%rowtype;h text;rid uuid;
begin
 select * into m from public.payment_notice_matches where id=target_match_id;
 if m.id is null or not private.has_permission(m.branch_id,'finance.payment_notice.review') or not private.has_permission(m.branch_id,'finance.reconcile') then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'reverse_payment_notice_match');perform pg_advisory_xact_lock(hashtextextended('notice_match:'||operation_id::text,0));
 h:=private.command_payload_hash(jsonb_build_array(target_match_id,trim(reversal_reason),expected_notice_version));select * into r from public.command_receipts where command_receipts.operation_id=reverse_payment_notice_match.operation_id;
 if found then if r.command_name<>'reverse_payment_notice_match' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 perform 1 from public.payments where id=m.payment_id for update;select * into n from public.payment_notices where id=m.notice_id for update;
 if n.version is distinct from expected_notice_version then raise exception 'stale_payment_notice_version' using errcode='PT409';end if;
 if operation_id is null or reversal_reason is null or char_length(trim(reversal_reason)) not between 3 and 500 then raise exception 'notice_reversal_reason_required' using errcode='22023';end if;
 insert into public.payment_notice_match_reversals(match_id,branch_id,reason,recorded_by,source_operation_id) values(m.id,m.branch_id,trim(reversal_reason),auth.uid(),operation_id) returning id into rid;
 update public.payment_notices set version=version+1 where id=n.id;
 insert into public.command_receipts values(operation_id,auth.uid(),'reverse_payment_notice_match',h,'payment_notice_match_reversal',rid,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values(auth.uid(),m.branch_id,'payment_notice.match_reversed','payment_notice',n.id,operation_id,array['source_match','matching_coverage','notice_version'],trim(reversal_reason));return rid;
end $fn$;
revoke all on function public.reverse_payment_notice_match(uuid,text,integer,uuid) from public,anon;
grant execute on function public.reverse_payment_notice_match(uuid,text,integer,uuid) to authenticated;
alter table private.command_drafts drop constraint command_drafts_command_name_check;
alter table private.command_drafts add constraint command_drafts_command_name_check CHECK ((command_name = ANY (ARRAY['post_payment'::text, 'receive_purchase_order'::text, 'verify_supplier_fulfillment'::text, 'allocate_payment'::text, 'adjust_return_receivable'::text, 'refund_customer_credit'::text, 'offset_customer_credit'::text, 'reverse_customer_credit_offset'::text, 'resolve_commission_reconciliation'::text, 'create_delivery_expense'::text, 'approve_expense'::text, 'create_warehouse_transfer'::text, 'record_warehouse_transfer_event'::text, 'create_supplier_return'::text, 'record_supplier_return_event'::text, 'approve_supplier_return_credit'::text, 'refund_supplier_credit'::text, 'offset_supplier_credit'::text, 'register_supplier_document'::text, 'review_supplier_document'::text, 'create_invoice_draft'::text, 'approve_invoice_business'::text, 'cancel_invoice_draft'::text, 'create_invoice_adjustment_draft'::text, 'register_purchase_invoice_source'::text, 'match_payment_notice'::text, 'review_payment_notice'::text, 'record_payment_reconciliation'::text, 'reverse_payment_notice_match'::text])));
CREATE OR REPLACE FUNCTION public.get_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source','match_payment_notice','review_payment_notice','record_payment_reconciliation','reverse_payment_notice_match')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then case when private.has_permission(target_branch_id,'inventory.reserve') then 'inventory.reserve' when private.has_permission(target_branch_id,'purchasing.confirm') then 'purchasing.confirm' else 'purchasing.cancel' end when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' when 'register_supplier_document' then 'finance.ap.adjust' when 'review_supplier_document' then 'finance.ap.read' when 'create_invoice_draft' then 'finance.ar.adjust' when 'approve_invoice_business' then 'finance.reconcile' when 'cancel_invoice_draft' then 'finance.ar.adjust' when 'create_invoice_adjustment_draft' then 'finance.ar.adjust' when 'register_purchase_invoice_source' then 'finance.ap.adjust' when 'review_payment_notice' then 'finance.payment_notice.review' when 'match_payment_notice' then 'finance.payment_notice.review' when 'record_payment_reconciliation' then 'finance.reconcile' when 'reverse_payment_notice_match' then 'finance.payment_notice.review' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 select * into d from private.command_drafts where operation_id=target_operation_id and actor_auth_user_id=(select auth.uid())
 and branch_id=target_branch_id and command_name=target_command;
 if d.operation_id is null then return null;end if;
 return jsonb_build_object('operation_id',d.operation_id,'entries',d.form_entries);
end $function$
;
CREATE OR REPLACE FUNCTION public.lookup_command_outcome(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.command_receipts%rowtype; b uuid; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source','match_payment_notice','review_payment_notice','record_payment_reconciliation','reverse_payment_notice_match')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then case when private.has_permission(target_branch_id,'inventory.reserve') then 'inventory.reserve' when private.has_permission(target_branch_id,'purchasing.confirm') then 'purchasing.confirm' else 'purchasing.cancel' end when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' when 'register_supplier_document' then 'finance.ap.adjust' when 'review_supplier_document' then 'finance.ap.read' when 'create_invoice_draft' then 'finance.ar.adjust' when 'approve_invoice_business' then 'finance.reconcile' when 'cancel_invoice_draft' then 'finance.ar.adjust' when 'create_invoice_adjustment_draft' then 'finance.ar.adjust' when 'register_purchase_invoice_source' then 'finance.ap.adjust' when 'review_payment_notice' then 'finance.payment_notice.review' when 'match_payment_notice' then 'finance.payment_notice.review' when 'record_payment_reconciliation' then 'finance.reconcile' when 'reverse_payment_notice_match' then 'finance.payment_notice.review' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 select * into r from public.command_receipts where operation_id=target_operation_id;
 if r.operation_id is null or r.actor_auth_user_id is distinct from(select auth.uid()) or r.command_name<>target_command
 then return jsonb_build_object('status','UNKNOWN');end if;
 if target_command in('post_payment','allocate_payment','refund_customer_credit') and r.result_type='payment' then
  select branch_id into b from public.payments where id=r.result_entity_id;
 elsif target_command='adjust_return_receivable' and r.result_type='receivable_adjustment' then
  select o.branch_id into b from public.receivable_adjustments a join public.receivable_obligations o on o.id=a.obligation_id where a.id=r.result_entity_id;
 elsif target_command in('adjust_return_receivable','offset_customer_credit','reverse_customer_credit_offset') and r.result_type='customer_credit' then
  select branch_id into b from public.customer_credits where id=r.result_entity_id;
 elsif target_command='review_payment_notice' and r.result_type='payment_notice' then
  select branch_id into b from public.payment_notices where id=r.result_entity_id;
 elsif target_command='match_payment_notice' and r.result_type='payment_notice_match' then
  select branch_id into b from public.payment_notice_matches where id=r.result_entity_id;
 elsif target_command='reverse_payment_notice_match' and r.result_type='payment_notice_match_reversal' then
  select branch_id into b from public.payment_notice_match_reversals where id=r.result_entity_id;
 elsif target_command='record_payment_reconciliation' and r.result_type='payment_reconciliation_match' then
  select branch_id into b from public.payment_reconciliation_matches where id=r.result_entity_id;
 elsif target_command in('register_supplier_document','review_supplier_document') and r.result_type='supplier_document' then
  select branch_id into b from public.supplier_documents where id=r.result_entity_id;
 elsif target_command in('create_invoice_draft','approve_invoice_business','cancel_invoice_draft') and r.result_type='invoice_intent' then
  select branch_id into b from public.invoice_intents where id=r.result_entity_id;
 elsif target_command='create_invoice_adjustment_draft' and r.result_type='invoice_adjustment_draft' then
  select branch_id into b from public.invoice_adjustment_drafts where id=r.result_entity_id;
 elsif target_command='register_purchase_invoice_source' and r.result_type='purchase_invoice_registry' then
  select branch_id into b from public.purchase_invoice_registry where id=r.result_entity_id;
 elsif target_command='create_supplier_return' and r.result_type='supplier_return_case' then
  select branch_id into b from public.supplier_return_cases where id=r.result_entity_id;
 elsif target_command='record_supplier_return_event' and r.result_type='supplier_return_event' then
  select branch_id into b from public.supplier_return_events where id=r.result_entity_id;
 elsif target_command in('approve_supplier_return_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source','match_payment_notice','review_payment_notice','record_payment_reconciliation','reverse_payment_notice_match') and r.result_type='supplier_return_credit' then
  select branch_id into b from public.supplier_return_credits where id=r.result_entity_id;
 elsif target_command='refund_supplier_credit' and r.result_type='payment' then
  select branch_id into b from public.payments where id=r.result_entity_id;
 elsif target_command='create_warehouse_transfer' and r.result_type='warehouse_transfer' then
  select branch_id into b from public.warehouse_transfers where id=r.result_entity_id;
 elsif target_command='record_warehouse_transfer_event' and r.result_type='warehouse_transfer_event' then
  select t.branch_id into b from public.warehouse_transfer_events e join public.warehouse_transfers t on t.id=e.transfer_id where e.id=r.result_entity_id;
 elsif target_command in('create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source','match_payment_notice','review_payment_notice','record_payment_reconciliation','reverse_payment_notice_match') and r.result_type='expense' then
  select branch_id into b from public.expenses where id=r.result_entity_id;
 elsif target_command='resolve_commission_reconciliation' and r.result_type='commission_review_resolution' then
  select branch_id into b from public.commission_review_resolutions where id=r.result_entity_id;
 elsif target_command='receive_purchase_order' and r.result_type='purchase_receipt' then
  select branch_id into b from public.purchase_receipts where id=r.result_entity_id;
 elsif target_command='verify_supplier_fulfillment' and r.result_type='supplier_fulfillment' then
  select branch_id into b from public.supplier_fulfillments where id=r.result_entity_id;
 end if;
 if b is null or b is distinct from target_branch_id then return jsonb_build_object('status','UNKNOWN');end if;
 return jsonb_build_object('status','COMMITTED','result_id',r.result_entity_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.match_payment_notice(target_notice_id uuid, target_reconciliation_match_id uuid, match_amount_vnd bigint, match_reason text, expected_notice_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n public.payment_notices%rowtype;m public.payment_reconciliation_matches%rowtype;p public.payments%rowtype;r public.command_receipts%rowtype;h text;id uuid;used_notice bigint;used_match bigint;
begin
 select * into n from public.payment_notices where payment_notices.id=target_notice_id;
 if n.id is null or not private.has_permission(n.branch_id,'finance.payment_notice.review') or not private.has_permission(n.branch_id,'finance.reconcile') then raise exception 'forbidden_or_notice_not_found' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'match_payment_notice');perform pg_advisory_xact_lock(hashtextextended('notice_match:'||operation_id::text,0));
 h:=private.command_payload_hash(jsonb_build_array(target_notice_id,target_reconciliation_match_id,match_amount_vnd,trim(match_reason),expected_notice_version));
 select * into r from public.command_receipts where command_receipts.operation_id=match_payment_notice.operation_id;
 if found then if r.command_name<>'match_payment_notice' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 select * into m from public.payment_reconciliation_matches where payment_reconciliation_matches.id=target_reconciliation_match_id;
 if m.id is null then raise exception 'recorded_bank_reconciliation_required' using errcode='23514';end if;
 select * into p from public.payments where payments.id=m.payment_id for update;
 select * into m from public.payment_reconciliation_matches where payment_reconciliation_matches.id=target_reconciliation_match_id for update;
 select * into n from public.payment_notices where payment_notices.id=target_notice_id for update;
 if n.version is distinct from expected_notice_version then raise exception 'stale_payment_notice_version' using errcode='PT409';end if;
 if operation_id is null or match_amount_vnd is null or match_amount_vnd<=0 or match_reason is null or char_length(trim(match_reason)) not between 3 and 500 then raise exception 'invalid_notice_match' using errcode='22023';end if;
 if n.review_state<>'ACCEPTED' then raise exception 'notice_document_review_not_accepted' using errcode='23514';end if;
 if p.id is null or p.direction<>'RECEIPT' or p.customer_id is distinct from n.customer_id or p.branch_id is distinct from n.branch_id or m.branch_id is distinct from n.branch_id
 or p.method<>'BANK_TRANSFER' or p.reversal_of_payment_id is not null or exists(select 1 from public.payments rev where rev.reversal_of_payment_id=p.id)
 then raise exception 'notice_receipt_scope_or_state_mismatch' using errcode='23514';end if;
 select coalesce(sum(x.matched_amount_vnd),0)::bigint into used_notice from public.payment_notice_matches x where x.notice_id=n.id and not exists(select 1 from public.payment_notice_match_reversals rev where rev.match_id=x.id);
 select coalesce(sum(x.matched_amount_vnd),0)::bigint into used_match from public.payment_notice_matches x where x.reconciliation_match_id=m.id and not exists(select 1 from public.payment_notice_match_reversals rev where rev.match_id=x.id);
 if used_notice+match_amount_vnd>n.declared_amount_vnd then raise exception 'notice_match_exceeds_declared_remaining' using errcode='23514';end if;
 if used_match+match_amount_vnd>m.matched_amount_vnd then raise exception 'notice_match_exceeds_reconciled_remaining' using errcode='23514';end if;
 insert into public.payment_notice_matches(notice_id,branch_id,payment_id,reconciliation_match_id,matched_amount_vnd,match_reason,matched_by,source_operation_id)
 values(n.id,n.branch_id,p.id,m.id,match_amount_vnd,trim(match_reason),auth.uid(),operation_id) returning payment_notice_matches.id into id;
 update public.payment_notices set version=version+1 where payment_notices.id=n.id;
 insert into public.command_receipts values(operation_id,auth.uid(),'match_payment_notice',h,'payment_notice_match',id,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),n.branch_id,'payment_notice.receipt_matched','payment_notice',n.id,operation_id,array['receipt_id','reconciliation_match_id','matched_amount','notice_version'],trim(match_reason));return id;
end $function$
;
CREATE OR REPLACE FUNCTION public.record_payment_reconciliation(target_payment_id uuid, matched_amount_vnd bigint, statement_effective_at timestamp with time zone, statement_reference text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payment public.payments%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  match_id uuid;
  matched_total bigint;
begin
 perform private.lock_saved_command_intent(operation_id,'record_payment_reconciliation');
 perform pg_advisory_xact_lock(hashtextextended('finance_review:'||operation_id::text,0));
  select * into payment from public.payments where id = target_payment_id;
  if payment.id is null or not private.has_permission(payment.branch_id, 'finance.reconcile') then raise exception 'forbidden_or_payment_not_found' using errcode = '42501'; end if;
  if matched_amount_vnd <= 0 or char_length(trim(statement_reference)) not between 2 and 160 then raise exception 'invalid_reconciliation' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('payment_id', target_payment_id, 'amount', matched_amount_vnd, 'effective_at', statement_effective_at, 'reference', trim(statement_reference)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = record_payment_reconciliation.operation_id;
  if found then
    if receipt.command_name <> 'record_payment_reconciliation' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into payment from public.payments where id = target_payment_id for update;
  if payment.reversal_of_payment_id is not null or exists(select 1 from public.payments rev where rev.reversal_of_payment_id=payment.id) then raise exception 'reversed_payment_not_reconcilable' using errcode='23514';end if;
  select coalesce(sum(m.matched_amount_vnd), 0) into matched_total from public.payment_reconciliation_matches m where m.payment_id = payment.id;
  if matched_total + matched_amount_vnd > payment.amount_vnd then raise exception 'reconciliation_exceeds_payment' using errcode = '23514'; end if;
  insert into public.payment_reconciliation_matches(branch_id, payment_id, matched_amount_vnd, statement_effective_at, statement_reference, matched_by)
  values (payment.branch_id, payment.id, matched_amount_vnd, statement_effective_at, trim(statement_reference), (select auth.uid()))
  returning id into match_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_payment_reconciliation', payload_hash, 'payment_reconciliation_match', match_id, now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values(auth.uid(),payment.branch_id,'payment.bank_reconciled','payment_reconciliation_match',match_id,operation_id,array['payment_id','matched_amount','statement_reference']);
  return match_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.review_payment_notice(target_payment_notice_id uuid, target_state text, target_review_note text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  notice public.payment_notices%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
 perform private.lock_saved_command_intent(operation_id,'review_payment_notice');
 perform pg_advisory_xact_lock(hashtextextended('finance_review:'||operation_id::text,0));
  select * into notice from public.payment_notices n where n.id = target_payment_notice_id;
  if notice.id is null or not private.has_permission(notice.branch_id, 'finance.payment_notice.review') then
    raise exception 'payment_notice_review_forbidden' using errcode = '42501';
  end if;
  if target_state not in ('UNDER_REVIEW','ACCEPTED','REJECTED') then raise exception 'invalid_review_state' using errcode = '22023'; end if;
  if nullif(trim(target_review_note), '') is not null and char_length(trim(target_review_note)) not between 3 and 500 then raise exception 'invalid_review_note' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'notice', target_payment_notice_id, 'state', target_state, 'note', nullif(trim(target_review_note), ''), 'version', expected_version
  ));
  select * into receipt from public.command_receipts r where r.operation_id = review_payment_notice.operation_id;
  if found then
    if receipt.command_name <> 'review_payment_notice' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into notice from public.payment_notices n where n.id = target_payment_notice_id for update;
  if target_state<>'ACCEPTED' and exists(select 1 from public.payment_notice_matches m where m.notice_id=notice.id and not exists(select 1 from public.payment_notice_match_reversals rev where rev.match_id=m.id)) then raise exception 'notice_active_matches_require_source_correction' using errcode='23514';end if;
  if notice.version  IS DISTINCT FROM expected_version then raise exception 'stale_payment_notice_version' using errcode = 'PT409'; end if;
  insert into public.payment_notice_review_events(payment_notice_id, from_state, to_state, review_note, reviewed_by)
  values(notice.id, notice.review_state, target_state, nullif(trim(target_review_note), ''), (select auth.uid()));
  update public.payment_notices set
    review_state = target_state,
    version = version + 1,
    review_note = nullif(trim(target_review_note), ''),
    reviewed_by = case when target_state in ('ACCEPTED','REJECTED') then (select auth.uid()) else reviewed_by end,
    reviewed_at = case when target_state in ('ACCEPTED','REJECTED') then now() else reviewed_at end
  where id = notice.id;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'review_payment_notice', payload_hash, 'payment_notice', notice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), notice.branch_id,
    case target_state when 'REJECTED' then 'payment_notice.rejected'
      when 'ACCEPTED' then 'payment_notice.accepted' else 'payment_notice.under_review' end,
    'payment_notice', notice.id, operation_id, array['review_state', 'review_note'], nullif(trim(target_review_note), ''));
  return notice.id;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid, target_entries jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; h text; permission text; entry jsonb;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source','match_payment_notice','review_payment_notice','record_payment_reconciliation','reverse_payment_notice_match')
 or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)>200 or octet_length(target_entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then case when private.has_permission(target_branch_id,'inventory.reserve') then 'inventory.reserve' when private.has_permission(target_branch_id,'purchasing.confirm') then 'purchasing.confirm' else 'purchasing.cancel' end when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' when 'register_supplier_document' then 'finance.ap.adjust' when 'review_supplier_document' then 'finance.ap.read' when 'create_invoice_draft' then 'finance.ar.adjust' when 'approve_invoice_business' then 'finance.reconcile' when 'cancel_invoice_draft' then 'finance.ar.adjust' when 'create_invoice_adjustment_draft' then 'finance.ar.adjust' when 'register_purchase_invoice_source' then 'finance.ap.adjust' when 'review_payment_notice' then 'finance.payment_notice.review' when 'match_payment_notice' then 'finance.payment_notice.review' when 'record_payment_reconciliation' then 'finance.reconcile' when 'reverse_payment_notice_match' then 'finance.payment_notice.review' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 for entry in select value from jsonb_array_elements(target_entries) loop
  if jsonb_typeof(entry) is distinct from 'array' or jsonb_array_length(entry)<>2
  or jsonb_typeof(entry->0)<>'string' or jsonb_typeof(entry->1)<>'string'
  or entry->>0 ~* '(password|token|secret)' or left(entry->>0,1)='$'
  then raise exception 'invalid_command_draft_field' using errcode='22023';end if;
 end loop;
 h:=private.command_payload_hash(target_entries);
 insert into private.command_drafts(operation_id,actor_auth_user_id,branch_id,command_name,form_entries,payload_hash)
 values(target_operation_id,(select auth.uid()),target_branch_id,target_command,target_entries,h)
 on conflict(operation_id) do nothing;
 select * into d from private.command_drafts where operation_id=target_operation_id for update;
 if d.actor_auth_user_id is distinct from(select auth.uid()) or d.branch_id is distinct from target_branch_id
 or d.command_name is distinct from target_command or d.payload_hash is distinct from h
 then raise exception 'operation_payload_conflict' using errcode='23505';end if;
 return d.operation_id;
end $function$
;
create or replace view public.payment_notice_read with(security_barrier=true) as
 SELECT n.id,
    n.branch_id,
    n.customer_id,
    c.display_name AS customer_name,
    n.evidence_id,
    n.declared_amount_vnd::text AS declared_amount_vnd,
    n.paid_on,
    n.payment_reference,
    n.customer_note,
    n.review_state,
    n.version,
    n.submitted_at,
    n.review_note,
    COALESCE(x.matched, 0::numeric)::text AS matched_amount_vnd,
    (n.declared_amount_vnd::numeric - COALESCE(x.matched, 0::numeric))::text AS remaining_match_vnd,
        CASE
            WHEN COALESCE(x.invalid, 0::bigint) > 0 THEN 'SOURCE_REVERSED'::text
            WHEN COALESCE(x.matched, 0::numeric) = n.declared_amount_vnd::numeric THEN 'MATCHED'::text
            WHEN COALESCE(x.matched, 0::numeric) > 0::numeric THEN 'PARTIAL'::text
            ELSE 'UNMATCHED'::text
        END AS money_match_state
   FROM payment_notices n
     JOIN customers c ON c.id = n.customer_id
     LEFT JOIN LATERAL ( SELECT sum(m.matched_amount_vnd) AS matched,
            count(*) FILTER (WHERE (EXISTS ( SELECT 1
                   FROM payments rev
                  WHERE rev.reversal_of_payment_id = m.payment_id))) AS invalid
           FROM payment_notice_matches m
          WHERE m.notice_id=n.id and not exists(select 1 from public.payment_notice_match_reversals rev where rev.match_id=m.id)) x ON true
  WHERE private.has_permission(n.branch_id, 'finance.payment_notice.review'::text);;
create or replace view public.payment_notice_reconciliation_source_read with(security_barrier=true) as
 SELECT m.id,
    m.branch_id,
    p.id AS payment_id,
    p.customer_id,
    p.payment_number,
    m.statement_reference,
    m.statement_effective_at,
    m.matched_amount_vnd::text AS reconciled_amount_vnd,
    (m.matched_amount_vnd::numeric - COALESCE(x.used, 0::numeric))::text AS matching_available_vnd
   FROM payment_reconciliation_matches m
     JOIN payments p ON p.id = m.payment_id
     LEFT JOIN LATERAL ( SELECT sum(n.matched_amount_vnd) AS used
           FROM payment_notice_matches n
          WHERE n.reconciliation_match_id=m.id and not exists(select 1 from public.payment_notice_match_reversals rev where rev.match_id=n.id)) x ON true
  WHERE private.has_permission(m.branch_id, 'finance.payment_notice.review'::text) AND private.has_permission(m.branch_id, 'finance.reconcile'::text) AND p.direction = 'RECEIPT'::text AND p.customer_id IS NOT NULL AND p.method = 'BANK_TRANSFER'::text AND p.reversal_of_payment_id IS NULL AND NOT (EXISTS ( SELECT 1
           FROM payments rev
          WHERE rev.reversal_of_payment_id = p.id));;
notify pgrst,'reload schema';
commit;
