-- Explicit standing approval. Existing unconfigured rules retain their manual flow.
-- No data backfill: recognition only runs on a new canonical posting/verification.
begin;
create table public.compensation_recognition_policies (
  rule_id uuid primary key references public.compensation_rules(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  recognition_kind text not null check(recognition_kind in ('AR_PAYMENT_ALLOCATION','WORK_ITEM_VERIFICATION')),
  effective_at timestamptz not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(branch_id,employee_id,recognition_kind)
);
alter table public.compensation_recognition_policies enable row level security;
revoke all on public.compensation_recognition_policies from public,anon,authenticated;
grant select on public.compensation_recognition_policies to authenticated;
create policy compensation_recognition_policies_read on public.compensation_recognition_policies
for select to authenticated using(private.has_permission(branch_id,'compensation.read'));
create trigger compensation_recognition_policies_immutable before update or delete
on public.compensation_recognition_policies for each row execute function private.reject_append_only_workforce_mutation();

alter table public.earning_events
  add column payment_allocation_id uuid unique references public.payment_allocations(id) on delete restrict,
  add column reverses_earning_event_id uuid unique references public.earning_events(id) on delete restrict,
  add constraint earning_allocation_source check(payment_allocation_id is null or
    (sales_order_id is not null and earning_type='SALES_COMMISSION' and classification='SALES_COMMISSION'
     and source_key='AR_PAYMENT_ALLOCATION:'||payment_allocation_id::text
     and basis_amount_vnd is not null and rate_bps_snapshot is not null
     and ((reverses_earning_event_id is null and calculated_amount_vnd>0 and basis_amount_vnd>0)
       or (reverses_earning_event_id is not null and calculated_amount_vnd<0 and basis_amount_vnd<0)))),
  add constraint earning_reversal_source check(reverses_earning_event_id is null or payment_allocation_id is not null);

create function public.configure_compensation_recognition(target_rule_id uuid, recognition_kind text, effective_at timestamptz, operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r public.compensation_rules%rowtype; p public.compensation_recognition_policies%rowtype;
  h text; receipt public.command_receipts%rowtype;
begin
  select * into r from public.compensation_rules where id=target_rule_id;
  if r.id is null or not private.has_permission(r.branch_id,'compensation.manage')
    or not private.has_permission(r.branch_id,'compensation.approve') then
    raise exception 'forbidden_or_rule_not_found' using errcode='42501';
  end if;
  if r.employee_id is null or effective_at is null or not isfinite(effective_at)
    or recognition_kind not in ('AR_PAYMENT_ALLOCATION','WORK_ITEM_VERIFICATION')
    or (effective_at at time zone 'Asia/Ho_Chi_Minh')::date<r.effective_from
    or (r.effective_to is not null and (effective_at at time zone 'Asia/Ho_Chi_Minh')::date>r.effective_to)
    or (recognition_kind='AR_PAYMENT_ALLOCATION' and (r.earning_type<>'SALES_COMMISSION' or r.calculation_kind<>'PERCENT_BPS'))
    or (recognition_kind='WORK_ITEM_VERIFICATION' and (r.earning_type not in ('PER_JOB','PER_TRIP') or r.calculation_kind<>'FIXED_PER_BASIS')) then
    raise exception 'invalid_recognition_policy' using errcode='22023';
  end if;
  h:=private.command_payload_hash(jsonb_build_object('rule',target_rule_id,'kind',recognition_kind,'effective_at',effective_at));
  select * into receipt from public.command_receipts c where c.operation_id=configure_compensation_recognition.operation_id;
  if found then
    if receipt.command_name<>'configure_compensation_recognition' or receipt.payload_hash<>h then raise exception 'operation_payload_conflict' using errcode='PT409'; end if;
    return receipt.result_entity_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(r.branch_id::text||':'||r.employee_id::text||':'||recognition_kind,0));
  select * into p from public.compensation_recognition_policies where rule_id=r.id;
  if p.rule_id is not null then
    if p.recognition_kind<>configure_compensation_recognition.recognition_kind or p.effective_at<>configure_compensation_recognition.effective_at then
      raise exception 'recognition_policy_conflict' using errcode='PT409'; end if;
  else
    if exists(select 1 from public.compensation_recognition_policies x where x.branch_id=r.branch_id and x.employee_id=r.employee_id and x.recognition_kind=configure_compensation_recognition.recognition_kind) then
      raise exception 'recognition_policy_already_configured' using errcode='PT409'; end if;
    insert into public.compensation_recognition_policies(rule_id,branch_id,employee_id,recognition_kind,effective_at,approved_by)
      values(r.id,r.branch_id,r.employee_id,recognition_kind,effective_at,(select auth.uid()));
    insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
      values((select auth.uid()),r.branch_id,'compensation.recognition.approved','compensation_rule',r.id,operation_id,array['recognition_kind','effective_at']);
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'configure_compensation_recognition',h,'compensation_rule',r.id,now());
  return r.id;
end $function$;
revoke all on function public.configure_compensation_recognition(uuid,text,timestamptz,uuid) from public,anon;
grant execute on function public.configure_compensation_recognition(uuid,text,timestamptz,uuid) to authenticated;

-- A bounded internal writer, never granted to API/business roles. The caller derives
-- employee and source from immutable canonical facts, not request-supplied actor IDs.
create function private.post_recognized_earning(target_rule uuid, source_key text, work_verification uuid,
  sales_order uuid, allocation uuid, basis_amount bigint, amount bigint, source_actor uuid, reversed_earning uuid default null)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r public.compensation_rules%rowtype; p public.compensation_recognition_policies%rowtype;
  original public.earning_events%rowtype; event_id uuid; payable_id uuid; adjustment_id uuid;
begin
  select * into r from public.compensation_rules where id=target_rule;
  select * into p from public.compensation_recognition_policies where rule_id=r.id;
  if p.rule_id is null or source_actor is null or source_actor<>(select auth.uid()) then raise exception 'invalid_recognition_source' using errcode='42501'; end if;
  if reversed_earning is not null then
    select * into original from public.earning_events where id=reversed_earning for update;
    if original.approval_state<>'APPROVED' or original.employee_id<>p.employee_id or original.rule_id<>r.id or amount>=0 then
      raise exception 'invalid_commission_reversal' using errcode='23514'; end if;
    payable_id:=original.payable_obligation_id;
    perform 1 from public.payable_obligations where id=payable_id for update;
    if payable_id is null or private.current_payable_outstanding(payable_id)+amount<0 then
      raise exception 'commission_reversal_exceeds_unpaid_earning' using errcode='PT409'; end if;
  end if;
  insert into public.earning_events(branch_id,employee_id,rule_id,rule_code_snapshot,rule_version_snapshot,
    earning_type,classification,work_item_verification_id,sales_order_id,payment_allocation_id,reverses_earning_event_id,
    source_key,basis_quantity,basis_amount_vnd,rate_vnd_per_unit_snapshot,rate_bps_snapshot,calculated_amount_vnd,created_by)
  values(r.branch_id,p.employee_id,r.id,r.code,r.version,r.earning_type,r.classification,work_verification,
    sales_order,allocation,reversed_earning,source_key,case when allocation is null then 1 else basis_amount end,
    basis_amount,r.rate_vnd_per_unit,r.rate_bps,amount,source_actor)
  on conflict on constraint earning_events_source_key_rule_id_employee_id_key do nothing returning id into event_id;
  if event_id is null then
    select e.id into event_id from public.earning_events e where e.rule_id=r.id and e.employee_id=p.employee_id and e.source_key=post_recognized_earning.source_key;
    return event_id;
  end if;
  if amount>0 then
    insert into public.payable_obligations(branch_id,employee_id,earning_event_id,original_amount_vnd,due_date,recorded_by)
      values(r.branch_id,p.employee_id,event_id,amount,(now() at time zone 'Asia/Ho_Chi_Minh')::date,source_actor) returning id into payable_id;
  else
    insert into public.payable_adjustments(obligation_id,amount_delta_vnd,reason,recorded_by)
      values(payable_id,amount,'Commission reversal of allocation '||original.payment_allocation_id::text,source_actor) returning id into adjustment_id;
  end if;
  update public.earning_events set approval_state='APPROVED',approved_amount_vnd=amount,approved_by=p.approved_by,
    approved_at=now(),version=version+1,payable_obligation_id=case when amount>0 then payable_id else null end,
    payable_adjustment_id=adjustment_id where id=event_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
    values(source_actor,r.branch_id,'earning.recognized','earning_event',event_id,event_id,array['source_key','calculated_amount_vnd','payable_effect']);
  return event_id;
end $function$;
revoke all on function private.post_recognized_earning(uuid,text,uuid,uuid,uuid,bigint,bigint,uuid,uuid) from public,anon,authenticated;

create function private.recognize_ar_allocation() returns trigger
language plpgsql security definer set search_path='' as $function$
declare payment public.payments%rowtype; original public.earning_events%rowtype;
  source record; policy record; amount bigint;
begin
  if new.receivable_obligation_id is null then return new; end if;
  select * into payment from public.payments where id=new.payment_id;
  if new.allocated_by<>(select auth.uid()) then raise exception 'invalid_allocation_actor' using errcode='42501'; end if;
  if new.reversal_of_allocation_id is not null then
    select * into original from public.earning_events where payment_allocation_id=new.reversal_of_allocation_id;
    if original.id is null then return new; end if;
    if not private.has_permission(payment.branch_id,'finance.payment.reverse') then raise exception 'forbidden' using errcode='42501'; end if;
    if not exists(select 1 from public.payment_allocations a join public.payments p on p.id=a.payment_id
      where a.id=new.reversal_of_allocation_id and p.id=payment.reversal_of_payment_id
      and p.direction='RECEIPT' and p.customer_id=payment.customer_id and p.branch_id=payment.branch_id
      and original.branch_id=p.branch_id and a.receivable_obligation_id=new.receivable_obligation_id
      and new.amount_delta_vnd=-a.amount_delta_vnd) then raise exception 'invalid_commission_reversal_source' using errcode='23514'; end if;
    -- The canonical reversal reverses the complete allocation; use its original
    -- rounded commission exactly, never recompute using a newer rule or SO owner.
    perform private.post_recognized_earning(original.rule_id,'AR_PAYMENT_ALLOCATION:'||new.id::text,null,
      original.sales_order_id,new.id,new.amount_delta_vnd,-original.approved_amount_vnd,new.allocated_by,original.id);
    return new;
  end if;
  if payment.direction<>'RECEIPT' or payment.reversal_of_payment_id is not null or new.amount_delta_vnd<=0 then return new; end if;
  select o.id sales_order_id,o.sales_owner_employee_id employee_id,o.branch_id,ro.customer_id into source
    from public.receivable_obligations ro join public.delivery_verifications v on v.id=ro.delivery_verification_id
    join public.deliveries d on d.id=v.delivery_id join public.sales_orders o on o.id=d.sales_order_id
    where ro.id=new.receivable_obligation_id and ro.branch_id=payment.branch_id and d.branch_id=ro.branch_id
      and o.branch_id=ro.branch_id and ro.customer_id=payment.customer_id and o.customer_id=ro.customer_id;
  if source.employee_id is null then return new; end if;
  select p.*,r.rate_bps into policy from public.compensation_recognition_policies p
    join public.compensation_rules r on r.id=p.rule_id
    where p.branch_id=source.branch_id and p.employee_id=source.employee_id and p.recognition_kind='AR_PAYMENT_ALLOCATION'
      and new.allocated_at>=p.effective_at and payment.effective_at>=p.effective_at
      and (new.allocated_at at time zone 'Asia/Ho_Chi_Minh')::date>=r.effective_from
      and (r.effective_to is null or (new.allocated_at at time zone 'Asia/Ho_Chi_Minh')::date<=r.effective_to);
  if policy.rule_id is null then return new; end if;
  if not private.has_permission(payment.branch_id,'finance.payment.post') then raise exception 'forbidden' using errcode='42501'; end if;
  amount:=round(new.amount_delta_vnd::numeric*policy.rate_bps/10000)::bigint;
  if amount<>0 then
    perform private.post_recognized_earning(policy.rule_id,'AR_PAYMENT_ALLOCATION:'||new.id::text,null,
      source.sales_order_id,new.id,new.amount_delta_vnd,amount,new.allocated_by);
  end if;
  return new;
end $function$;
revoke all on function private.recognize_ar_allocation() from public,anon,authenticated;
create trigger payment_allocation_earning after insert on public.payment_allocations
for each row execute function private.recognize_ar_allocation();

create function private.recognize_verified_work() returns trigger
language plpgsql security definer set search_path='' as $function$
declare source record; policy record; amount bigint;
begin
  select v.id,v.verified_by,v.verified_at,a.employee_id into source
    from public.work_item_verifications v join public.work_item_results r on r.id=v.result_id
    join public.work_item_assignments a on a.id=r.assignment_id and a.work_item_id=new.id
    where v.work_item_id=new.id;
  if source.id is null then raise exception 'verified_work_source_required' using errcode='23503'; end if;
  select p.*,r.rate_vnd_per_unit into policy from public.compensation_recognition_policies p
    join public.compensation_rules r on r.id=p.rule_id
    where p.branch_id=new.branch_id and p.employee_id=source.employee_id and p.recognition_kind='WORK_ITEM_VERIFICATION'
      and source.verified_at>=p.effective_at
      and (source.verified_at at time zone 'Asia/Ho_Chi_Minh')::date>=r.effective_from
      and (r.effective_to is null or (source.verified_at at time zone 'Asia/Ho_Chi_Minh')::date<=r.effective_to);
  if policy.rule_id is null then return new; end if;
  if source.verified_by<>(select auth.uid()) or not
    ((new.delivery_id is not null and private.has_permission(new.branch_id,'work.verify'))
      or (new.service_job_id is not null and private.has_permission(new.branch_id,'service.verify'))) then
    raise exception 'forbidden_work_recognition' using errcode='42501'; end if;
  amount:=round(policy.rate_vnd_per_unit)::bigint;
  perform private.post_recognized_earning(policy.rule_id,'WORK_ITEM_VERIFICATION:'||source.id::text,source.id,
    null,null,null,amount,source.verified_by);
  return new;
end $function$;
revoke all on function private.recognize_verified_work() from public,anon,authenticated;
create trigger verified_work_earning after update of execution_state on public.work_items
for each row when(new.execution_state='VERIFIED' and old.execution_state is distinct from new.execution_state)
execute function private.recognize_verified_work();

create function private.guard_posted_earning() returns trigger language plpgsql set search_path='' as $function$
begin
  if old.approval_state='APPROVED' then raise exception 'posted_earning_immutable' using errcode='55000'; end if;
  if (to_jsonb(new)-array['approval_state','approved_amount_vnd','approved_by','approved_at','version','payable_obligation_id','payable_adjustment_id'])
     is distinct from (to_jsonb(old)-array['approval_state','approved_amount_vnd','approved_by','approved_at','version','payable_obligation_id','payable_adjustment_id']) then
    raise exception 'earning_source_immutable' using errcode='55000'; end if;
  return new;
end $function$;
revoke all on function private.guard_posted_earning() from public,anon,authenticated;
create trigger earning_events_posted_immutable before update on public.earning_events
for each row execute function private.guard_posted_earning();

CREATE OR REPLACE FUNCTION public.calculate_earning_event(target_rule_id uuid, source_kind text, source_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rule public.compensation_rules%rowtype; payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; employee uuid; basis_qty numeric; basis_amount bigint; source_date date; source_key text; amount bigint; service_verification uuid; work_verification uuid; sales_order uuid; manual_basis uuid; basis public.compensation_manual_bases%rowtype;
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
    select o.sales_owner_employee_id,coalesce(sum(r.amount_vnd),0)-coalesce((select sum(d.amount_delta_vnd) from public.direct_cost_entries d where d.sales_order_id=o.id),0),coalesce(max(r.recorded_at),now())::date,o.id into employee,basis_amount,source_date,sales_order
    from public.sales_orders o left join public.revenue_entries r on r.sales_order_id=o.id where o.id=source_id and o.branch_id=rule.branch_id group by o.id;
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
  if rule.calculation_kind='PERCENT_BPS' then amount:=round(basis_amount::numeric*rule.rate_bps/10000)::bigint; else amount:=round(basis_qty*rule.rate_vnd_per_unit)::bigint; end if;
  if amount=0 then raise exception 'zero_earning_not_recorded' using errcode='23514'; end if;
  insert into public.earning_events(branch_id,employee_id,rule_id,rule_code_snapshot,rule_version_snapshot,earning_type,classification,service_verification_id,work_item_verification_id,sales_order_id,manual_basis_id,source_key,basis_quantity,basis_amount_vnd,rate_vnd_per_unit_snapshot,rate_bps_snapshot,calculated_amount_vnd,created_by)
  values(rule.branch_id,employee,rule.id,rule.code,rule.version,rule.earning_type,rule.classification,service_verification,work_verification,sales_order,manual_basis,source_key,basis_qty,basis_amount,rule.rate_vnd_per_unit,rule.rate_bps,amount,(select auth.uid())) on conflict on constraint earning_events_source_key_rule_id_employee_id_key do nothing returning id into entity_id;
  if entity_id is null then
    select e.id into entity_id from public.earning_events e where e.source_key=calculate_earning_event.source_key and e.rule_id=rule.id and e.employee_id=employee;
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'calculate_earning_event',payload_hash,'earning_event',entity_id,now());
  return entity_id;
end $function$
;
create or replace view public.earning_event_read with(security_invoker=true) as
select ee.id,ee.branch_id,ee.employee_id,e.display_name employee_name,ee.rule_id,
  ee.rule_code_snapshot,ee.rule_version_snapshot,ee.earning_type,ee.classification,ee.source_key,
  ee.basis_quantity,ee.basis_amount_vnd,ee.rate_vnd_per_unit_snapshot,ee.rate_bps_snapshot,
  ee.calculated_amount_vnd,ee.approved_amount_vnd,ee.approval_state,ee.version,ee.created_at,ee.approved_at,
  ee.service_verification_id,ee.work_item_verification_id,ee.sales_order_id,ee.manual_basis_id,ee.payable_obligation_id,
  private.earning_payable_outstanding(ee.id) outstanding_amount_vnd,
  ee.payment_allocation_id,ee.reverses_earning_event_id,a.payment_id,a.receivable_obligation_id,
  a.allocated_at,p.payment_number,p.effective_at payment_effective_at,
  wv.result_id work_item_result_id,wv.work_item_id,wv.verified_at work_verified_at,
  rp.effective_at recognition_effective_at,dv.delivery_id
from public.earning_events ee join public.employees e on e.id=ee.employee_id
left join public.payment_allocations a on a.id=ee.payment_allocation_id
left join public.payments p on p.id=a.payment_id
left join public.work_item_verifications wv on wv.id=ee.work_item_verification_id
left join public.compensation_recognition_policies rp on rp.rule_id=ee.rule_id
left join public.receivable_obligations ro on ro.id=a.receivable_obligation_id
left join public.delivery_verifications dv on dv.id=ro.delivery_verification_id;
notify pgrst,'reload schema';
commit;
