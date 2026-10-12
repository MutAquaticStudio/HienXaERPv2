begin;
alter table private.command_drafts drop constraint command_drafts_command_name_check;
alter table private.command_drafts add constraint command_drafts_command_name_check check(command_name in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit'));
CREATE OR REPLACE FUNCTION public.get_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then 'inventory.read' when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' else 'inventory.receive' end;
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
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then 'inventory.read' when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' else 'inventory.receive' end;
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
 elsif target_command='create_supplier_return' and r.result_type='supplier_return_case' then
  select branch_id into b from public.supplier_return_cases where id=r.result_entity_id;
 elsif target_command='record_supplier_return_event' and r.result_type='supplier_return_event' then
  select branch_id into b from public.supplier_return_events where id=r.result_entity_id;
 elsif target_command in('approve_supplier_return_credit','offset_supplier_credit') and r.result_type='supplier_return_credit' then
  select branch_id into b from public.supplier_return_credits where id=r.result_entity_id;
 elsif target_command='refund_supplier_credit' and r.result_type='payment' then
  select branch_id into b from public.payments where id=r.result_entity_id;
 elsif target_command='create_warehouse_transfer' and r.result_type='warehouse_transfer' then
  select branch_id into b from public.warehouse_transfers where id=r.result_entity_id;
 elsif target_command='record_warehouse_transfer_event' and r.result_type='warehouse_transfer_event' then
  select t.branch_id into b from public.warehouse_transfer_events e join public.warehouse_transfers t on t.id=e.transfer_id where e.id=r.result_entity_id;
 elsif target_command in('create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit') and r.result_type='expense' then
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
CREATE OR REPLACE FUNCTION public.reverse_payment(target_payment_id uuid, reversal_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare original public.payments%rowtype; payload_hash text; receipt public.command_receipts%rowtype; reversal_id uuid;
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
  insert into public.command_receipts values(operation_id,(select auth.uid()),'reverse_payment',payload_hash,'payment',reversal_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values((select auth.uid()),original.branch_id,'payment.reversed','payment',original.id,operation_id,array['reversal'],trim(reversal_reason));
  return reversal_id;
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
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense','create_warehouse_transfer','record_warehouse_transfer_event','create_supplier_return','record_supplier_return_event','approve_supplier_return_credit','refund_supplier_credit','offset_supplier_credit')
 or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)>200 or octet_length(target_entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' when 'create_warehouse_transfer' then 'inventory.read' when 'record_warehouse_transfer_event' then 'inventory.read' when 'create_supplier_return' then 'purchasing.create' when 'record_supplier_return_event' then 'inventory.read' when 'approve_supplier_return_credit' then 'finance.ap.adjust' when 'refund_supplier_credit' then 'finance.payment.post' when 'offset_supplier_credit' then 'finance.payment.post' else 'inventory.receive' end;
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
create view public.supplier_return_credit_read with(security_barrier=true) as
 select c.id,c.branch_id,c.supplier_id,s.name supplier_name,c.case_id,c.acceptance_event_id,c.obligation_id,c.approved_credit_vnd::text,c.amount_vnd::text,
 (c.amount_vnd-coalesce(x.settled,0))::text remaining_vnd,coalesce(x.refunded,0)::text refunded_vnd,coalesce(x.offset_amount,0)::text offset_vnd,c.reason,c.approved_by,c.approved_at
 from public.supplier_return_credits c join public.suppliers s on s.id=c.supplier_id
 left join lateral(select sum(z.amount_vnd)settled,sum(z.amount_vnd)filter(where z.settlement_kind='REFUND')refunded,sum(z.amount_vnd)filter(where z.settlement_kind='OFFSET')offset_amount from public.supplier_credit_funds f join public.supplier_credit_settlements z on z.credit_fund_id=f.id where f.credit_id=c.id)x on true
 where private.has_permission(c.branch_id,'finance.ap.read');
create view public.supplier_return_eligible_source_read with(security_barrier=true) as
 select pr.branch_id,p.supplier_id,l.id source_receipt_line_id,null::uuid source_fulfillment_line_id,null::uuid source_return_case_id,pr.receipt_number source_number,
 l.material_id,m.name material_name,l.warehouse_id,l.received_base_quantity::text source_base_quantity,null::text custody_base_quantity
 from public.purchase_receipt_lines l join public.purchase_receipts pr on pr.id=l.purchase_receipt_id join public.purchase_orders p on p.id=pr.purchase_order_id join public.materials m on m.id=l.material_id
 where private.has_permission(pr.branch_id,'purchasing.create')
 union all
 select sf.branch_id,p.supplier_id,null::uuid,fl.id,rc.id,p.purchase_order_number,m.id,m.name,null::uuid,fl.supplier_base_quantity::text,rc.base_quantity::text
 from public.supplier_fulfillment_lines fl join public.supplier_fulfillments sf on sf.id=fl.supplier_fulfillment_id join public.purchase_orders p on p.id=sf.purchase_order_id
 join public.purchase_order_lines pl on pl.id=fl.purchase_order_line_id join public.materials m on m.id=pl.material_id
 join public.supply_allocations sa on sa.purchase_order_line_id=fl.purchase_order_line_id and sa.sales_order_line_id=fl.sales_order_line_id
 join public.delivery_lines dl on dl.supply_allocation_id=sa.id join public.return_cases rc on rc.delivery_line_id=dl.id
 where rc.state='OPEN' and rc.case_kind in('CUSTOMER_RETURN','TRANSIT_REMAINDER') and dl.source_mode='SUPPLIER_DIRECT' and private.has_permission(sf.branch_id,'purchasing.create')
 and not exists(select 1 from public.supplier_return_cases c where c.source_return_case_id=rc.id and not c.dispatch_closed);
grant select on public.supplier_return_credit_read,public.supplier_return_eligible_source_read to authenticated;
notify pgrst,'reload schema';
commit;
