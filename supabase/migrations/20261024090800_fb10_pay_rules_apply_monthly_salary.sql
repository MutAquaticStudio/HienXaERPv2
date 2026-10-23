-- FB10 (11): pay rules apply by themselves. Creating a "Theo chuyến" or "Theo việc" rule was not enough: each rule also
-- needed a separate "phê duyệt ghi nhận tự động" before verified jobs earned anything. Now every rule of those kinds that is
-- in effect applies when a job is verified — the worker's own rule first, then the rule for every worker; delivery jobs
-- prefer "Theo chuyến" — and the earning is approved and owed at once, approved by whoever created the rule. Old approvals
-- stay as history and still name the approver where they exist.
-- Monthly salary: "Tính lương tháng" posts one approved earning per worker with a "Lương tháng" rule in effect that month
-- (latest version), once per month (source MONTHLY:YYYY-MM), owed like any other earning.
-- Also fixes calculate_earning_event failing with "missing FROM-clause entry" whenever the same source was calculated again.
begin;

create or replace function private.post_recognized_earning(target_rule uuid, source_key text, work_verification uuid,
  sales_order uuid, allocation uuid, basis_amount bigint, amount bigint, source_actor uuid, reversed_earning uuid default null)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r public.compensation_rules%rowtype; p public.compensation_recognition_policies%rowtype;
  original public.earning_events%rowtype; event_id uuid; payable_id uuid; adjustment_id uuid; employee uuid;
begin
  select * into r from public.compensation_rules where id=target_rule;
  select * into p from public.compensation_recognition_policies where rule_id=r.id;
  -- Commission still needs its approval (allocation sources); work and monthly pay apply from the rule itself.
  if r.id is null or (allocation is not null and p.rule_id is null) then raise exception 'invalid_recognition_source' using errcode='42501'; end if;
  employee:=coalesce(p.employee_id,r.employee_id);
  if employee is null and work_verification is not null then
    select a.employee_id into employee from public.work_item_verifications v
      join public.work_item_results res on res.id=v.result_id
      join public.work_item_assignments a on a.id=res.assignment_id and a.work_item_id=v.work_item_id
      where v.id=work_verification;
  end if;
  if employee is null or source_actor is null or source_actor<>(select auth.uid()) then raise exception 'invalid_recognition_source' using errcode='42501'; end if;
  if reversed_earning is not null then
    select * into original from public.earning_events where id=reversed_earning for update;
    if original.approval_state<>'APPROVED' or original.employee_id<>employee or original.rule_id<>r.id or amount>=0 then
      raise exception 'invalid_commission_reversal' using errcode='23514'; end if;
    payable_id:=original.payable_obligation_id;
    perform 1 from public.payable_obligations where id=payable_id for update;
    if payable_id is null or private.current_payable_outstanding(payable_id)+amount<0 then
      raise exception 'commission_reversal_exceeds_unpaid_earning' using errcode='PT409'; end if;
  end if;
  insert into public.earning_events(branch_id,employee_id,rule_id,rule_code_snapshot,rule_version_snapshot,
    earning_type,classification,work_item_verification_id,sales_order_id,payment_allocation_id,reverses_earning_event_id,
    source_key,basis_quantity,basis_amount_vnd,rate_vnd_per_unit_snapshot,rate_bps_snapshot,calculated_amount_vnd,created_by)
  values(r.branch_id,employee,r.id,r.code,r.version,r.earning_type,r.classification,work_verification,
    sales_order,allocation,reversed_earning,source_key,case when allocation is null then 1 else basis_amount end,
    basis_amount,r.rate_vnd_per_unit,r.rate_bps,amount,source_actor)
  on conflict on constraint earning_events_source_key_rule_id_employee_id_key do nothing returning id into event_id;
  if event_id is null then
    select e.id into event_id from public.earning_events e where e.rule_id=r.id and e.employee_id=employee and e.source_key=post_recognized_earning.source_key;
    return event_id;
  end if;
  if amount>0 then
    insert into public.payable_obligations(branch_id,employee_id,earning_event_id,original_amount_vnd,due_date,recorded_by)
      values(r.branch_id,employee,event_id,amount,(now() at time zone 'Asia/Ho_Chi_Minh')::date,source_actor) returning id into payable_id;
  else
    insert into public.payable_adjustments(obligation_id,amount_delta_vnd,reason,recorded_by)
      values(payable_id,amount,'Commission reversal of allocation '||original.payment_allocation_id::text,source_actor) returning id into adjustment_id;
  end if;
  update public.earning_events set approval_state='APPROVED',approved_amount_vnd=amount,approved_by=coalesce(p.approved_by,r.created_by),
    approved_at=now(),version=version+1,payable_obligation_id=case when amount>0 then payable_id else null end,
    payable_adjustment_id=adjustment_id where id=event_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
    values(source_actor,r.branch_id,'earning.recognized','earning_event',event_id,event_id,array['source_key','calculated_amount_vnd','payable_effect']);
  return event_id;
end $function$;

-- A verified job earns by the worker's own rule, else by the rule for every worker (delivery: "Theo chuyến" first).
create or replace function private.recognize_verified_work() returns trigger
language plpgsql security definer set search_path='' as $function$
declare source record; rule public.compensation_rules%rowtype; amount bigint; day date;
begin
  select v.id,v.verified_by,v.verified_at,a.employee_id into source
    from public.work_item_verifications v join public.work_item_results r on r.id=v.result_id
    join public.work_item_assignments a on a.id=r.assignment_id and a.work_item_id=new.id
    where v.work_item_id=new.id;
  if source.id is null then raise exception 'verified_work_source_required' using errcode='23503'; end if;
  day:=(source.verified_at at time zone 'Asia/Ho_Chi_Minh')::date;
  select r.* into rule from public.compensation_rules r
    where r.branch_id=new.branch_id and r.calculation_kind='FIXED_PER_BASIS' and r.earning_type in ('PER_JOB','PER_TRIP')
      and (r.employee_id=source.employee_id or r.employee_id is null)
      and r.effective_from<=day and (r.effective_to is null or r.effective_to>=day)
      -- Only the newest version of a rule code applies.
      and not exists (select 1 from public.compensation_rules newer where newer.branch_id=r.branch_id and newer.code=r.code and newer.version>r.version
        and newer.effective_from<=day)
    order by r.employee_id is null, (new.delivery_id is not null and r.earning_type='PER_TRIP') desc, r.effective_from desc, r.created_at desc
    limit 1;
  if rule.id is null then return new; end if;
  if source.verified_by<>(select auth.uid()) or not
    ((new.delivery_id is not null and (private.has_permission(new.branch_id,'work.verify')
        or exists (select 1 from public.deliveries d where d.id=new.delivery_id and d.execution_state='VERIFIED')))
      or (new.service_job_id is not null and private.has_permission(new.branch_id,'service.verify'))) then
    raise exception 'forbidden_work_recognition' using errcode='42501'; end if;
  amount:=round(rule.rate_vnd_per_unit)::bigint;
  perform private.post_recognized_earning(rule.id,'WORK_ITEM_VERIFICATION:'||source.id::text,source.id,
    null,null,null,amount,source.verified_by);
  return new;
end $function$;

-- "Tính lương tháng": one approved, owed earning per worker with a "Lương tháng" rule in effect in the month.
create or replace function public.post_monthly_salaries(target_branch_id uuid, target_month date, operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare month_start date:=date_trunc('month',target_month)::date; month_end date; rule record; posted integer:=0; total bigint:=0;
  receipt public.command_receipts%rowtype; h text; event_id uuid; existed boolean;
  basis_id uuid; payable_id uuid; amount bigint;
begin
  if auth.uid() is null or target_branch_id is null or target_month is null or post_monthly_salaries.operation_id is null
    or not private.has_permission(target_branch_id,'compensation.manage') or not private.has_permission(target_branch_id,'compensation.approve') then
    raise exception 'forbidden' using errcode='42501'; end if;
  month_end:=(month_start+interval '1 month'-interval '1 day')::date;
  if month_start>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'salary_month_in_future' using errcode='22023'; end if;
  h:=private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'month',month_start));
  perform pg_advisory_xact_lock(hashtextextended('post_monthly_salaries:'||target_branch_id::text||':'||month_start::text,0));
  select * into receipt from public.command_receipts r where r.operation_id=post_monthly_salaries.operation_id;
  if found then
    if receipt.command_name<>'post_monthly_salaries' or receipt.payload_hash<>h or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode='23505'; end if;
    return jsonb_build_object('replayed',true);
  end if;
  for rule in select r.* from public.compensation_rules r join public.employees e on e.id=r.employee_id and e.active
    where r.branch_id=target_branch_id and r.earning_type='FIXED_MONTHLY' and r.calculation_kind='FIXED_PER_BASIS' and r.employee_id is not null
      and r.effective_from<=month_end and (r.effective_to is null or r.effective_to>=month_start)
      and not exists (select 1 from public.compensation_rules newer where newer.branch_id=r.branch_id and newer.employee_id=r.employee_id
        and newer.earning_type='FIXED_MONTHLY' and newer.effective_from<=month_end and (newer.effective_to is null or newer.effective_to>=month_start)
        and (newer.effective_from>r.effective_from or (newer.effective_from=r.effective_from and newer.created_at>r.created_at)))
  loop
    existed:=exists(select 1 from public.earning_events x where x.employee_id=rule.employee_id and x.earning_type='FIXED_MONTHLY'
      and x.source_key='MONTHLY:'||to_char(month_start,'YYYY-MM'));
    continue when existed;
    amount:=round(rule.rate_vnd_per_unit)::bigint;
    -- The month is the earning's source (a basis of one month), like a salary entered by hand.
    insert into public.compensation_manual_bases(branch_id,employee_id,basis_type,basis_quantity,period_start,period_end,description,recorded_by)
      values(target_branch_id,rule.employee_id,'FIXED_MONTHLY',1,month_start,month_end,'Lương tháng '||to_char(month_start,'MM/YYYY'),auth.uid())
      returning id into basis_id;
    insert into public.earning_events(branch_id,employee_id,rule_id,rule_code_snapshot,rule_version_snapshot,earning_type,classification,manual_basis_id,
      source_key,basis_quantity,rate_vnd_per_unit_snapshot,calculated_amount_vnd,created_by,basis_quantity_policy)
      values(target_branch_id,rule.employee_id,rule.id,rule.code,rule.version,rule.earning_type,rule.classification,basis_id,
      'MONTHLY:'||to_char(month_start,'YYYY-MM'),1,rule.rate_vnd_per_unit,amount,auth.uid(),'EXACT_SOURCE') returning id into event_id;
    insert into public.payable_obligations(branch_id,employee_id,earning_event_id,original_amount_vnd,due_date,recorded_by)
      values(target_branch_id,rule.employee_id,event_id,amount,month_end,auth.uid()) returning id into payable_id;
    update public.earning_events set approval_state='APPROVED',approved_amount_vnd=amount,approved_by=auth.uid(),approved_at=now(),
      version=version+1,payable_obligation_id=payable_id where id=event_id;
    posted:=posted+1; total:=total+amount;
  end loop;
  insert into public.command_receipts values(post_monthly_salaries.operation_id,auth.uid(),'post_monthly_salaries',h,'branch',target_branch_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
    values(auth.uid(),target_branch_id,'compensation.monthly_posted','branch',target_branch_id,post_monthly_salaries.operation_id,
      array['earning_events','payables'],'Tính lương tháng '||to_char(month_start,'MM/YYYY'));
  return jsonb_build_object('posted',posted,'total_vnd',total::text,'month',to_char(month_start,'YYYY-MM'));
end $function$;
revoke all on function public.post_monthly_salaries(uuid,date,uuid) from public,anon;
grant execute on function public.post_monthly_salaries(uuid,date,uuid) to authenticated;

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
    -- FB10: source_key is a local variable, not a parameter; the qualified name failed on every repeat (Production log).
    select e.id into entity_id from public.earning_events e where e.source_key=(calculate_earning_event.source_kind||':'||calculate_earning_event.source_id::text) and e.rule_id=rule.id and e.employee_id=employee;
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'calculate_earning_event',payload_hash,'earning_event',entity_id,now());
  return entity_id;
end $function$
;

notify pgrst,'reload schema';
commit;
