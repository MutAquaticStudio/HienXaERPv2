-- FB13 (D35): pay rules move into "Bảng lương". Trip pay ("Theo chuyến"), job pay ("Theo việc") and sales commission are now
-- "thu nhập khác" of the payroll (payroll_components PER_TRIP / PER_JOB / SALES_TIERS), calculated from the verified work of
-- the period and paid with the payslip. Verified work and customer payments no longer post earnings of their own: the
-- trigger on verified work is dropped and post_recognized_earning only keeps reversing commissions posted before (their
-- payables stay owed and payable). A person paid only by trips can have a salary of 0.
begin;

drop trigger if exists verified_work_earning on public.work_items;

create or replace function private.post_recognized_earning(target_rule uuid, source_key text, work_verification uuid,
  sales_order uuid, allocation uuid, basis_amount bigint, amount bigint, source_actor uuid, reversed_earning uuid default null)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r public.compensation_rules%rowtype; p public.compensation_recognition_policies%rowtype;
  original public.earning_events%rowtype; event_id uuid; payable_id uuid; adjustment_id uuid; employee uuid;
begin
  -- D35: rules no longer post new earnings (pay is calculated in Bảng lương); only reversals of old commissions remain.
  if reversed_earning is null then return null; end if;
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

alter table public.payroll_components drop constraint payroll_components_method_check;
alter table public.payroll_components add constraint payroll_components_method_check
  check (method in ('FIXED_PER_PERIOD','PER_WORKDAY','PER_LATE','PER_LATE_MINUTE','PER_UNPAID_DAY','SALES_TIERS','PER_TRIP','PER_JOB'));
alter table public.salary_profiles drop constraint salary_profiles_base_rate_vnd_check;
alter table public.salary_profiles add constraint salary_profiles_base_rate_vnd_check check (base_rate_vnd >= 0);

create or replace function public.save_salary_profile(target_branch_id uuid, target_employee_id uuid, basis text, base_rate bigint,
  overtime boolean, overtime_hourly bigint, weekday_pct integer, restday_pct integer, holiday_pct integer, rest_day integer,
  is_active boolean, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; profile_id uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_salary_profile.operation_id, 'save_salary_profile',
    jsonb_build_array(target_branch_id, target_employee_id, basis, base_rate, overtime, overtime_hourly, weekday_pct, restday_pct, holiday_pct, rest_day, is_active));
  if r.replay is not null then return r.replay; end if;
  if basis not in ('MONTHLY_WORKDAYS','PER_SHIFT','PER_HOUR','FIXED') or coalesce(base_rate, -1) < 0 or coalesce(overtime_hourly, 1) <= 0
    or coalesce(weekday_pct, 150) not between 100 and 1000 or coalesce(restday_pct, 200) not between 100 and 1000
    or coalesce(holiday_pct, 300) not between 100 and 1000 or coalesce(rest_day, 7) not between 1 and 7 then
    raise exception 'invalid_salary_profile' using errcode='22023'; end if;
  if not exists (select 1 from public.employee_branch_access a where a.employee_id = target_employee_id and a.branch_id = target_branch_id) then
    raise exception 'employee_not_in_branch' using errcode='22023'; end if;
  insert into public.salary_profiles(branch_id, employee_id, pay_basis, base_rate_vnd, overtime_enabled, overtime_hourly_vnd, overtime_weekday_pct,
    overtime_restday_pct, overtime_holiday_pct, rest_weekday, active, updated_by)
  values (target_branch_id, target_employee_id, basis, base_rate, coalesce(overtime, true), overtime_hourly, coalesce(weekday_pct, 150),
    coalesce(restday_pct, 200), coalesce(holiday_pct, 300), coalesce(rest_day, 7), coalesce(is_active, true), auth.uid())
  on conflict (branch_id, employee_id) do update set pay_basis = excluded.pay_basis, base_rate_vnd = excluded.base_rate_vnd,
    overtime_enabled = excluded.overtime_enabled, overtime_hourly_vnd = excluded.overtime_hourly_vnd, overtime_weekday_pct = excluded.overtime_weekday_pct,
    overtime_restday_pct = excluded.overtime_restday_pct, overtime_holiday_pct = excluded.overtime_holiday_pct, rest_weekday = excluded.rest_weekday,
    active = excluded.active, version = public.salary_profiles.version + 1, updated_by = auth.uid(), updated_at = now()
  returning id into profile_id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (auth.uid(), target_branch_id, 'payroll.salary_profile_saved', 'salary_profile', profile_id, save_salary_profile.operation_id, array['pay_basis','base_rate_vnd']);
  insert into public.command_receipts values (save_salary_profile.operation_id, auth.uid(), 'save_salary_profile', r.hash, 'salary_profile', profile_id, now());
  return profile_id;
end $function$;

create or replace function public.save_payroll_component(target_branch_id uuid, target_component_id uuid, component_code text, component_name text,
  component_kind text, component_method text, amount bigint, component_tiers jsonb, target_employee_id uuid, is_active boolean, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; component_id uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_payroll_component.operation_id, 'save_payroll_component',
    jsonb_build_array(target_branch_id, target_component_id, component_code, component_name, component_kind, component_method, amount, component_tiers, target_employee_id, is_active));
  if r.replay is not null then return r.replay; end if;
  if component_kind not in ('ALLOWANCE','BONUS','DEDUCTION')
    or component_method not in ('FIXED_PER_PERIOD','PER_WORKDAY','PER_LATE','PER_LATE_MINUTE','PER_UNPAID_DAY','SALES_TIERS','PER_TRIP','PER_JOB')
    or (component_method = 'SALES_TIERS') <> (component_tiers is not null)
    or (component_method <> 'SALES_TIERS' and coalesce(amount, 0) <= 0)
    or (component_tiers is not null and (jsonb_typeof(component_tiers) <> 'array' or jsonb_array_length(component_tiers) not between 1 and 10
      or exists (select 1 from jsonb_array_elements(component_tiers) t where jsonb_typeof(t->'from_vnd') is null
        or (t->>'from_vnd') !~ '^[0-9]{1,15}$' or (t->>'rate_bps') !~ '^[0-9]{1,5}$' or (t->>'rate_bps')::integer > 10000))) then
    raise exception 'invalid_payroll_component' using errcode='22023'; end if;
  if target_employee_id is not null and not exists (select 1 from public.employee_branch_access a where a.employee_id = target_employee_id and a.branch_id = target_branch_id) then
    raise exception 'employee_not_in_branch' using errcode='22023'; end if;
  if target_component_id is null then
    insert into public.payroll_components(branch_id, code, name, kind, method, amount_vnd, tiers, employee_id, active, created_by)
    values (target_branch_id, upper(trim(component_code)), trim(component_name), component_kind, component_method,
      case when component_method = 'SALES_TIERS' then null else amount end, component_tiers, target_employee_id, coalesce(is_active, true), auth.uid())
    returning id into component_id;
  else
    update public.payroll_components set code = upper(trim(component_code)), name = trim(component_name), kind = component_kind, method = component_method,
      amount_vnd = case when component_method = 'SALES_TIERS' then null else amount end, tiers = component_tiers, employee_id = target_employee_id,
      active = coalesce(is_active, true), version = version + 1
    where id = target_component_id and branch_id = target_branch_id returning id into component_id;
    if component_id is null then raise exception 'payroll_component_not_found' using errcode='P0002'; end if;
  end if;
  insert into public.command_receipts values (save_payroll_component.operation_id, auth.uid(), 'save_payroll_component', r.hash, 'payroll_component', component_id, now());
  return component_id;
end $function$;

notify pgrst, 'reload schema';
commit;
