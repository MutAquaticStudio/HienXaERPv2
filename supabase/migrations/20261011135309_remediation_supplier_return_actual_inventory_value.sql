begin;
alter table public.supplier_return_events add column inventory_value_vnd bigint check(inventory_value_vnd>=0),add column source_case_version integer check(source_case_version>0);
create unique index supplier_return_event_case_version_unique on public.supplier_return_events(case_id,source_case_version) where source_case_version is not null;
CREATE OR REPLACE FUNCTION public.record_supplier_return_event(target_case_id uuid, target_event_kind text, actual_base_quantity numeric, target_supplier_reference text, event_reason text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.supplier_return_cases%rowtype;rc public.return_cases%rowtype;r public.command_receipts%rowtype;h text;eid uuid;permission text;returned numeric;accepted numeric;prior_qty numeric;portion bigint;on_hand numeric;reserved numeric;stock_value bigint;inventory_portion bigint;accepted_inventory bigint:=0;lot record;lot_before numeric;lot_after numeric;prior_lot_qty numeric:=0;source_line public.delivery_lines%rowtype;vl public.delivery_verification_lines%rowtype;hl public.delivery_handoff_lines%rowtype;
begin
 select * into c from public.supplier_return_cases where id=target_case_id;
 permission:=case target_event_kind when 'PHYSICAL_RETURN' then 'inventory.reserve' when 'SUPPLIER_ACCEPTANCE' then 'purchasing.confirm' when 'CLOSE_DISPATCH' then 'purchasing.cancel' end;
 if c.id is null or permission is null or not private.has_permission(c.branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'record_supplier_return_event');perform pg_advisory_xact_lock(hashtextextended('supplier_return:'||operation_id::text,0));
 perform private.require_exact_quantity(actual_base_quantity,target_event_kind='CLOSE_DISPATCH');
 if operation_id is null or event_reason is null or char_length(trim(event_reason)) not between 3 and 500 then raise exception 'invalid_supplier_return_event' using errcode='22023';end if;
 h:=private.command_payload_hash(jsonb_build_array(target_case_id,target_event_kind,actual_base_quantity,nullif(trim(target_supplier_reference),''),trim(event_reason),expected_version));
 select * into r from public.command_receipts where command_receipts.operation_id=record_supplier_return_event.operation_id;
 if found then if r.command_name<>'record_supplier_return_event' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 -- Serialize all cases of the same original source before their case/version checks.
 if c.source_receipt_line_id is not null then perform 1 from public.purchase_receipt_lines where id=c.source_receipt_line_id for update;
 else perform 1 from public.supplier_fulfillment_lines where id=c.source_fulfillment_line_id for update;end if;
 select * into c from public.supplier_return_cases where id=target_case_id for update;
 if c.version is distinct from expected_version then raise exception 'supplier_return_version_conflict' using errcode='PT409';end if;
 select coalesce(sum(e.base_quantity)filter(where e.event_kind='PHYSICAL_RETURN'),0),coalesce(sum(e.base_quantity)filter(where e.event_kind='SUPPLIER_ACCEPTANCE'),0) into returned,accepted from public.supplier_return_events e where e.case_id=c.id;
 if target_event_kind='CLOSE_DISPATCH' then
  if c.dispatch_closed or actual_base_quantity<>0 or nullif(trim(target_supplier_reference),'') is not null then raise exception 'invalid_supplier_return_close' using errcode='23514';end if;portion:=0;
 else
  if target_event_kind='PHYSICAL_RETURN' and(c.dispatch_closed or returned+actual_base_quantity>c.requested_base_quantity) then raise exception 'supplier_return_exceeds_requested' using errcode='23514';end if;
  if target_event_kind='SUPPLIER_ACCEPTANCE' and(accepted+actual_base_quantity>returned or target_supplier_reference is null or char_length(trim(target_supplier_reference)) not between 3 and 100) then raise exception 'supplier_acceptance_exceeds_physical_return_or_reference_missing' using errcode='23514';end if;
  if target_event_kind='PHYSICAL_RETURN' and nullif(trim(target_supplier_reference),'') is not null then raise exception 'physical_return_has_no_supplier_acceptance_reference' using errcode='23514';end if;
  select coalesce(sum(e.base_quantity),0) into prior_qty from public.supplier_return_events e join public.supplier_return_cases other on other.id=e.case_id
   where e.event_kind=target_event_kind and((c.source_receipt_line_id is not null and other.source_receipt_line_id=c.source_receipt_line_id) or(c.source_fulfillment_line_id is not null and other.source_fulfillment_line_id=c.source_fulfillment_line_id));
  if prior_qty+actual_base_quantity>c.source_base_quantity then raise exception 'supplier_return_exceeds_source_quantity' using errcode='23514';end if;
  portion:=round((prior_qty+actual_base_quantity)*c.source_value_vnd/c.source_base_quantity)::bigint-round(prior_qty*c.source_value_vnd/c.source_base_quantity)::bigint;
  if portion<=0 then raise exception 'supplier_return_portion_has_no_value' using errcode='23514';end if;
 end if;
 if target_event_kind='PHYSICAL_RETURN' then
  if c.warehouse_id is not null then
   perform 1 from public.warehouses where id=c.warehouse_id and branch_id=c.branch_id and active for update;
   if not found then raise exception 'supplier_return_warehouse_invalid' using errcode='23514';end if;
   select coalesce(sum(m.base_quantity_delta),0),coalesce(sum(m.inventory_value_delta_vnd),0) into on_hand,stock_value from public.inventory_movements m where m.material_id=c.material_id and m.warehouse_id=c.warehouse_id and m.location_kind='WAREHOUSE';
   select coalesce(sum(i.reserved_base_quantity),0) into reserved from public.inventory_reservations i where i.material_id=c.material_id and i.warehouse_id=c.warehouse_id and i.state='ACTIVE';
   if on_hand-reserved<actual_base_quantity or on_hand<=0 or stock_value<=0 then raise exception 'insufficient_available_inventory_for_supplier_return' using errcode='23514';end if;
   inventory_portion:=case when actual_base_quantity=on_hand then stock_value else round(actual_base_quantity*stock_value/on_hand)::bigint end;
   if inventory_portion<=0 then raise exception 'supplier_return_inventory_portion_has_no_value' using errcode='23514';end if;
  else
   select * into rc from public.return_cases where id=c.source_return_case_id for update;
   select * into source_line from public.delivery_lines where id=rc.delivery_line_id;
   perform 1 from public.deliveries where id=source_line.delivery_id for update;
   select * into vl from public.delivery_verification_lines where id=rc.delivery_verification_line_id;
   select h.* into hl from public.delivery_handoff_lines h where h.delivery_line_id=source_line.id;
   if rc.state<>'OPEN' or actual_base_quantity<>rc.base_quantity or returned<>0 or source_line.source_mode<>'SUPPLIER_DIRECT'
   then raise exception 'direct_supplier_return_custody_changed' using errcode='PT409';end if;
   if rc.case_kind='TRANSIT_REMAINDER' and rc.base_quantity>hl.moved_base_quantity-vl.accepted_base_quantity-coalesce((select sum(x.base_quantity) from public.return_cases x where x.delivery_line_id=source_line.id and x.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and x.state in('RETURNED','LOSS_APPROVED')),0) then raise exception 'return_exceeds_transit_position' using errcode='23514';end if;
  end if;
 end if;
 if target_event_kind='SUPPLIER_ACCEPTANCE' and c.warehouse_id is not null then
  for lot in select e.* from public.supplier_return_events e where e.case_id=c.id and e.event_kind='PHYSICAL_RETURN' order by e.source_case_version nulls first,e.recorded_at,e.id loop
   lot_before:=least(lot.base_quantity,greatest(0,accepted-prior_lot_qty));
   lot_after:=least(lot.base_quantity,greatest(0,accepted+actual_base_quantity-prior_lot_qty));
   accepted_inventory:=accepted_inventory+round(lot_after*coalesce(lot.inventory_value_vnd,lot.source_value_vnd)/lot.base_quantity)::bigint-round(lot_before*coalesce(lot.inventory_value_vnd,lot.source_value_vnd)/lot.base_quantity)::bigint;
   prior_lot_qty:=prior_lot_qty+lot.base_quantity;
  end loop;
  inventory_portion:=accepted_inventory;
 end if;
 insert into public.supplier_return_events(case_id,branch_id,supplier_id,event_kind,base_quantity,source_value_vnd,supplier_reference,reason,recorded_by,inventory_value_vnd,source_case_version)
 values(c.id,c.branch_id,c.supplier_id,target_event_kind,actual_base_quantity,portion,case when target_event_kind='SUPPLIER_ACCEPTANCE' then trim(target_supplier_reference) else null end,trim(event_reason),auth.uid(),inventory_portion,c.version) returning id into eid;
 if target_event_kind='PHYSICAL_RETURN' then
  if c.warehouse_id is not null then
   insert into public.inventory_movements(branch_id,material_id,base_uom_id,location_kind,warehouse_id,movement_type,base_quantity_delta,inventory_value_delta_vnd,unit_cost_vnd_per_base,source_supplier_return_event_id,occurred_at,recorded_by)
   values(c.branch_id,c.material_id,c.base_uom_id,'WAREHOUSE',c.warehouse_id,'SUPPLIER_RETURN',-actual_base_quantity,-inventory_portion,round(inventory_portion/actual_base_quantity,6),eid,now(),auth.uid());
  else
   update public.return_cases set state='RETURNED',resolution_warehouse_id=null,resolution_destination='SUPPLIER',resolution_reason=trim(event_reason),resolved_by=auth.uid(),resolved_at=now(),version=version+1 where id=rc.id;
   insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values(auth.uid(),c.branch_id,'delivery.returned_to_supplier','return_case',rc.id,operation_id,array['state','resolution_destination','physical_custody'],trim(event_reason));
   insert into public.direct_cost_entries(branch_id,sales_order_id,return_case_id,amount_delta_vnd,cost_kind,recorded_by)
   select c.branch_id,d.sales_order_id,rc.id,-portion,'RETURN_REVERSAL',auth.uid() from public.deliveries d where d.id=source_line.delivery_id;
  end if;
 end if;
 update public.supplier_return_cases set version=version+1,dispatch_closed=dispatch_closed or target_event_kind='CLOSE_DISPATCH' where id=c.id;
 insert into public.command_receipts values(operation_id,auth.uid(),'record_supplier_return_event',h,'supplier_return_event',eid,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),c.branch_id,'supplier_return.'||lower(target_event_kind),'supplier_return_case',c.id,operation_id,array['source_event','event_kind','base_quantity','supplier_reference','physical_destination'],trim(event_reason));
 return eid;
end $function$
;
CREATE OR REPLACE FUNCTION public.finance_dashboard_snapshot(target_branch_id uuid, from_inclusive timestamp with time zone, to_exclusive timestamp with time zone, knowledge_cutoff timestamp with time zone, target_customer_id uuid DEFAULT NULL::uuid, target_site_id uuid DEFAULT NULL::uuid, target_sales_employee_id uuid DEFAULT NULL::uuid, target_activity_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare effective_to timestamptz:=least(to_exclusive,now()); effective_cutoff timestamptz:=least(knowledge_cutoff,now()); can_profit boolean; can_expense boolean; can_ar boolean; can_ap boolean; can_comp boolean; revenue_total bigint:=0; direct_cost_total bigint:=0; opex_total bigint:=0; ar_total bigint:=0; ap_total bigint:=0; salary_total bigint:=0; commission_total bigint:=0; cost_incomplete boolean:=false; opex_not_applicable boolean:=false; unsupported_activity boolean:=target_activity_kind is not null and target_activity_kind not in ('DELIVERY','SERVICE','SALES','OPERATIONS','ADMIN');
begin
  if not private.has_permission(target_branch_id,'dashboard.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if from_inclusive>=to_exclusive then raise exception 'invalid_report_period' using errcode='22023'; end if;
  can_profit:=private.has_permission(target_branch_id,'finance.profit.read'); can_expense:=private.has_permission(target_branch_id,'finance.expense.read'); can_ar:=private.has_permission(target_branch_id,'finance.ar.read'); can_ap:=private.has_permission(target_branch_id,'finance.ap.read'); can_comp:=private.has_permission(target_branch_id,'compensation.read');
  select coalesce(sum(amount),0)::bigint into revenue_total from (
    select r.amount_vnd amount from public.revenue_entries r join public.sales_orders o on o.id=r.sales_order_id where r.branch_id=target_branch_id and r.recorded_at>=from_inclusive and r.recorded_at<effective_to and r.recorded_at<=effective_cutoff and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id) and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='DELIVERY')
    union all
    select v.billable_amount_vnd from public.service_verifications v join public.service_jobs j on j.id=v.service_job_id where j.branch_id=target_branch_id and v.verified_at>=from_inclusive and v.verified_at<effective_to and v.verified_at<=effective_cutoff and (target_customer_id is null or j.customer_id=target_customer_id) and (target_site_id is null or j.site_id=target_site_id) and (target_sales_employee_id is null or j.sales_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='SERVICE')
    union all
    select ra.amount_delta_vnd from public.revenue_adjustments ra
      left join public.sales_orders o on o.id=ra.sales_order_id left join public.service_verifications sv on sv.id=ra.service_verification_id
      left join public.service_jobs j on j.id=sv.service_job_id
      where ra.branch_id=target_branch_id and ra.recorded_at>=from_inclusive and ra.recorded_at<effective_to and ra.recorded_at<=effective_cutoff
        and (target_customer_id is null or coalesce(o.customer_id,j.customer_id)=target_customer_id)
        and (target_site_id is null or coalesce(o.site_id,j.site_id)=target_site_id)
        and (target_sales_employee_id is null or coalesce(o.sales_owner_employee_id,j.sales_employee_id)=target_sales_employee_id)
        and (target_activity_kind is null or(target_activity_kind='DELIVERY' and ra.sales_order_id is not null) or(target_activity_kind='SERVICE' and ra.service_verification_id is not null))
    union all
    select a.amount_delta_vnd from public.receivable_adjustments a join public.receivable_obligations ro on ro.id=a.obligation_id
      join public.delivery_verifications dv on dv.id=ro.delivery_verification_id join public.deliveries d on d.id=dv.delivery_id
      join public.sales_orders o on o.id=d.sales_order_id
      where ro.branch_id=target_branch_id and a.return_case_id is not null and a.recorded_at>=from_inclusive and a.recorded_at<effective_to and a.recorded_at<=effective_cutoff
        and not exists(select 1 from public.revenue_adjustments ra where ra.receivable_adjustment_id=a.id)
        and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id)
        and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and(target_activity_kind is null or target_activity_kind='DELIVERY')
  ) revenue;
  if can_profit then
    select coalesce(sum(amount),0)::bigint into direct_cost_total from (
      select d.amount_delta_vnd amount from public.direct_cost_entries d join public.sales_orders o on o.id=d.sales_order_id where d.branch_id=target_branch_id and d.recorded_at>=from_inclusive and d.recorded_at<effective_to and d.recorded_at<=effective_cutoff and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id) and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='DELIVERY')
      union all
      select e.amount_vnd from public.expenses e join public.delivery_expense_sources s on s.expense_id=e.id join public.deliveries d on d.id=s.delivery_id join public.sales_orders o on o.id=d.sales_order_id
       where e.branch_id=target_branch_id and e.approval_state='APPROVED' and s.cost_scope='DIRECT_DELIVERY'
       and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff
       and (target_customer_id is null or o.customer_id=target_customer_id) and(target_site_id is null or o.site_id=target_site_id)
       and(target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and(target_activity_kind is null or target_activity_kind='DELIVERY')
      union all
      select ee.approved_amount_vnd from public.earning_events ee left join public.service_verifications sv on sv.id=ee.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id left join public.work_item_verifications wv on wv.id=ee.work_item_verification_id left join public.work_items wi on wi.id=wv.work_item_id left join public.deliveries d on d.id=wi.delivery_id left join public.sales_orders wo on wo.id=d.sales_order_id left join public.sales_orders so on so.id=ee.sales_order_id where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification='DIRECT_LABOR' and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff and (target_customer_id is null or coalesce(sj.customer_id,wo.customer_id,so.customer_id)=target_customer_id) and (target_site_id is null or coalesce(sj.site_id,wo.site_id,so.site_id)=target_site_id) and (target_sales_employee_id is null or coalesce(sj.sales_employee_id,wo.sales_owner_employee_id,so.sales_owner_employee_id)=target_sales_employee_id) and (target_activity_kind is null or (target_activity_kind='SERVICE' and ee.service_verification_id is not null) or (target_activity_kind='DELIVERY' and wi.delivery_id is not null))
    ) costs;
    select exists(select 1 from public.delivery_verifications dv join public.deliveries d on d.id=dv.delivery_id
      join public.sales_orders o on o.id=d.sales_order_id where d.branch_id=target_branch_id
       and dv.verified_at>=from_inclusive and dv.verified_at<effective_to and dv.verified_at<=effective_cutoff
       and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id)
       and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and(target_activity_kind is null or target_activity_kind='DELIVERY')
       and not private.delivery_cost_sources_complete(dv.id,effective_cutoff)) into cost_incomplete;
  end if;
  if can_expense then
    select coalesce(sum(amount),0)::bigint into opex_total from (
      select e.amount_vnd amount from public.expenses e where e.branch_id=target_branch_id and e.approval_state='APPROVED' and not exists(select 1 from public.delivery_expense_sources ds where ds.expense_id=e.id and ds.cost_scope='DIRECT_DELIVERY') and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff and (target_customer_id is null or e.customer_id=target_customer_id) and (target_site_id is null or e.site_id=target_site_id) and (target_sales_employee_id is null or e.sales_employee_id=target_sales_employee_id) and (target_activity_kind is null or e.activity_kind=target_activity_kind)
      union all
      select ee.approved_amount_vnd from public.earning_events ee left join public.sales_orders so on so.id=ee.sales_order_id left join public.service_verifications sv on sv.id=ee.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification in ('OPEX','SALES_COMMISSION') and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff and (target_customer_id is null or coalesce(so.customer_id,sj.customer_id)=target_customer_id) and (target_site_id is null or coalesce(so.site_id,sj.site_id)=target_site_id) and (target_sales_employee_id is null or ee.employee_id=target_sales_employee_id) and (target_activity_kind is null or (target_activity_kind='SALES' and ee.classification='SALES_COMMISSION') or (target_activity_kind='SERVICE' and ee.service_verification_id is not null) or (target_activity_kind in ('OPERATIONS','ADMIN') and ee.manual_basis_id is not null))
      union all
      select e.value_vnd from public.warehouse_transfer_events e join public.warehouse_transfers t on t.id=e.transfer_id
       where t.branch_id=target_branch_id and e.event_kind='APPROVE_LOSS' and e.recorded_at>=from_inclusive and e.recorded_at<effective_to and e.recorded_at<=effective_cutoff
       and target_customer_id is null and target_site_id is null and target_sales_employee_id is null and(target_activity_kind is null or target_activity_kind='OPERATIONS')
      union all
      select coalesce(e.inventory_value_vnd,e.source_value_vnd)-c.approved_credit_vnd from public.supplier_return_credits c join public.supplier_return_events e on e.id=c.acceptance_event_id
       join public.supplier_return_cases sc on sc.id=c.case_id left join public.return_cases rc on rc.id=sc.source_return_case_id
       left join public.delivery_lines ln on ln.id=rc.delivery_line_id left join public.deliveries dd on dd.id=ln.delivery_id left join public.sales_orders so on so.id=dd.sales_order_id
       where c.branch_id=target_branch_id and c.approved_at>=from_inclusive and c.approved_at<effective_to and c.approved_at<=effective_cutoff
       and coalesce(e.inventory_value_vnd,e.source_value_vnd)<>c.approved_credit_vnd
       and(target_customer_id is null or so.customer_id=target_customer_id) and(target_site_id is null or so.site_id=target_site_id)
       and(target_sales_employee_id is null or so.sales_owner_employee_id=target_sales_employee_id)
       and(target_activity_kind is null or(target_activity_kind='DELIVERY' and sc.source_fulfillment_line_id is not null) or(target_activity_kind='OPERATIONS' and sc.source_receipt_line_id is not null))
    ) expenses_all;
    opex_not_applicable := (target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null) and (exists(select 1 from public.expenses e where e.branch_id=target_branch_id and e.approval_state='APPROVED' and not exists(select 1 from public.delivery_expense_sources ds where ds.expense_id=e.id and ds.cost_scope='DIRECT_DELIVERY') and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff and ((target_customer_id is not null and e.customer_id is null) or (target_site_id is not null and e.site_id is null) or (target_sales_employee_id is not null and e.sales_employee_id is null))) or exists(select 1 from public.earning_events ee where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification='OPEX' and ee.manual_basis_id is not null and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff));
  end if;
  if can_expense and (target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null) and exists(
   select 1 from public.warehouse_transfer_events e join public.warehouse_transfers t on t.id=e.transfer_id where t.branch_id=target_branch_id and e.event_kind='APPROVE_LOSS'
    and e.recorded_at>=from_inclusive and e.recorded_at<effective_to and e.recorded_at<=effective_cutoff and(target_activity_kind is null or target_activity_kind='OPERATIONS')) then opex_not_applicable:=true;end if;
  if can_expense and(target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null) and exists(
   select 1 from public.supplier_return_credits c join public.supplier_return_events e on e.id=c.acceptance_event_id join public.supplier_return_cases sc on sc.id=c.case_id
    where c.branch_id=target_branch_id and sc.source_receipt_line_id is not null and coalesce(e.inventory_value_vnd,e.source_value_vnd)<>c.approved_credit_vnd and c.approved_at>=from_inclusive and c.approved_at<effective_to and c.approved_at<=effective_cutoff
    and(target_activity_kind is null or target_activity_kind='OPERATIONS')) then opex_not_applicable:=true;end if;
  if can_ar then select coalesce(sum(r.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a where a.obligation_id=r.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.receivable_obligation_id=r.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into ar_total from public.receivable_obligations r left join public.delivery_verifications dv on dv.id=r.delivery_verification_id left join public.deliveries d on d.id=dv.delivery_id left join public.sales_orders so on so.id=d.sales_order_id left join public.service_verifications sv on sv.id=r.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id where r.branch_id=target_branch_id and r.recorded_at<=effective_to and r.recorded_at<=effective_cutoff and (target_customer_id is null or r.customer_id=target_customer_id) and (target_site_id is null or r.site_id=target_site_id) and (target_sales_employee_id is null or coalesce(so.sales_owner_employee_id,sj.sales_employee_id)=target_sales_employee_id); end if;
  if can_ap then select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into ap_total from public.payable_obligations p where p.branch_id=target_branch_id and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff; end if;
  if can_comp then
    select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into salary_total from public.payable_obligations p join public.earning_events ee on ee.id=p.earning_event_id where p.branch_id=target_branch_id and ee.classification<>'SALES_COMMISSION' and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff;
    select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into commission_total from public.payable_obligations p join public.earning_events ee on ee.id=p.earning_event_id left join public.sales_orders so on so.id=ee.sales_order_id where p.branch_id=target_branch_id and ee.classification='SALES_COMMISSION' and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff and (target_customer_id is null or so.customer_id=target_customer_id) and (target_site_id is null or so.site_id=target_site_id) and (target_sales_employee_id is null or ee.employee_id=target_sales_employee_id);
  end if;
  return jsonb_build_object('scope',(jsonb_build_object('from',from_inclusive,'to',effective_to,'as_of',effective_cutoff,'branch_id',target_branch_id)||private.branch_recording_scope(target_branch_id,effective_cutoff)),'revenue',jsonb_build_object('value_vnd',case when not unsupported_activity then (revenue_total)::text else null end,'quality',case when unsupported_activity then 'NOT_APPLICABLE' else 'READY' end),'direct_cost',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then (direct_cost_total)::text else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'gross_profit',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then (revenue_total-direct_cost_total)::text else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'operating_expense',jsonb_build_object('value_vnd',case when can_expense and not opex_not_applicable then (opex_total)::text else null end,'quality',case when not can_expense then 'FORBIDDEN' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_profit',jsonb_build_object('value_vnd',case when can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then (revenue_total-direct_cost_total-opex_total)::text else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_margin_bps',jsonb_build_object('value',case when revenue_total>0 and can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then ((revenue_total-direct_cost_total-opex_total)::numeric*10000/revenue_total) else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'receivable',jsonb_build_object('value_vnd',case when can_ar then (ar_total)::text else null end,'quality',case when can_ar then 'READY' else 'FORBIDDEN' end),'payable',jsonb_build_object('value_vnd',case when can_ap and target_customer_id is null and target_site_id is null and target_sales_employee_id is null then (ap_total)::text else null end,'quality',case when not can_ap then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null then 'NOT_APPLICABLE' else 'READY' end),'salary_payable',jsonb_build_object('value_vnd',case when can_comp and target_customer_id is null and target_site_id is null and target_sales_employee_id is null and target_activity_kind is null then (salary_total)::text else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null or target_activity_kind is not null then 'NOT_APPLICABLE' else 'READY' end),'commission_payable',jsonb_build_object('value_vnd',case when can_comp and (target_activity_kind is null or target_activity_kind='SALES') then (commission_total)::text else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_activity_kind is not null and target_activity_kind<>'SALES' then 'NOT_APPLICABLE' else 'READY' end));
end $function$
;
create or replace view public.supplier_return_event_read with(security_barrier=true) as
 select e.id,e.case_id,e.branch_id,e.event_kind,e.base_quantity::text,e.supplier_reference,e.reason,e.recorded_by,e.recorded_at,
 case when private.has_permission(e.branch_id,'purchasing.price.read') or private.has_permission(e.branch_id,'finance.ap.read') then e.source_value_vnd::text else null end source_value_vnd,
 case when private.has_permission(e.branch_id,'inventory.cost.read') then e.inventory_value_vnd::text else null end inventory_value_vnd,e.source_case_version
 from public.supplier_return_events e where private.has_permission(e.branch_id,'purchasing.read') or private.has_permission(e.branch_id,'inventory.read') or private.has_permission(e.branch_id,'finance.ap.read');
notify pgrst,'reload schema';
commit;
