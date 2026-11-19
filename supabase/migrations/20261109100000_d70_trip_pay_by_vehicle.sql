-- D70: trip pay by vehicle. A "PER_TRIP" component can now be tied to one vehicle (the vehicles are named after their kind: Xe điện,
-- Xe cn nhỏ, Xe cn to, Ô tô), so each kind of vehicle has its own price per trip. A trip is still one verified delivery; it is paid
-- by the vehicle it was actually delivered with. A component without a vehicle pays the trips of vehicles that have no price of their own.
-- Forward-only; payslips already closed keep their lines.
begin;

alter table public.payroll_components add column if not exists vehicle_id uuid references public.vehicles(id) on delete restrict;
alter table public.payroll_components drop constraint if exists payroll_components_vehicle_check;
alter table public.payroll_components add constraint payroll_components_vehicle_check
  check (vehicle_id is null or (method = 'PER_TRIP' and employee_id is null));
-- One price per vehicle: two active prices would pay the same trip twice.
create unique index if not exists payroll_components_trip_vehicle_unique on public.payroll_components(branch_id, vehicle_id)
  where vehicle_id is not null and active;

-- Verified deliveries of the person in the period, by the day they were verified, that this kind of component pays:
-- target_vehicle given = trips made with that vehicle; null = trips of vehicles with no price of their own.
create or replace function private.payroll_trips(target_period_id uuid, target_employee_id uuid, target_vehicle uuid) returns bigint
language sql stable security definer set search_path='' as $function$
  select count(*) from public.payroll_periods per
  join public.work_items w on w.branch_id = per.branch_id and w.delivery_id is not null and w.execution_state = 'VERIFIED'
  join public.work_item_verifications v on v.work_item_id = w.id
  join public.work_item_results r on r.id = v.result_id
  join public.work_item_assignments wa on wa.id = r.assignment_id and wa.work_item_id = w.id
  where per.id = target_period_id and wa.employee_id = target_employee_id
    and (v.verified_at at time zone 'Asia/Ho_Chi_Minh')::date between per.period_start and per.period_end
    and not exists (select 1 from public.earning_events e where e.work_item_verification_id = v.id)
    and case when target_vehicle is not null then wa.vehicle_id = target_vehicle
      else wa.vehicle_id is null or not exists (select 1 from public.payroll_components x where x.branch_id = per.branch_id and x.active
        and x.method = 'PER_TRIP' and x.vehicle_id = wa.vehicle_id) end;
$function$;
revoke all on function private.payroll_trips(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function private.compute_payroll_line(target_period_id uuid, target_employee_id uuid) returns void
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; p public.salary_profiles%rowtype; s public.attendance_settings; a record; ot record; c record;
  work_days numeric; hourly numeric; base numeric := 0; overtime numeric := 0; allowance numeric := 0; bonus numeric := 0; deduction numeric := 0;
  sales bigint := 0; qty numeric; amount numeric; bps integer; details jsonb := '[]'::jsonb; other bigint; manual record; work record;
begin
  select * into per from public.payroll_periods where id = target_period_id;
  select * into p from public.salary_profiles where branch_id = per.branch_id and employee_id = target_employee_id;
  s := private.attendance_settings_of(per.branch_id);
  select count(distinct x.work_date) filter (where x.status = 'WORKED' and x.clock_in_at is not null) worked_days,
    count(*) filter (where x.status = 'WORKED' and x.clock_in_at is not null) shifts,
    count(distinct x.work_date) filter (where x.status = 'LEAVE_PAID') paid_leave,
    count(distinct x.work_date) filter (where x.status in ('LEAVE_UNPAID','ABSENT')) unpaid,
    coalesce(sum(x.worked_minutes), 0) worked, coalesce(sum(x.overtime_minutes), 0) overtime,
    count(*) filter (where x.late_minutes > 0) late_count, coalesce(sum(x.late_minutes + x.early_minutes), 0) late_early
  into a from public.attendance_records x
  where x.branch_id = per.branch_id and x.employee_id = target_employee_id and x.work_date between per.period_start and per.period_end;
  select coalesce(sum(x.overtime_minutes) filter (where h.id is not null), 0) holiday,
    coalesce(sum(x.overtime_minutes) filter (where h.id is null and extract(isodow from x.work_date)::integer = p.rest_weekday), 0) restday,
    coalesce(sum(x.overtime_minutes) filter (where h.id is null and extract(isodow from x.work_date)::integer <> p.rest_weekday), 0) weekday
  into ot from public.attendance_records x
  left join public.payroll_holidays h on h.branch_id = x.branch_id and h.holiday_date = x.work_date and h.active
  where x.branch_id = per.branch_id and x.employee_id = target_employee_id and x.work_date between per.period_start and per.period_end;
  work_days := a.worked_days + a.paid_leave;
  base := case p.pay_basis
    when 'MONTHLY_WORKDAYS' then p.base_rate_vnd * work_days / s.standard_work_days
    when 'PER_SHIFT' then p.base_rate_vnd * (a.shifts + a.paid_leave)
    when 'PER_HOUR' then p.base_rate_vnd * greatest(a.worked - a.overtime, 0) / 60.0
    else p.base_rate_vnd end;
  hourly := coalesce(p.overtime_hourly_vnd, case p.pay_basis when 'PER_HOUR' then p.base_rate_vnd when 'PER_SHIFT' then p.base_rate_vnd / 8.0
    else p.base_rate_vnd / s.standard_work_days / 8.0 end);
  if p.overtime_enabled then
    overtime := hourly * (ot.weekday * p.overtime_weekday_pct + ot.restday * p.overtime_restday_pct + ot.holiday * p.overtime_holiday_pct) / 100.0 / 60.0;
  end if;
  -- Verified trips / jobs of the person in the period (by the day they were verified); work that already earned by an old
  -- rule (before D35) is paid by that earning, never again here.
  select count(*) filter (where w.delivery_id is not null) trips, count(*) filter (where w.service_job_id is not null) jobs into work
  from public.work_item_verifications v join public.work_items w on w.id = v.work_item_id and w.execution_state = 'VERIFIED'
  join public.work_item_results r on r.id = v.result_id join public.work_item_assignments wa on wa.id = r.assignment_id and wa.work_item_id = w.id
  where w.branch_id = per.branch_id and wa.employee_id = target_employee_id
    and (v.verified_at at time zone 'Asia/Ho_Chi_Minh')::date between per.period_start and per.period_end
    and not exists (select 1 from public.earning_events e where e.work_item_verification_id = v.id);
  if exists (select 1 from public.payroll_components x where x.branch_id = per.branch_id and x.active and x.method = 'SALES_TIERS'
      and (x.employee_id is null or x.employee_id = target_employee_id)) then
    select coalesce(sum(re.amount_vnd), 0) into sales from public.revenue_entries re join public.sales_orders o on o.id = re.sales_order_id
    where re.branch_id = per.branch_id and o.sales_owner_employee_id = target_employee_id
      and (re.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date between per.period_start and per.period_end
      -- Orders whose commission was already posted by an old rule are not paid again.
      and not exists (select 1 from public.earning_events e where e.sales_order_id = o.id and e.employee_id = target_employee_id);
  end if;
  for c in select * from public.payroll_components x where x.branch_id = per.branch_id and x.active
      and (x.employee_id is null or x.employee_id = target_employee_id) order by x.kind, x.code loop
    bps := null;
    qty := case c.method when 'FIXED_PER_PERIOD' then 1 when 'PER_WORKDAY' then work_days when 'PER_LATE' then a.late_count
      when 'PER_LATE_MINUTE' then a.late_early when 'PER_UNPAID_DAY' then a.unpaid
      when 'PER_TRIP' then private.payroll_trips(per.id, target_employee_id, c.vehicle_id) when 'PER_JOB' then work.jobs else sales end;
    if c.method = 'SALES_TIERS' then
      select (t->>'rate_bps')::integer into bps from jsonb_array_elements(c.tiers) t
        where (t->>'from_vnd')::numeric <= sales order by (t->>'from_vnd')::numeric desc limit 1;
      amount := sales * coalesce(bps, 0) / 10000.0;
    else
      amount := c.amount_vnd * qty;
    end if;
    amount := round(amount);
    continue when amount = 0;
    if c.kind = 'ALLOWANCE' then allowance := allowance + amount; elsif c.kind = 'BONUS' then bonus := bonus + amount; else deduction := deduction + amount; end if;
    details := details || jsonb_build_array(jsonb_build_object('code', c.code, 'name', c.name, 'kind', c.kind, 'method', c.method,
      'quantity', qty, 'rate_bps', bps, 'amount_vnd', amount::bigint::text, 'vehicle_id', c.vehicle_id,
      'vehicle_name', (select v.code from public.vehicles v where v.id = c.vehicle_id)));
  end loop;
  -- Earnings posted outside the payroll (old trip / job / commission rules, hand-entered): shown, never paid again.
  select coalesce(sum(e.approved_amount_vnd), 0) into other from public.earning_events e
  where e.branch_id = per.branch_id and e.employee_id = target_employee_id and e.approval_state = 'APPROVED' and e.source_key not like 'PAYROLL:%'
    and (e.approved_at at time zone 'Asia/Ho_Chi_Minh')::date between per.period_start and per.period_end;
  insert into public.payroll_lines(payroll_period_id, branch_id, employee_id, included, pay_basis, base_rate_vnd, standard_work_days, work_days,
    worked_shifts, paid_leave_days, unpaid_days, worked_minutes, overtime_minutes, late_count, late_early_minutes, sales_revenue_vnd,
    base_amount_vnd, overtime_amount_vnd, allowance_vnd, bonus_vnd, deduction_vnd, net_pay_vnd, other_earnings_vnd, details)
  values (per.id, per.branch_id, target_employee_id, true, p.pay_basis, p.base_rate_vnd, s.standard_work_days, work_days,
    a.shifts, a.paid_leave, a.unpaid, a.worked, a.overtime, a.late_count, a.late_early, sales,
    round(base), round(overtime), allowance, bonus, deduction, round(base) + round(overtime) + allowance + bonus - deduction, other, details)
  on conflict (payroll_period_id, employee_id) do update set included = true, pay_basis = excluded.pay_basis, base_rate_vnd = excluded.base_rate_vnd,
    standard_work_days = excluded.standard_work_days, work_days = excluded.work_days, worked_shifts = excluded.worked_shifts,
    paid_leave_days = excluded.paid_leave_days, unpaid_days = excluded.unpaid_days, worked_minutes = excluded.worked_minutes,
    overtime_minutes = excluded.overtime_minutes, late_count = excluded.late_count, late_early_minutes = excluded.late_early_minutes,
    sales_revenue_vnd = excluded.sales_revenue_vnd, base_amount_vnd = excluded.base_amount_vnd, overtime_amount_vnd = excluded.overtime_amount_vnd,
    allowance_vnd = excluded.allowance_vnd, bonus_vnd = excluded.bonus_vnd, deduction_vnd = excluded.deduction_vnd,
    net_pay_vnd = excluded.net_pay_vnd + public.payroll_lines.manual_bonus_vnd - public.payroll_lines.manual_deduction_vnd,
    other_earnings_vnd = excluded.other_earnings_vnd, details = excluded.details, version = public.payroll_lines.version + 1, updated_at = now();
end $function$;
revoke all on function private.compute_payroll_line(uuid, uuid) from public, anon, authenticated, service_role;

drop function if exists public.save_payroll_component(uuid, uuid, text, text, text, text, bigint, jsonb, uuid, boolean, uuid);
create or replace function public.save_payroll_component(target_branch_id uuid, target_component_id uuid, component_code text, component_name text,
  component_kind text, component_method text, amount bigint, component_tiers jsonb, target_employee_id uuid, is_active boolean, operation_id uuid,
  component_vehicle_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; component_id uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_payroll_component.operation_id, 'save_payroll_component',
    jsonb_build_array(target_branch_id, target_component_id, component_code, component_name, component_kind, component_method, amount, component_tiers, target_employee_id, is_active, component_vehicle_id));
  if r.replay is not null then return r.replay; end if;
  if component_kind not in ('ALLOWANCE','BONUS','DEDUCTION')
    or component_method not in ('FIXED_PER_PERIOD','PER_WORKDAY','PER_LATE','PER_LATE_MINUTE','PER_UNPAID_DAY','SALES_TIERS','PER_TRIP','PER_JOB')
    or (component_method = 'SALES_TIERS') <> (component_tiers is not null)
    or (component_method <> 'SALES_TIERS' and coalesce(amount, 0) <= 0)
    or (component_vehicle_id is not null and (component_method <> 'PER_TRIP' or target_employee_id is not null))
    or (component_tiers is not null and (jsonb_typeof(component_tiers) <> 'array' or jsonb_array_length(component_tiers) not between 1 and 10
      or exists (select 1 from jsonb_array_elements(component_tiers) t where jsonb_typeof(t->'from_vnd') is null
        or (t->>'from_vnd') !~ '^[0-9]{1,15}$' or (t->>'rate_bps') !~ '^[0-9]{1,5}$' or (t->>'rate_bps')::integer > 10000))) then
    raise exception 'invalid_payroll_component' using errcode='22023'; end if;
  if target_employee_id is not null and not exists (select 1 from public.employee_branch_access a where a.employee_id = target_employee_id and a.branch_id = target_branch_id) then
    raise exception 'employee_not_in_branch' using errcode='22023'; end if;
  if component_vehicle_id is not null and not exists (select 1 from public.vehicles v where v.id = component_vehicle_id and v.branch_id = target_branch_id) then
    raise exception 'invalid_payroll_component' using errcode='22023'; end if;
  if target_component_id is null then
    insert into public.payroll_components(branch_id, code, name, kind, method, amount_vnd, tiers, employee_id, vehicle_id, active, created_by)
    values (target_branch_id, upper(trim(component_code)), trim(component_name), component_kind, component_method,
      case when component_method = 'SALES_TIERS' then null else amount end, component_tiers, target_employee_id, component_vehicle_id,
      coalesce(is_active, true), auth.uid())
    returning id into component_id;
  else
    update public.payroll_components set code = upper(trim(component_code)), name = trim(component_name), kind = component_kind, method = component_method,
      amount_vnd = case when component_method = 'SALES_TIERS' then null else amount end, tiers = component_tiers, employee_id = target_employee_id,
      vehicle_id = component_vehicle_id, active = coalesce(is_active, true), version = version + 1
    where id = target_component_id and branch_id = target_branch_id returning id into component_id;
    if component_id is null then raise exception 'payroll_component_not_found' using errcode='P0002'; end if;
  end if;
  insert into public.command_receipts values (save_payroll_component.operation_id, auth.uid(), 'save_payroll_component', r.hash, 'payroll_component', component_id, now());
  return component_id;
end $function$;
revoke all on function public.save_payroll_component(uuid, uuid, text, text, text, text, bigint, jsonb, uuid, boolean, uuid, uuid) from public, anon;
grant execute on function public.save_payroll_component(uuid, uuid, text, text, text, text, bigint, jsonb, uuid, boolean, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
