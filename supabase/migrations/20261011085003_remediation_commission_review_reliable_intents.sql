begin;
alter table private.command_drafts drop constraint command_drafts_command_name_check;
alter table private.command_drafts add constraint command_drafts_command_name_check check(command_name in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation'));
CREATE OR REPLACE FUNCTION public.get_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' else 'inventory.receive' end;
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
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' else 'inventory.receive' end;
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
CREATE OR REPLACE FUNCTION public.save_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid, target_entries jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; h text; permission text; entry jsonb;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation')
 or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)>200 or octet_length(target_entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' else 'inventory.receive' end;
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
CREATE OR REPLACE FUNCTION public.resolve_commission_reconciliation(target_case_id uuid, resolution_kind text, target_unpaid_earning_id uuid, target_adjustment_rule_id uuid, expected_earning_version integer, resolution_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.commission_reconciliation_cases%rowtype; target public.earning_events%rowtype; rule public.compensation_rules%rowtype;
 receipt public.command_receipts%rowtype; hash text; resolution_id uuid:=gen_random_uuid(); basis uuid; adjustment uuid; payable uuid;
begin
 perform private.lock_saved_command_intent(operation_id,'resolve_commission_reconciliation');
 select * into c from public.commission_reconciliation_cases where id=target_case_id for update;
 if c.id is null or not private.has_permission(c.branch_id,'compensation.manage')
 then raise exception 'forbidden_or_commission_case_not_found' using errcode='42501';end if;
 if operation_id is null or resolution_kind not in('WAIVE','RECOVER_UNPAID_COMMISSION')
  or coalesce(length(trim(resolution_reason)),0) not between 3 and 500 then raise exception 'invalid_commission_resolution' using errcode='22023';end if;
 hash:=private.command_payload_hash(jsonb_build_object('case',target_case_id,'kind',resolution_kind,'earning',target_unpaid_earning_id,
  'rule',target_adjustment_rule_id,'version',expected_earning_version,'reason',trim(resolution_reason)));
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 select * into receipt from public.command_receipts r where r.operation_id=resolve_commission_reconciliation.operation_id;
 if found then
  if receipt.command_name<>'resolve_commission_reconciliation' or receipt.payload_hash<>hash or receipt.actor_auth_user_id is distinct from auth.uid()
  then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;
 end if;
 if exists(select 1 from public.commission_review_resolutions where case_id=c.id)
 then raise exception 'commission_case_already_resolved' using errcode='55000';end if;
 if resolution_kind='WAIVE' then
  if not private.operational_owner(c.branch_id) or target_unpaid_earning_id is not null or target_adjustment_rule_id is not null or expected_earning_version is not null
  then raise exception 'commission_waiver_requires_owner' using errcode='42501';end if;
 else
  if not private.has_permission(c.branch_id,'compensation.approve') then raise exception 'commission_recovery_approval_required' using errcode='42501';end if;
  select * into target from public.earning_events where id=target_unpaid_earning_id for update;
  if target.id is null or target.branch_id<>c.branch_id or target.employee_id<>c.employee_id or target.classification<>'SALES_COMMISSION'
   or target.approval_state<>'APPROVED' or target.approved_amount_vnd<=0
  then raise exception 'commission_recovery_source_mismatch' using errcode='23514';end if;
  if target.version is distinct from expected_earning_version then raise exception 'commission_recovery_version_conflict' using errcode='PT409';end if;
  select id into payable from public.payable_obligations where earning_event_id=target.id for update;
  if payable is null or private.current_payable_outstanding(payable)<c.reduction_amount_vnd
  then raise exception 'commission_recovery_exceeds_unpaid' using errcode='23514';end if;
  select * into rule from public.compensation_rules where id=target_adjustment_rule_id;
  if rule.id is null or rule.branch_id<>c.branch_id or rule.earning_type<>'ADJUSTMENT' or rule.calculation_kind<>'FIXED_PER_BASIS'
   or rule.rate_vnd_per_unit<>1 or rule.classification<>'OPEX'
   or(rule.employee_id is not null and rule.employee_id<>c.employee_id)
  then raise exception 'commission_recovery_adjustment_rule_required' using errcode='23514';end if;
  basis:=public.record_compensation_basis(c.branch_id,c.employee_id,'ADJUSTMENT',-c.reduction_amount_vnd::numeric,
   current_date,current_date,trim(resolution_reason),target.id,null,gen_random_uuid());
  adjustment:=public.calculate_earning_event(rule.id,'MANUAL_BASIS',basis,gen_random_uuid());
  perform public.approve_earning_event(adjustment,-c.reduction_amount_vnd,current_date,1,gen_random_uuid());
 end if;
 insert into public.commission_review_resolutions(id,case_id,branch_id,employee_id,resolution_kind,reduction_amount_vnd,
  target_earning_event_id,adjustment_earning_event_id,reason,recorded_by)
 values(resolution_id,c.id,c.branch_id,c.employee_id,resolution_kind,c.reduction_amount_vnd,target_unpaid_earning_id,adjustment,trim(resolution_reason),auth.uid());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),c.branch_id,'commission.review_resolved','commission_review_resolution',resolution_id,operation_id,
  array['source_case','resolution','unpaid_commission_adjustment'],trim(resolution_reason));
 insert into public.command_receipts values(operation_id,auth.uid(),'resolve_commission_reconciliation',hash,'commission_review_resolution',resolution_id,now());
 return resolution_id;
end $function$
;
notify pgrst,'reload schema';
commit;
