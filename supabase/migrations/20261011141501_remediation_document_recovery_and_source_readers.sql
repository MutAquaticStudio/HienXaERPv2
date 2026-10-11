begin;
alter table private.command_drafts drop constraint command_drafts_command_name_check;
alter table private.command_drafts add constraint command_drafts_command_name_check CHECK ((command_name = ANY (ARRAY['post_payment'::text, 'receive_purchase_order'::text, 'verify_supplier_fulfillment'::text, 'allocate_payment'::text, 'adjust_return_receivable'::text, 'refund_customer_credit'::text, 'offset_customer_credit'::text, 'reverse_customer_credit_offset'::text, 'resolve_commission_reconciliation'::text, 'create_delivery_expense'::text, 'approve_expense'::text, 'create_warehouse_transfer'::text, 'record_warehouse_transfer_event'::text, 'create_supplier_return'::text, 'record_supplier_return_event'::text, 'approve_supplier_return_credit'::text, 'refund_supplier_credit'::text, 'offset_supplier_credit'::text, 'register_supplier_document'::text, 'review_supplier_document'::text, 'create_invoice_draft'::text, 'approve_invoice_business'::text, 'cancel_invoice_draft'::text, 'create_invoice_adjustment_draft'::text, 'register_purchase_invoice_source'::text])));
CREATE OR REPLACE FUNCTION public.approve_invoice_business(target_invoice_id uuid, expected_version integer, review_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invoice public.invoice_intents%rowtype;
  line_total bigint;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  perform private.lock_saved_command_intent(operation_id,'approve_invoice_business');
  perform pg_advisory_xact_lock(hashtextextended('document:'||operation_id::text,0));
  select * into invoice from public.invoice_intents i where i.id = target_invoice_id for update;
  if invoice.id is null or not private.has_permission(invoice.branch_id, 'finance.reconcile') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('invoice_id', target_invoice_id, 'version', expected_version, 'reason', trim(review_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = approve_invoice_business.operation_id;
  if found then
    if receipt.command_name <> 'approve_invoice_business' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if invoice.status <> 'DRAFT' or invoice.version  IS DISTINCT FROM expected_version then
    raise exception 'invoice_version_conflict' using errcode = 'PT409';
  end if;
  if char_length(trim(review_reason)) not between 3 and 500 then
    raise exception 'invoice_review_reason_required' using errcode = '22023';
  end if;
  select coalesce(sum(l.source_amount_vnd), 0)::bigint into line_total from public.invoice_draft_lines l where l.invoice_intent_id = invoice.id;
  if line_total <> invoice.source_amount_vnd or not exists (
    select 1 from public.invoice_coverage c where c.invoice_intent_id = invoice.id and c.released_at is null
  ) then raise exception 'invoice_coverage_invalid' using errcode = '23514'; end if;
  update public.invoice_intents i
    set status = 'BUSINESS_APPROVED', version = i.version + 1,
        reviewed_by = (select auth.uid()), reviewed_at = now(), review_reason = trim(approve_invoice_business.review_reason),
        review_operation_id = approve_invoice_business.operation_id
    where i.id = invoice.id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'approve_invoice_business', payload_hash, 'invoice_intent', invoice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), invoice.branch_id, 'invoice_business.approved', 'invoice_intent', invoice.id, operation_id,
    array['status','reviewed_by'], trim(review_reason));
  return invoice.id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.cancel_invoice_draft(target_invoice_id uuid, expected_version integer, cancel_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invoice public.invoice_intents%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  perform private.lock_saved_command_intent(operation_id,'cancel_invoice_draft');
  perform pg_advisory_xact_lock(hashtextextended('document:'||operation_id::text,0));
  select * into invoice from public.invoice_intents i where i.id = target_invoice_id for update;
  if invoice.id is null or not private.has_permission(invoice.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('invoice_id', target_invoice_id, 'version', expected_version, 'reason', trim(cancel_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = cancel_invoice_draft.operation_id;
  if found then
    if receipt.command_name <> 'cancel_invoice_draft' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if invoice.status <> 'DRAFT' or invoice.version  IS DISTINCT FROM expected_version then
    raise exception 'invoice_version_conflict' using errcode = 'PT409';
  end if;
  if char_length(trim(cancel_reason)) not between 3 and 500 then
    raise exception 'invoice_cancel_reason_required' using errcode = '22023';
  end if;
  update public.invoice_intents i
    set status = 'CANCELLED', version = i.version + 1,
        cancelled_by = (select auth.uid()), cancelled_at = now(), cancel_reason = trim(cancel_invoice_draft.cancel_reason),
        cancel_operation_id = cancel_invoice_draft.operation_id
    where i.id = invoice.id;
  update public.invoice_coverage c set released_at = now() where c.invoice_intent_id = invoice.id and c.released_at is null;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'cancel_invoice_draft', payload_hash, 'invoice_intent', invoice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), invoice.branch_id, 'invoice_draft.cancelled', 'invoice_intent', invoice.id, operation_id,
    array['status','coverage'], trim(cancel_reason));
  return invoice.id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.create_invoice_adjustment_draft(target_invoice_id uuid, target_receivable_adjustment_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invoice public.invoice_intents%rowtype;
  adjustment public.receivable_adjustments%rowtype;
  draft_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  perform private.lock_saved_command_intent(operation_id,'create_invoice_adjustment_draft');
  perform pg_advisory_xact_lock(hashtextextended('document:'||operation_id::text,0));
  select * into invoice from public.invoice_intents i where i.id = target_invoice_id for update;
  if invoice.id is null or not private.has_permission(invoice.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'invoice_id', target_invoice_id, 'adjustment_id', target_receivable_adjustment_id
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_invoice_adjustment_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_invoice_adjustment_draft' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into adjustment from public.receivable_adjustments a where a.id = target_receivable_adjustment_id;
  if invoice.status <> 'BUSINESS_APPROVED' or adjustment.id is null
    or adjustment.obligation_id <> invoice.source_obligation_id or adjustment.amount_delta_vnd = 0 then
    raise exception 'invoice_adjustment_source_invalid' using errcode = '23514';
  end if;
  insert into public.invoice_adjustment_drafts(
    branch_id, invoice_intent_id, receivable_adjustment_id, amount_delta_vnd,
    reason_snapshot, created_by, operation_id
  ) values (
    invoice.branch_id, invoice.id, adjustment.id, adjustment.amount_delta_vnd,
    adjustment.reason, (select auth.uid()), operation_id
  ) returning id into draft_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_invoice_adjustment_draft', payload_hash, 'invoice_adjustment_draft', draft_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), invoice.branch_id, 'invoice_adjustment_draft.created', 'invoice_adjustment_draft', draft_id, operation_id,
    array['source_adjustment','amount_delta','reason']);
  return draft_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.create_invoice_draft(target_obligation_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  obligation public.receivable_obligations%rowtype;
  source_type text;
  source_id uuid;
  verified_at timestamptz;
  customer_name text;
  invoice_id uuid;
  line_total bigint;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  perform private.lock_saved_command_intent(operation_id,'create_invoice_draft');
  perform pg_advisory_xact_lock(hashtextextended('document:'||operation_id::text,0));
  select * into obligation from public.receivable_obligations o where o.id = target_obligation_id for update;
  if obligation.id is null or not private.has_permission(obligation.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if obligation.opening_source_id is not null or obligation.original_amount_vnd <= 0 then
    raise exception 'invoice_source_ineligible' using errcode = '23514';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('source_obligation_id', target_obligation_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_invoice_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_invoice_draft' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if exists (select 1 from public.invoice_coverage c where c.source_obligation_id = obligation.id and c.released_at is null) then
    raise exception 'invoice_source_already_covered' using errcode = '23505';
  end if;
  select c.display_name into customer_name from public.customers c where c.id = obligation.customer_id;
  if obligation.delivery_verification_id is not null then
    source_type := 'DELIVERY_VERIFICATION';
    source_id := obligation.delivery_verification_id;
    select v.verified_at into verified_at from public.delivery_verifications v where v.id = source_id;
  else
    source_type := 'SERVICE_VERIFICATION';
    source_id := obligation.service_verification_id;
    select v.verified_at into verified_at from public.service_verifications v where v.id = source_id;
  end if;
  if verified_at is null or customer_name is null then
    raise exception 'invoice_source_unverified' using errcode = '23514';
  end if;

  insert into public.invoice_intents(
    branch_id, customer_id, customer_name_snapshot, source_obligation_id,
    source_type, source_id, source_amount_vnd, billing_verified_at, created_by, create_operation_id
  ) values (
    obligation.branch_id, obligation.customer_id, customer_name, obligation.id,
    source_type, source_id, obligation.original_amount_vnd, verified_at, (select auth.uid()), operation_id
  ) returning id into invoice_id;

  if source_type = 'DELIVERY_VERIFICATION' then
    insert into public.invoice_draft_lines(
      invoice_intent_id, line_number, source_line_id, description_snapshot, quantity_snapshot, source_amount_vnd
    )
    select invoice_id, row_number() over(order by vl.id)::integer, vl.id,
      sol.material_name_snapshot, vl.billable_base_quantity, vl.receivable_amount_vnd
    from public.delivery_verification_lines vl
    join public.delivery_lines dl on dl.id = vl.delivery_line_id
    join public.sales_order_lines sol on sol.id = dl.sales_order_line_id
    where vl.delivery_verification_id = source_id
      and vl.billable_base_quantity > 0 and vl.receivable_amount_vnd > 0;
  else
    insert into public.invoice_draft_lines(
      invoice_intent_id, line_number, source_line_id, description_snapshot, quantity_snapshot, source_amount_vnd
    )
    select invoice_id, 1, sv.id, sj.service_type, sv.billable_quantity, sv.billable_amount_vnd
    from public.service_verifications sv
    join public.service_jobs sj on sj.id = sv.service_job_id
    where sv.id = source_id and sv.billable_quantity > 0 and sv.billable_amount_vnd > 0;
  end if;
  select coalesce(sum(l.source_amount_vnd), 0)::bigint into line_total
    from public.invoice_draft_lines l where l.invoice_intent_id = invoice_id;
  if line_total <> obligation.original_amount_vnd then
    raise exception 'invoice_source_amount_mismatch' using errcode = '23514';
  end if;
  insert into public.invoice_coverage(source_obligation_id, invoice_intent_id, covered_amount_vnd)
  values (obligation.id, invoice_id, obligation.original_amount_vnd);
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_invoice_draft', payload_hash, 'invoice_intent', invoice_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), obligation.branch_id, 'invoice_draft.created', 'invoice_intent', invoice_id, operation_id,
    array['source','source_amount','coverage','billing_verified_at']);
  return invoice_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.get_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then case when private.has_permission(target_branch_id,'inventory.reserve') then 'inventory.reserve' when private.has_permission(target_branch_id,'purchasing.confirm') then 'purchasing.confirm' else 'purchasing.cancel' end when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' when 'register_supplier_document' then 'finance.ap.adjust' when 'review_supplier_document' then 'finance.ap.read' when 'create_invoice_draft' then 'finance.ar.adjust' when 'approve_invoice_business' then 'finance.reconcile' when 'cancel_invoice_draft' then 'finance.ar.adjust' when 'create_invoice_adjustment_draft' then 'finance.ar.adjust' when 'register_purchase_invoice_source' then 'finance.ap.adjust' else 'inventory.receive' end;
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
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then case when private.has_permission(target_branch_id,'inventory.reserve') then 'inventory.reserve' when private.has_permission(target_branch_id,'purchasing.confirm') then 'purchasing.confirm' else 'purchasing.cancel' end when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' when 'register_supplier_document' then 'finance.ap.adjust' when 'review_supplier_document' then 'finance.ap.read' when 'create_invoice_draft' then 'finance.ar.adjust' when 'approve_invoice_business' then 'finance.reconcile' when 'cancel_invoice_draft' then 'finance.ar.adjust' when 'create_invoice_adjustment_draft' then 'finance.ar.adjust' when 'register_purchase_invoice_source' then 'finance.ap.adjust' else 'inventory.receive' end;
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
 elsif target_command in('approve_supplier_return_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source') and r.result_type='supplier_return_credit' then
  select branch_id into b from public.supplier_return_credits where id=r.result_entity_id;
 elsif target_command='refund_supplier_credit' and r.result_type='payment' then
  select branch_id into b from public.payments where id=r.result_entity_id;
 elsif target_command='create_warehouse_transfer' and r.result_type='warehouse_transfer' then
  select branch_id into b from public.warehouse_transfers where id=r.result_entity_id;
 elsif target_command='record_warehouse_transfer_event' and r.result_type='warehouse_transfer_event' then
  select t.branch_id into b from public.warehouse_transfer_events e join public.warehouse_transfers t on t.id=e.transfer_id where e.id=r.result_entity_id;
 elsif target_command in('create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source') and r.result_type='expense' then
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
CREATE OR REPLACE FUNCTION public.register_purchase_invoice_source(target_payable_obligation_id uuid, target_document_number text, target_document_date date, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  obligation public.payable_obligations%rowtype;
  supplier_name text;
  source_type text;
  source_id uuid;
  evidence_id uuid;
  registry_id uuid;
  normalized_number text;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  perform private.lock_saved_command_intent(operation_id,'register_purchase_invoice_source');
  perform pg_advisory_xact_lock(hashtextextended('document:'||operation_id::text,0));
  select * into obligation from public.payable_obligations o where o.id = target_payable_obligation_id for update;
  if obligation.id is null or not private.has_permission(obligation.branch_id, 'finance.ap.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if obligation.supplier_id is null or (obligation.purchase_receipt_id is null and obligation.supplier_fulfillment_id is null) then
    raise exception 'purchase_invoice_source_invalid' using errcode = '23514';
  end if;
  normalized_number := nullif(trim(target_document_number), '');
  if normalized_number is not null and char_length(normalized_number) not between 2 and 100 then
    raise exception 'purchase_invoice_number_invalid' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'obligation_id', target_payable_obligation_id, 'document_number', normalized_number, 'document_date', target_document_date
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = register_purchase_invoice_source.operation_id;
  if found then
    if receipt.command_name <> 'register_purchase_invoice_source' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select s.name into supplier_name from public.suppliers s where s.id = obligation.supplier_id and s.branch_id = obligation.branch_id;
  if supplier_name is null then raise exception 'purchase_invoice_supplier_invalid' using errcode = '23503'; end if;
  if obligation.purchase_receipt_id is not null then
    source_type := 'PURCHASE_RECEIPT';
    source_id := obligation.purchase_receipt_id;
    select r.evidence_object_id into evidence_id from public.purchase_receipts r
      where r.id = source_id and r.branch_id = obligation.branch_id;
  else
    source_type := 'SUPPLIER_FULFILLMENT';
    source_id := obligation.supplier_fulfillment_id;
    select f.evidence_object_id into evidence_id from public.supplier_fulfillments f
      where f.id = source_id and f.branch_id = obligation.branch_id;
  end if;
  if evidence_id is not null and not exists (
    select 1 from public.evidence_objects e
    where e.id = evidence_id and e.branch_id = obligation.branch_id and e.upload_state = 'VERIFIED'
  ) then evidence_id := null; end if;
  insert into public.purchase_invoice_registry(
    branch_id, payable_obligation_id, supplier_id, supplier_name_snapshot,
    source_type, source_id, source_amount_vnd, supplier_document_number,
    supplier_document_date, evidence_object_id, document_state, created_by, operation_id
  ) values (
    obligation.branch_id, obligation.id, obligation.supplier_id, supplier_name,
    source_type, source_id, obligation.original_amount_vnd, normalized_number,
    target_document_date, evidence_id,
    case when evidence_id is null then 'PENDING_DOCUMENT' else 'SOURCE_EVIDENCE_ATTACHED' end,
    (select auth.uid()), operation_id
  ) returning id into registry_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'register_purchase_invoice_source', payload_hash, 'purchase_invoice_registry', registry_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), obligation.branch_id, 'purchase_invoice_source.registered', 'purchase_invoice_registry', registry_id, operation_id,
    array['source','supplier_document','evidence_state']);
  return registry_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.save_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid, target_entries jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; h text; permission text; entry jsonb;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit','register_supplier_document','review_supplier_document','create_invoice_draft','approve_invoice_business','cancel_invoice_draft','create_invoice_adjustment_draft','register_purchase_invoice_source')
 or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)>200 or octet_length(target_entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then case when private.has_permission(target_branch_id,'inventory.reserve') then 'inventory.reserve' when private.has_permission(target_branch_id,'purchasing.confirm') then 'purchasing.confirm' else 'purchasing.cancel' end when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' when 'register_supplier_document' then 'finance.ap.adjust' when 'review_supplier_document' then 'finance.ap.read' when 'create_invoice_draft' then 'finance.ar.adjust' when 'approve_invoice_business' then 'finance.reconcile' when 'cancel_invoice_draft' then 'finance.ar.adjust' when 'create_invoice_adjustment_draft' then 'finance.ar.adjust' when 'register_purchase_invoice_source' then 'finance.ap.adjust' else 'inventory.receive' end;
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
create view public.supplier_document_eligible_source_read with(security_barrier=true) as
 select r.branch_id,p.supplier_id,s.name supplier_name,'RECEIPT_LINE'::text source_kind,l.id source_id,r.receipt_number source_number,m.name material_name,u.symbol uom_symbol,l.received_quantity::text source_quantity,l.unit_cost_vnd::text source_unit_cost,l.inventory_value_vnd::text source_value_vnd,'INVOICE'::text document_kind
 from public.purchase_receipt_lines l join public.purchase_receipts r on r.id=l.purchase_receipt_id join public.purchase_orders p on p.id=r.purchase_order_id join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id join public.materials m on m.id=l.material_id join public.units_of_measure u on u.id=pl.ordered_uom_id join public.suppliers s on s.id=p.supplier_id
 where private.has_permission(r.branch_id,'finance.ap.read') and not exists(select 1 from public.supplier_document_lines x where x.source_kind='RECEIPT_LINE' and x.source_id=l.id and x.covered)
 union all
 select f.branch_id,p.supplier_id,s.name,'FULFILLMENT_LINE',l.id,p.purchase_order_number,m.name,u.symbol,l.supplier_quantity::text,pl.unit_cost_vnd::text,l.payable_amount_vnd::text,'INVOICE'
 from public.supplier_fulfillment_lines l join public.supplier_fulfillments f on f.id=l.supplier_fulfillment_id join public.purchase_orders p on p.id=f.purchase_order_id join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id join public.materials m on m.id=pl.material_id join public.units_of_measure u on u.id=pl.ordered_uom_id join public.suppliers s on s.id=p.supplier_id
 where private.has_permission(f.branch_id,'finance.ap.read') and not exists(select 1 from public.supplier_document_lines x where x.source_kind='FULFILLMENT_LINE' and x.source_id=l.id and x.covered)
 union all
 select c.branch_id,c.supplier_id,s.name,'RETURN_CREDIT',c.id,sc.return_number,m.name,u.symbol,e.base_quantity::text,round(pl.unit_cost_vnd::numeric*pl.conversion_denominator/pl.conversion_numerator,6)::text,c.approved_credit_vnd::text,'CREDIT_NOTE'
 from public.supplier_return_credits c join public.supplier_return_cases sc on sc.id=c.case_id join public.supplier_return_events e on e.id=c.acceptance_event_id left join public.purchase_receipt_lines rl on rl.id=sc.source_receipt_line_id left join public.supplier_fulfillment_lines fl on fl.id=sc.source_fulfillment_line_id join public.purchase_order_lines pl on pl.id=coalesce(rl.purchase_order_line_id,fl.purchase_order_line_id) join public.materials m on m.id=sc.material_id join public.units_of_measure u on u.id=sc.base_uom_id join public.suppliers s on s.id=c.supplier_id
 where private.has_permission(c.branch_id,'finance.ap.read') and not exists(select 1 from public.supplier_document_lines x where x.source_kind='RETURN_CREDIT' and x.source_id=c.id and x.covered);
grant select on public.supplier_document_eligible_source_read to authenticated;
notify pgrst,'reload schema';
commit;
