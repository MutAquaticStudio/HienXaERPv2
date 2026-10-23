-- D31 (23/10): a delivery trip earns the worker who drove it by the branch's own pay rule, without a rule per worker.
-- Automatic recognition was only possible for a rule tied to one employee; a rule for every worker (employee left empty,
-- e.g. CHUYEN 30 000 ₫ a trip) could not be approved for it, so finished trips earned nothing.
-- Now such a rule can be approved for "work verified": every delivery job verified after the approval (the worker's own
-- "Đã giao" report or the office verification) earns the assigned worker once. A worker's own rule still comes first;
-- service jobs keep needing a worker's own rule. Approvals stay append-only; a later approved version of a rule for
-- every worker takes over from the earlier one.
begin;

alter table public.compensation_recognition_policies alter column employee_id drop not null,
  add constraint recognition_policy_branch_wide_work_only check (employee_id is not null or recognition_kind = 'WORK_ITEM_VERIFICATION');

create or replace function public.configure_compensation_recognition(target_rule_id uuid, recognition_kind text, effective_at timestamptz, operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r public.compensation_rules%rowtype; p public.compensation_recognition_policies%rowtype;
  h text; receipt public.command_receipts%rowtype;
begin
  select * into r from public.compensation_rules where id=target_rule_id;
  if r.id is null or not private.has_permission(r.branch_id,'compensation.manage')
    or not private.has_permission(r.branch_id,'compensation.approve') then
    raise exception 'forbidden_or_rule_not_found' using errcode='42501';
  end if;
  if (r.employee_id is null and recognition_kind<>'WORK_ITEM_VERIFICATION') or effective_at is null or not isfinite(effective_at)
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
  perform pg_advisory_xact_lock(hashtextextended(r.branch_id::text||':'||coalesce(r.employee_id::text,'*')||':'||recognition_kind,0));
  select * into p from public.compensation_recognition_policies where rule_id=r.id;
  if p.rule_id is not null then
    if p.recognition_kind<>configure_compensation_recognition.recognition_kind or p.effective_at<>configure_compensation_recognition.effective_at then
      raise exception 'recognition_policy_conflict' using errcode='PT409'; end if;
  else
    -- One standing approval per worker; rules for every worker may get a newer version approved.
    if r.employee_id is not null and exists(select 1 from public.compensation_recognition_policies x where x.branch_id=r.branch_id and x.employee_id=r.employee_id and x.recognition_kind=configure_compensation_recognition.recognition_kind) then
      raise exception 'recognition_policy_already_configured' using errcode='PT409'; end if;
    insert into public.compensation_recognition_policies(rule_id,branch_id,employee_id,recognition_kind,effective_at,approved_by)
      values(r.id,r.branch_id,r.employee_id,recognition_kind,effective_at,(select auth.uid()));
    insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
      values((select auth.uid()),r.branch_id,'compensation.recognition.approved','compensation_rule',r.id,operation_id,array['recognition_kind','effective_at']);
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'configure_compensation_recognition',h,'compensation_rule',r.id,now());
  return r.id;
end $function$;

-- The earning goes to the policy's worker or, for a rule for every worker, to the worker assigned to the verified job.
create or replace function private.post_recognized_earning(target_rule uuid, source_key text, work_verification uuid,
  sales_order uuid, allocation uuid, basis_amount bigint, amount bigint, source_actor uuid, reversed_earning uuid default null)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r public.compensation_rules%rowtype; p public.compensation_recognition_policies%rowtype;
  original public.earning_events%rowtype; event_id uuid; payable_id uuid; adjustment_id uuid; employee uuid;
begin
  select * into r from public.compensation_rules where id=target_rule;
  select * into p from public.compensation_recognition_policies where rule_id=r.id;
  employee:=p.employee_id;
  if p.rule_id is not null and employee is null and work_verification is not null then
    select a.employee_id into employee from public.work_item_verifications v
      join public.work_item_results res on res.id=v.result_id
      join public.work_item_assignments a on a.id=res.assignment_id and a.work_item_id=v.work_item_id
      where v.id=work_verification;
  end if;
  if p.rule_id is null or employee is null or source_actor is null or source_actor<>(select auth.uid()) then raise exception 'invalid_recognition_source' using errcode='42501'; end if;
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
  update public.earning_events set approval_state='APPROVED',approved_amount_vnd=amount,approved_by=p.approved_by,
    approved_at=now(),version=version+1,payable_obligation_id=case when amount>0 then payable_id else null end,
    payable_adjustment_id=adjustment_id where id=event_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
    values(source_actor,r.branch_id,'earning.recognized','earning_event',event_id,event_id,array['source_key','calculated_amount_vnd','payable_effect']);
  return event_id;
end $function$;

-- A verified job earns by the worker's own approved rule, else (delivery jobs) by the latest approved rule for every worker.
create or replace function private.recognize_verified_work() returns trigger
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
    where p.branch_id=new.branch_id and p.recognition_kind='WORK_ITEM_VERIFICATION'
      and (p.employee_id=source.employee_id or (p.employee_id is null and new.delivery_id is not null))
      and source.verified_at>=p.effective_at
      and (source.verified_at at time zone 'Asia/Ho_Chi_Minh')::date>=r.effective_from
      and (r.effective_to is null or (source.verified_at at time zone 'Asia/Ho_Chi_Minh')::date<=r.effective_to)
    order by p.employee_id is null, p.effective_at desc limit 1;
  if policy.rule_id is null then return new; end if;
  if source.verified_by<>(select auth.uid()) or not
    ((new.delivery_id is not null and (private.has_permission(new.branch_id,'work.verify')
        -- FB7: a delivery job is verified together with its delivery, also from the worker's own report.
        or exists (select 1 from public.deliveries d where d.id=new.delivery_id and d.execution_state='VERIFIED')))
      or (new.service_job_id is not null and private.has_permission(new.branch_id,'service.verify'))) then
    raise exception 'forbidden_work_recognition' using errcode='42501'; end if;
  amount:=round(policy.rate_vnd_per_unit)::bigint;
  perform private.post_recognized_earning(policy.rule_id,'WORK_ITEM_VERIFICATION:'||source.id::text,source.id,
    null,null,null,amount,source.verified_by);
  return new;
end $function$;

commit;
