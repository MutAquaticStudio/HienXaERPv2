-- FB12 (D34b): bảng lương commands. Thiết lập lương, thu nhập khác (rules), ngày lễ; lập bảng lương of a period (Tạm tính),
-- tính lại, cộng / trừ tay per person (tạm ứng, thưởng nóng), hủy a draft, chốt. Chốt needs the period's attendance closed,
-- recalculates from it, and posts each person's net pay as an approved earning + payable (source "PAYROLL:<period>"), paid
-- later from "Chi trả" like any earning. Every command is idempotent on its operation id.
begin;

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
  if basis not in ('MONTHLY_WORKDAYS','PER_SHIFT','PER_HOUR','FIXED') or coalesce(base_rate, 0) <= 0 or coalesce(overtime_hourly, 1) <= 0
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
    or component_method not in ('FIXED_PER_PERIOD','PER_WORKDAY','PER_LATE','PER_LATE_MINUTE','PER_UNPAID_DAY','SALES_TIERS')
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

create or replace function public.save_payroll_holiday(target_branch_id uuid, day date, holiday_name text, is_active boolean, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; holiday_id uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_payroll_holiday.operation_id, 'save_payroll_holiday', jsonb_build_array(target_branch_id, day, holiday_name, is_active));
  if r.replay is not null then return r.replay; end if;
  if day is null or char_length(trim(coalesce(holiday_name, ''))) not between 1 and 80 then raise exception 'invalid_holiday' using errcode='22023'; end if;
  insert into public.payroll_holidays(branch_id, holiday_date, name, active, created_by) values (target_branch_id, day, trim(holiday_name), coalesce(is_active, true), auth.uid())
  on conflict (branch_id, holiday_date) do update set name = excluded.name, active = excluded.active
  returning id into holiday_id;
  insert into public.command_receipts values (save_payroll_holiday.operation_id, auth.uid(), 'save_payroll_holiday', r.hash, 'payroll_holiday', holiday_id, now());
  return holiday_id;
end $function$;

-- One person's payslip of a period from the attendance, the salary profile and the "thu nhập khác" rules; the hand-entered
-- bonus / deduction of the line is kept.
create or replace function private.compute_payroll_line(target_period_id uuid, target_employee_id uuid) returns void
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; p public.salary_profiles%rowtype; s public.attendance_settings; a record; ot record; c record;
  work_days numeric; hourly numeric; base numeric := 0; overtime numeric := 0; allowance numeric := 0; bonus numeric := 0; deduction numeric := 0;
  sales bigint := 0; qty numeric; amount numeric; bps integer; details jsonb := '[]'::jsonb; other bigint; manual record;
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
  if exists (select 1 from public.payroll_components x where x.branch_id = per.branch_id and x.active and x.method = 'SALES_TIERS'
      and (x.employee_id is null or x.employee_id = target_employee_id)) then
    select coalesce(sum(re.amount_vnd), 0) into sales from public.revenue_entries re join public.sales_orders o on o.id = re.sales_order_id
    where re.branch_id = per.branch_id and o.sales_owner_employee_id = target_employee_id
      and (re.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date between per.period_start and per.period_end;
  end if;
  for c in select * from public.payroll_components x where x.branch_id = per.branch_id and x.active
      and (x.employee_id is null or x.employee_id = target_employee_id) order by x.kind, x.code loop
    bps := null;
    qty := case c.method when 'FIXED_PER_PERIOD' then 1 when 'PER_WORKDAY' then work_days when 'PER_LATE' then a.late_count
      when 'PER_LATE_MINUTE' then a.late_early when 'PER_UNPAID_DAY' then a.unpaid else sales end;
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
  -- Trip / job earnings and commissions already have their own payables: shown, never paid again.
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

-- Every person of the branch with an active salary profile; a person whose profile was stopped is left out (kept, not included).
create or replace function private.compute_payroll(target_period_id uuid) returns void
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; emp uuid;
begin
  select * into per from public.payroll_periods where id = target_period_id for update;
  for emp in select sp.employee_id from public.salary_profiles sp join public.employees e on e.id = sp.employee_id and e.active
      where sp.branch_id = per.branch_id and sp.active and exists (select 1 from public.employee_branch_access x
        where x.employee_id = sp.employee_id and x.branch_id = per.branch_id and x.active) loop
    perform private.compute_payroll_line(per.id, emp);
  end loop;
  update public.payroll_lines l set included = false, version = version + 1, updated_at = now()
  where l.payroll_period_id = per.id and l.included and not exists (select 1 from public.salary_profiles sp join public.employees e on e.id = sp.employee_id and e.active
    where sp.branch_id = per.branch_id and sp.employee_id = l.employee_id and sp.active
      and exists (select 1 from public.employee_branch_access x where x.employee_id = sp.employee_id and x.branch_id = per.branch_id and x.active));
  update public.payroll_periods set calculated_at = now(), version = version + 1 where id = per.id;
end $function$;
revoke all on function private.compute_payroll(uuid) from public, anon, authenticated, service_role;

create or replace function public.create_payroll(target_branch_id uuid, from_date date, to_date date, payroll_name text, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; period_id uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(create_payroll.operation_id, 'create_payroll', jsonb_build_array(target_branch_id, from_date, to_date, payroll_name));
  if r.replay is not null then return r.replay; end if;
  if from_date is null or to_date is null or to_date < from_date or to_date - from_date > 62 or char_length(trim(coalesce(payroll_name, ''))) not between 1 and 80 then
    raise exception 'invalid_payroll' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payroll:' || target_branch_id::text, 0));
  if exists (select 1 from public.payroll_periods p where p.branch_id = target_branch_id and p.state <> 'CANCELLED'
      and daterange(p.period_start, p.period_end, '[]') && daterange(from_date, to_date, '[]')) then
    raise exception 'payroll_period_overlaps' using errcode='23505'; end if;
  insert into public.payroll_periods(branch_id, code, name, period_start, period_end, created_by)
  values (target_branch_id, 'BL' || to_char(from_date, 'YYMMDD') || '-' || (select count(*) + 1 from public.payroll_periods p where p.branch_id = target_branch_id),
    trim(payroll_name), from_date, to_date, auth.uid())
  returning id into period_id;
  perform private.compute_payroll(period_id);
  insert into public.command_receipts values (create_payroll.operation_id, auth.uid(), 'create_payroll', r.hash, 'payroll_period', period_id, now());
  return period_id;
end $function$;

create or replace function public.recalculate_payroll(target_period_id uuid, expected_version integer, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; r record;
begin
  select * into per from public.payroll_periods where id = target_period_id for update;
  if per.id is null or not private.has_permission(per.branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(recalculate_payroll.operation_id, 'recalculate_payroll', jsonb_build_array(target_period_id, expected_version));
  if r.replay is not null then return r.replay; end if;
  if per.state <> 'DRAFT' then raise exception 'payroll_not_draft' using errcode='55000'; end if;
  if per.version <> expected_version then raise exception 'payroll_version_conflict' using errcode='40001'; end if;
  perform private.compute_payroll(per.id);
  insert into public.command_receipts values (recalculate_payroll.operation_id, auth.uid(), 'recalculate_payroll', r.hash, 'payroll_period', per.id, now());
  return per.id;
end $function$;

-- Cộng / trừ tay on one payslip (thưởng nóng, tạm ứng đã chi…) while the payroll is a draft.
create or replace function public.adjust_payroll_line(target_line_id uuid, bonus bigint, deduction bigint, note text, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare l public.payroll_lines%rowtype; per public.payroll_periods%rowtype; r record;
begin
  select * into l from public.payroll_lines where id = target_line_id for update;
  select * into per from public.payroll_periods where id = l.payroll_period_id for update;
  if l.id is null or not private.has_permission(l.branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(adjust_payroll_line.operation_id, 'adjust_payroll_line', jsonb_build_array(target_line_id, bonus, deduction, note));
  if r.replay is not null then return r.replay; end if;
  if per.state <> 'DRAFT' then raise exception 'payroll_not_draft' using errcode='55000'; end if;
  if coalesce(bonus, 0) < 0 or coalesce(deduction, 0) < 0 or char_length(coalesce(note, '')) > 300 then raise exception 'invalid_payroll' using errcode='22023'; end if;
  update public.payroll_lines set net_pay_vnd = net_pay_vnd - manual_bonus_vnd + manual_deduction_vnd + coalesce(bonus, 0) - coalesce(deduction, 0),
    manual_bonus_vnd = coalesce(bonus, 0), manual_deduction_vnd = coalesce(deduction, 0), manual_note = nullif(trim(note), ''),
    version = version + 1, updated_at = now() where id = l.id;
  update public.payroll_periods set version = version + 1 where id = per.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), l.branch_id, 'payroll.line_adjusted', 'payroll_line', l.id, adjust_payroll_line.operation_id, array['manual_bonus_vnd','manual_deduction_vnd'], nullif(trim(note), ''));
  insert into public.command_receipts values (adjust_payroll_line.operation_id, auth.uid(), 'adjust_payroll_line', r.hash, 'payroll_line', l.id, now());
  return l.id;
end $function$;

create or replace function public.cancel_payroll(target_period_id uuid, expected_version integer, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; r record;
begin
  select * into per from public.payroll_periods where id = target_period_id for update;
  if per.id is null or not private.has_permission(per.branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(cancel_payroll.operation_id, 'cancel_payroll', jsonb_build_array(target_period_id, expected_version));
  if r.replay is not null then return r.replay; end if;
  if per.state <> 'DRAFT' then raise exception 'payroll_not_draft' using errcode='55000'; end if;
  if per.version <> expected_version then raise exception 'payroll_version_conflict' using errcode='40001'; end if;
  update public.payroll_periods set state = 'CANCELLED', version = version + 1 where id = per.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (auth.uid(), per.branch_id, 'payroll.cancelled', 'payroll_period', per.id, cancel_payroll.operation_id, array['state']);
  insert into public.command_receipts values (cancel_payroll.operation_id, auth.uid(), 'cancel_payroll', r.hash, 'payroll_period', per.id, now());
  return per.id;
end $function$;

-- Chốt bảng lương: the attendance of every day of the period must be closed; the payslips are recalculated from it and each
-- positive net pay becomes an approved earning with its payable (due at the end of the period).
create or replace function public.close_payroll(target_period_id uuid, expected_version integer, operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; r record; rule public.compensation_rules%rowtype; l record; basis_id uuid; event_id uuid; payable_id uuid;
  posted integer := 0; total bigint := 0;
begin
  select * into per from public.payroll_periods where id = target_period_id for update;
  if per.id is null or not private.has_permission(per.branch_id, 'compensation.manage') or not private.has_permission(per.branch_id, 'compensation.approve') then
    raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(close_payroll.operation_id, 'close_payroll', jsonb_build_array(target_period_id, expected_version));
  if r.replay is not null then return jsonb_build_object('replayed', true); end if;
  if per.state <> 'DRAFT' then raise exception 'payroll_not_draft' using errcode='55000'; end if;
  if per.version <> expected_version then raise exception 'payroll_version_conflict' using errcode='40001'; end if;
  if exists (select 1 from generate_series(per.period_start, per.period_end, interval '1 day') d
      where not private.attendance_day_locked(per.branch_id, d::date)) then
    raise exception 'payroll_attendance_not_closed' using errcode='55000'; end if;
  perform private.compute_payroll(per.id);
  -- One system rule per branch carries the payroll earnings (rate 1 đ × net pay).
  select * into rule from public.compensation_rules x where x.branch_id = per.branch_id and x.code = 'BANG-LUONG' order by x.version desc limit 1;
  if rule.id is null then
    insert into public.compensation_rules(branch_id, code, name, version, employee_id, earning_type, calculation_kind, rate_vnd_per_unit, classification, effective_from, created_by)
    values (per.branch_id, 'BANG-LUONG', 'Bảng lương (chốt từ chấm công)', 1, null, 'FIXED_MONTHLY', 'FIXED_PER_BASIS', 1, 'OPEX', date '2000-01-01', auth.uid())
    returning * into rule;
  end if;
  for l in select x.*, e.display_name from public.payroll_lines x join public.employees e on e.id = x.employee_id
      where x.payroll_period_id = per.id and x.included and x.net_pay_vnd > 0 and x.earning_event_id is null for update of x loop
    insert into public.compensation_manual_bases(branch_id, employee_id, basis_type, basis_quantity, period_start, period_end, description, recorded_by)
      values (per.branch_id, l.employee_id, 'FIXED_MONTHLY', l.net_pay_vnd, per.period_start, per.period_end, 'Bảng lương ' || per.code || ' · ' || per.name, auth.uid())
      returning id into basis_id;
    insert into public.earning_events(branch_id, employee_id, rule_id, rule_code_snapshot, rule_version_snapshot, earning_type, classification, manual_basis_id,
      source_key, basis_quantity, rate_vnd_per_unit_snapshot, calculated_amount_vnd, created_by, basis_quantity_policy)
      values (per.branch_id, l.employee_id, rule.id, rule.code, rule.version, rule.earning_type, rule.classification, basis_id,
      'PAYROLL:' || per.id::text, l.net_pay_vnd, 1, l.net_pay_vnd, auth.uid(), 'EXACT_SOURCE') returning id into event_id;
    insert into public.payable_obligations(branch_id, employee_id, earning_event_id, original_amount_vnd, due_date, recorded_by)
      values (per.branch_id, l.employee_id, event_id, l.net_pay_vnd, per.period_end, auth.uid()) returning id into payable_id;
    update public.earning_events set approval_state = 'APPROVED', approved_amount_vnd = l.net_pay_vnd, approved_by = auth.uid(), approved_at = now(),
      version = version + 1, payable_obligation_id = payable_id where id = event_id;
    update public.payroll_lines set earning_event_id = event_id where id = l.id;
    posted := posted + 1; total := total + l.net_pay_vnd;
  end loop;
  update public.payroll_periods set state = 'CLOSED', closed_by = auth.uid(), closed_at = now(), version = version + 1 where id = per.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), per.branch_id, 'payroll.closed', 'payroll_period', per.id, close_payroll.operation_id, array['state','earning_events','payables'], per.code || ' · ' || per.name);
  insert into public.command_receipts values (close_payroll.operation_id, auth.uid(), 'close_payroll', r.hash, 'payroll_period', per.id, now());
  return jsonb_build_object('posted', posted, 'total_vnd', total::text);
end $function$;

revoke all on function public.save_salary_profile(uuid, uuid, text, bigint, boolean, bigint, integer, integer, integer, integer, boolean, uuid),
  public.save_payroll_component(uuid, uuid, text, text, text, text, bigint, jsonb, uuid, boolean, uuid), public.save_payroll_holiday(uuid, date, text, boolean, uuid),
  public.create_payroll(uuid, date, date, text, uuid), public.recalculate_payroll(uuid, integer, uuid), public.adjust_payroll_line(uuid, bigint, bigint, text, uuid),
  public.cancel_payroll(uuid, integer, uuid), public.close_payroll(uuid, integer, uuid) from public, anon;
grant execute on function public.save_salary_profile(uuid, uuid, text, bigint, boolean, bigint, integer, integer, integer, integer, boolean, uuid),
  public.save_payroll_component(uuid, uuid, text, text, text, text, bigint, jsonb, uuid, boolean, uuid), public.save_payroll_holiday(uuid, date, text, boolean, uuid),
  public.create_payroll(uuid, date, date, text, uuid), public.recalculate_payroll(uuid, integer, uuid), public.adjust_payroll_line(uuid, bigint, bigint, text, uuid),
  public.cancel_payroll(uuid, integer, uuid), public.close_payroll(uuid, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
