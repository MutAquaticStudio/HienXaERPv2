-- FB13 (D35): the payslip calculates trip pay (PER_TRIP: each verified delivery of the person in the period) and job pay
-- (PER_JOB: each verified service job), and leaves out work and orders already paid by an earning of an old rule.
begin;

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
      when 'PER_TRIP' then work.trips when 'PER_JOB' then work.jobs else sales end;
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
      'quantity', qty, 'rate_bps', bps, 'amount_vnd', amount::bigint::text));
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

commit;
