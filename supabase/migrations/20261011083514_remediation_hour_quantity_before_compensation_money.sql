-- New duration quantities use the existing storage rounding before money; old events untouched.
begin;
alter table public.earning_events add column basis_quantity_policy text check(basis_quantity_policy in('EXACT_SOURCE','DURATION_HALF_UP_6'));
CREATE OR REPLACE FUNCTION public.calculate_earning_event(target_rule_id uuid, source_kind text, source_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rule public.compensation_rules%rowtype; payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; employee uuid; basis_qty numeric; basis_amount bigint; source_date date; source_key text; amount bigint; service_verification uuid; work_verification uuid; sales_order uuid; manual_basis uuid; basis public.compensation_manual_bases%rowtype; quantity_policy text:='EXACT_SOURCE';
begin
  select * into rule from public.compensation_rules where id=target_rule_id;
  if rule.id is null or not private.has_permission(rule.branch_id,'compensation.manage') then raise exception 'forbidden_or_rule_not_found' using errcode='42501'; end if;
  if source_kind not in ('SERVICE_VERIFICATION','WORK_ITEM_VERIFICATION','SALES_ORDER','MANUAL_BASIS') then raise exception 'invalid_earning_source' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('rule',target_rule_id,'source_kind',source_kind,'source',source_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id=calculate_earning_event.operation_id;
  if found then if receipt.command_name<>'calculate_earning_event' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  if exists(select 1 from public.compensation_recognition_policies p where p.rule_id=rule.id) then
    if source_kind<>'WORK_ITEM_VERIFICATION' then raise exception 'automatic_rule_requires_canonical_event' using errcode='22023'; end if;
    select e.id into entity_id from public.earning_events e where e.rule_id=rule.id and e.work_item_verification_id=source_id;
    if entity_id is null then raise exception 'automatic_earning_not_recognized' using errcode='55000'; end if;
    insert into public.command_receipts values(operation_id,(select auth.uid()),'calculate_earning_event',payload_hash,'earning_event',entity_id,now());
    return entity_id;
  end if;
  if source_kind='SERVICE_VERIFICATION' then
    select a.employee_id,case when rule.earning_type='PER_JOB' then 1 when rule.earning_type='PER_HOUR' then extract(epoch from (l.ended_at-l.started_at))/3600 else v.compensable_quantity end,v.verified_at::date,v.id into employee,basis_qty,source_date,service_verification
    from public.service_verifications v join public.service_jobs j on j.id=v.service_job_id and j.branch_id=rule.branch_id join public.service_work_logs l on l.work_item_id=v.work_item_id join public.work_item_assignments a on a.work_item_id=v.work_item_id and a.superseded_at is null where v.id=source_id;
    if rule.earning_type not in ('PER_JOB','PER_HOUR','PER_TON','PER_M3','PER_BAG','PER_UNIT') then raise exception 'rule_not_valid_for_service' using errcode='22023'; end if;
  elsif source_kind='WORK_ITEM_VERIFICATION' then
    select a.employee_id,case when rule.earning_type in ('PER_JOB','PER_TRIP') then 1 else r.actual_quantity end,v.verified_at::date,v.id into employee,basis_qty,source_date,work_verification
    from public.work_item_verifications v join public.work_items w on w.id=v.work_item_id and w.branch_id=rule.branch_id join public.work_item_results r on r.id=v.result_id join public.work_item_assignments a on a.id=r.assignment_id and a.work_item_id=v.work_item_id where v.id=source_id;
    if rule.earning_type not in ('PER_JOB','PER_TRIP','PER_TON','PER_M3','PER_BAG','PER_UNIT') then raise exception 'rule_not_valid_for_work' using errcode='22023'; end if;
  elsif source_kind='SALES_ORDER' then
    if rule.earning_type<>'SALES_COMMISSION' then raise exception 'commission_rule_required' using errcode='22023'; end if;
    select o.sales_owner_employee_id,private.sales_order_net_revenue(o.id,now())-coalesce((select sum(d.amount_delta_vnd) from public.direct_cost_entries d where d.sales_order_id=o.id),0),coalesce(max(r.recorded_at),now())::date,o.id into employee,basis_amount,source_date,sales_order
    from public.sales_orders o left join public.revenue_entries r on r.sales_order_id=o.id where o.id=source_id and o.branch_id=rule.branch_id group by o.id;
    if exists(select 1 from public.delivery_verifications dv join public.deliveries d on d.id=dv.delivery_id
      where d.sales_order_id=source_id and not private.delivery_cost_sources_complete(dv.id,now()))
    then raise exception 'commission_cost_source_incomplete' using errcode='23514';end if;
    basis_qty:=basis_amount;
    if basis_amount is null or basis_amount<=0 then raise exception 'commission_profit_basis_not_positive' using errcode='23514'; end if;
  else
    select * into basis from public.compensation_manual_bases where id=source_id and branch_id=rule.branch_id;
    employee:=basis.employee_id; basis_qty:=basis.basis_quantity; source_date:=basis.period_end; manual_basis:=basis.id;
    if basis.id is null or rule.earning_type<>basis.basis_type then raise exception 'rule_basis_mismatch' using errcode='22023'; end if;
  end if;
  if employee is null or (rule.employee_id is not null and rule.employee_id<>employee) then raise exception 'earning_employee_mismatch' using errcode='42501'; end if;
  if source_date<rule.effective_from or (rule.effective_to is not null and source_date>rule.effective_to) then raise exception 'rule_not_effective' using errcode='22023'; end if;
  source_key:=source_kind||':'||source_id::text;
  if source_kind='SERVICE_VERIFICATION' and rule.earning_type='PER_HOUR' then
    basis_qty:=round(basis_qty,6);quantity_policy:='DURATION_HALF_UP_6';
  end if;
  perform private.require_exact_quantity(abs(basis_qty),true);
  if rule.calculation_kind='PERCENT_BPS' then amount:=round(basis_amount::numeric*rule.rate_bps/10000)::bigint; else amount:=round(basis_qty*rule.rate_vnd_per_unit)::bigint; end if;
  if amount=0 then raise exception 'zero_earning_not_recorded' using errcode='23514'; end if;
  insert into public.earning_events(branch_id,employee_id,rule_id,rule_code_snapshot,rule_version_snapshot,earning_type,classification,service_verification_id,work_item_verification_id,sales_order_id,manual_basis_id,source_key,basis_quantity,basis_amount_vnd,rate_vnd_per_unit_snapshot,rate_bps_snapshot,calculated_amount_vnd,created_by,basis_quantity_policy)
  values(rule.branch_id,employee,rule.id,rule.code,rule.version,rule.earning_type,rule.classification,service_verification,work_verification,sales_order,manual_basis,source_key,basis_qty,basis_amount,rule.rate_vnd_per_unit,rule.rate_bps,amount,(select auth.uid()),quantity_policy) on conflict on constraint earning_events_source_key_rule_id_employee_id_key do nothing returning id into entity_id;
  if entity_id is null then
    select e.id into entity_id from public.earning_events e where e.source_key=calculate_earning_event.source_key and e.rule_id=rule.id and e.employee_id=employee;
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'calculate_earning_event',payload_hash,'earning_event',entity_id,now());
  return entity_id;
end $function$
;
create or replace view public.earning_event_read as SELECT ee.id,
    ee.branch_id,
    ee.employee_id,
    e.display_name AS employee_name,
    ee.rule_id,
    ee.rule_code_snapshot,
    ee.rule_version_snapshot,
    ee.earning_type,
    ee.classification,
    ee.source_key,
    ee.basis_quantity,
    ee.basis_amount_vnd,
    ee.rate_vnd_per_unit_snapshot,
    ee.rate_bps_snapshot,
    ee.calculated_amount_vnd,
    ee.approved_amount_vnd,
    ee.approval_state,
    ee.version,
    ee.created_at,
    ee.approved_at,
    ee.service_verification_id,
    ee.work_item_verification_id,
    ee.sales_order_id,
    ee.manual_basis_id,
    ee.payable_obligation_id,
    private.earning_payable_outstanding(ee.id) AS outstanding_amount_vnd,
    ee.payment_allocation_id,
    ee.reverses_earning_event_id,
    a.payment_id,
    a.receivable_obligation_id,
    a.allocated_at,
    p.payment_number,
    p.effective_at AS payment_effective_at,
    wv.result_id AS work_item_result_id,
    wv.work_item_id,
    wv.verified_at AS work_verified_at,
    rp.effective_at AS recognition_effective_at,
    dv.delivery_id
  , ee.basis_quantity_policy
 FROM (((((((earning_events ee
     JOIN employees e ON ((e.id = ee.employee_id)))
     LEFT JOIN payment_allocations a ON ((a.id = ee.payment_allocation_id)))
     LEFT JOIN payments p ON ((p.id = a.payment_id)))
     LEFT JOIN work_item_verifications wv ON ((wv.id = ee.work_item_verification_id)))
     LEFT JOIN compensation_recognition_policies rp ON ((rp.rule_id = ee.rule_id)))
     LEFT JOIN receivable_obligations ro ON ((ro.id = a.receivable_obligation_id)))
     LEFT JOIN delivery_verifications dv ON ((dv.id = ro.delivery_verification_id)));
notify pgrst,'reload schema';
commit;
