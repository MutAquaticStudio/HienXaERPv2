-- D76: pay of the people who deliver / do the work by a rate per unit of what they delivered or did ("Theo đơn giá công việc").
--  * transport_pay_rates: a price per unit of a material AS SOLD (the order's unit: bao, viên, kg, cây, khối, xe…), what the deliverer earns for
--    each unit delivered. Not shown to customers.
--  * service_pay_rates: what the worker earns per unit of a service type (compensable quantity) or a share of its billed amount.
--  * payroll_components.method WORK_RATE: one active component per branch; the payslip pays, for the verified deliveries the person delivered
--    (current assignment) and the verified service jobs they did in the period, quantity × rate. Goods or services without a rate pay nothing and are
--    listed on the payslip ("chưa có đơn giá") instead of being guessed.
-- Deliveries are read from the verified delivery itself (not from the worker's work item), so deliveries entered by the office are paid too.
-- Forward-only; payslips already closed keep their lines.
begin;

-- ===== rates =====
create table public.transport_pay_rates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  rate_vnd bigint not null check (rate_vnd > 0),
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, material_id, uom_id)
);
create table public.service_pay_rates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  service_type_id uuid not null unique references public.service_types(id) on delete restrict,
  rate_vnd bigint check (rate_vnd > 0),
  rate_bps integer check (rate_bps between 1 and 10000),
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(rate_vnd, rate_bps) = 1)
);
alter table public.transport_pay_rates enable row level security;
alter table public.service_pay_rates enable row level security;
create policy transport_pay_rates_read on public.transport_pay_rates for select to authenticated using (private.has_permission(branch_id, 'compensation.read'));
create policy service_pay_rates_read on public.service_pay_rates for select to authenticated using (private.has_permission(branch_id, 'compensation.read'));
revoke all on public.transport_pay_rates, public.service_pay_rates from anon, public, authenticated;
grant select on public.transport_pay_rates, public.service_pay_rates to authenticated;

-- ===== the new method =====
alter table public.payroll_components drop constraint payroll_components_method_check;
alter table public.payroll_components add constraint payroll_components_method_check
  check (method in ('FIXED_PER_PERIOD','PER_WORKDAY','PER_LATE','PER_LATE_MINUTE','PER_UNPAID_DAY','SALES_TIERS','PER_TRIP','PER_JOB','WORK_RATE'));
do $drop$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.payroll_components'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%amount_vnd IS NOT NULL%' and pg_get_constraintdef(oid) ilike '%SALES_TIERS%' loop
    execute format('alter table public.payroll_components drop constraint %I', c.conname);
  end loop;
end $drop$;
alter table public.payroll_components add constraint payroll_components_amount_check check (method in ('SALES_TIERS', 'WORK_RATE') or amount_vnd is not null);
alter table public.payroll_components add constraint payroll_components_work_rate_check
  check (method <> 'WORK_RATE' or (amount_vnd is null and tiers is null and employee_id is null and vehicle_id is null and kind in ('ALLOWANCE', 'BONUS')));
-- One such component per branch: two would pay the same work twice.
create unique index payroll_components_work_rate_unique on public.payroll_components(branch_id) where method = 'WORK_RATE' and active;

-- ===== what the person earned by the rates in a period =====
create or replace function private.payroll_work_rates(target_period_id uuid, target_employee_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; goods jsonb; goods_open jsonb; goods_total numeric; svc jsonb; svc_open jsonb; svc_total numeric;
begin
  select * into per from public.payroll_periods where id = target_period_id;
  -- Goods: what was accepted on the verified deliveries the person delivers (current assignment), in the unit the order sold it in.
  with delivered as (
    select dl.material_id, sol.ordered_uom_id as uom_id, sum(dvl.accepted_base_quantity * dl.conversion_denominator / dl.conversion_numerator) as qty
    from public.delivery_verifications dv
    join public.deliveries d on d.id = dv.delivery_id and d.branch_id = per.branch_id
    join public.delivery_assignments a on a.delivery_id = d.id and a.superseded_at is null and a.employee_id = target_employee_id
    join public.delivery_verification_lines dvl on dvl.delivery_verification_id = dv.id
    join public.delivery_lines dl on dl.id = dvl.delivery_line_id
    join public.sales_order_lines sol on sol.id = dl.sales_order_line_id
    where (dv.verified_at at time zone 'Asia/Ho_Chi_Minh')::date between per.period_start and per.period_end
      -- Work already paid by an old rule (before D35) is never paid again.
      and not exists (select 1 from public.work_items w join public.work_item_verifications v on v.work_item_id = w.id
        join public.earning_events e on e.work_item_verification_id = v.id where w.delivery_id = d.id)
    group by dl.material_id, sol.ordered_uom_id
    having sum(dvl.accepted_base_quantity) > 0
  ), priced as (
    select m.name as label, u.symbol as uom, round(x.qty, 6) as qty, t.rate_vnd, round(round(x.qty, 6) * t.rate_vnd) as amount
    from delivered x join public.materials m on m.id = x.material_id join public.units_of_measure u on u.id = x.uom_id
    left join public.transport_pay_rates t on t.branch_id = per.branch_id and t.material_id = x.material_id and t.uom_id = x.uom_id and t.active
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', 'GOODS', 'label', label, 'uom', uom, 'quantity', trim_scale(qty)::text, 'rate_vnd', rate_vnd::text,
           'amount_vnd', amount::bigint::text) order by label, uom) filter (where rate_vnd is not null), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('kind', 'GOODS', 'label', label, 'uom', uom, 'quantity', trim_scale(qty)::text) order by label, uom) filter (where rate_vnd is null), '[]'::jsonb),
         coalesce(sum(amount) filter (where rate_vnd is not null), 0)
  into goods, goods_open, goods_total from priced;
  -- Services: the compensable quantity of the verified jobs the person did, by the rate of the job's type.
  with done as (
    select coalesce(st.name, 'Dịch vụ khác') as label, coalesce(st.unit_label, j.unit_label) as uom, sum(sv.compensable_quantity) as qty, sum(sv.billable_amount_vnd) as billed,
      sp.rate_vnd, sp.rate_bps
    from public.work_items w
    join public.work_item_verifications v on v.work_item_id = w.id
    join public.work_item_results r on r.id = v.result_id
    join public.work_item_assignments wa on wa.id = r.assignment_id and wa.work_item_id = w.id
    join public.service_verifications sv on sv.work_item_id = w.id
    join public.service_jobs j on j.id = sv.service_job_id
    left join public.service_types st on st.id = j.service_type_id
    left join public.service_pay_rates sp on sp.service_type_id = j.service_type_id and sp.active
    where w.branch_id = per.branch_id and w.execution_state = 'VERIFIED' and w.service_job_id is not null and wa.employee_id = target_employee_id
      and (v.verified_at at time zone 'Asia/Ho_Chi_Minh')::date between per.period_start and per.period_end
      and not exists (select 1 from public.earning_events e where e.work_item_verification_id = v.id)
    group by st.name, st.unit_label, j.unit_label, sp.rate_vnd, sp.rate_bps
  ), priced as (
    select label, uom, round(qty, 6) as qty, rate_vnd, rate_bps,
      case when rate_vnd is not null then round(round(qty, 6) * rate_vnd) when rate_bps is not null then round(billed * rate_bps / 10000.0) end as amount
    from done
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', 'SERVICE', 'label', label, 'uom', uom, 'quantity', trim_scale(qty)::text, 'rate_vnd', rate_vnd::text,
           'rate_bps', rate_bps, 'amount_vnd', amount::bigint::text) order by label, uom) filter (where amount is not null), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('kind', 'SERVICE', 'label', label, 'uom', uom, 'quantity', trim_scale(qty)::text) order by label, uom) filter (where amount is null), '[]'::jsonb),
         coalesce(sum(amount), 0)
  into svc, svc_open, svc_total from priced;
  return jsonb_build_object('total', (goods_total + svc_total)::bigint, 'items', goods || svc, 'unpriced', goods_open || svc_open);
end $function$;
revoke all on function private.payroll_work_rates(uuid, uuid) from public, anon, authenticated, service_role;

-- ===== the payslip line (D70 version plus WORK_RATE) =====
create or replace function private.compute_payroll_line(target_period_id uuid, target_employee_id uuid) returns void
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; p public.salary_profiles%rowtype; s public.attendance_settings; a record; ot record; c record;
  work_days numeric; hourly numeric; base numeric := 0; overtime numeric := 0; allowance numeric := 0; bonus numeric := 0; deduction numeric := 0;
  sales bigint := 0; qty numeric; amount numeric; bps integer; details jsonb := '[]'::jsonb; other bigint; manual record; work record; wr jsonb;
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
    bps := null; wr := null;
    qty := case c.method when 'FIXED_PER_PERIOD' then 1 when 'PER_WORKDAY' then work_days when 'PER_LATE' then a.late_count
      when 'PER_LATE_MINUTE' then a.late_early when 'PER_UNPAID_DAY' then a.unpaid
      when 'PER_TRIP' then private.payroll_trips(per.id, target_employee_id, c.vehicle_id) when 'PER_JOB' then work.jobs else sales end;
    if c.method = 'SALES_TIERS' then
      select (t->>'rate_bps')::integer into bps from jsonb_array_elements(c.tiers) t
        where (t->>'from_vnd')::numeric <= sales order by (t->>'from_vnd')::numeric desc limit 1;
      amount := sales * coalesce(bps, 0) / 10000.0;
    elsif c.method = 'WORK_RATE' then
      wr := private.payroll_work_rates(per.id, target_employee_id);
      amount := (wr->>'total')::numeric;
      qty := jsonb_array_length(wr->'items');
    else
      amount := c.amount_vnd * qty;
    end if;
    amount := round(amount);
    -- Work without a rate is kept on the payslip even when nothing else was earned, so nobody is paid zero without knowing why.
    continue when amount = 0 and not (c.method = 'WORK_RATE' and jsonb_array_length(wr->'unpriced') > 0);
    if c.kind = 'ALLOWANCE' then allowance := allowance + amount; elsif c.kind = 'BONUS' then bonus := bonus + amount; else deduction := deduction + amount; end if;
    details := details || jsonb_build_array(jsonb_build_object('code', c.code, 'name', c.name, 'kind', c.kind, 'method', c.method,
      'quantity', qty, 'rate_bps', bps, 'amount_vnd', amount::bigint::text, 'vehicle_id', c.vehicle_id,
      'vehicle_name', (select v.code from public.vehicles v where v.id = c.vehicle_id))
      || case when c.method = 'WORK_RATE' then jsonb_build_object('items', wr->'items', 'unpriced', wr->'unpriced') else '{}'::jsonb end);
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

-- ===== the component command (D70 version plus WORK_RATE: no amount, everyone, one per branch) =====
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
    or component_method not in ('FIXED_PER_PERIOD','PER_WORKDAY','PER_LATE','PER_LATE_MINUTE','PER_UNPAID_DAY','SALES_TIERS','PER_TRIP','PER_JOB','WORK_RATE')
    or (component_method = 'SALES_TIERS') <> (component_tiers is not null)
    or (component_method not in ('SALES_TIERS', 'WORK_RATE') and coalesce(amount, 0) <= 0)
    or (component_method = 'WORK_RATE' and (component_kind = 'DEDUCTION' or component_tiers is not null or target_employee_id is not null or component_vehicle_id is not null))
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
      case when component_method in ('SALES_TIERS', 'WORK_RATE') then null else amount end, component_tiers, target_employee_id, component_vehicle_id,
      coalesce(is_active, true), auth.uid())
    returning id into component_id;
  else
    update public.payroll_components set code = upper(trim(component_code)), name = trim(component_name), kind = component_kind, method = component_method,
      amount_vnd = case when component_method in ('SALES_TIERS', 'WORK_RATE') then null else amount end, tiers = component_tiers, employee_id = target_employee_id,
      vehicle_id = component_vehicle_id, active = coalesce(is_active, true), version = version + 1
    where id = target_component_id and branch_id = target_branch_id returning id into component_id;
    if component_id is null then raise exception 'payroll_component_not_found' using errcode='P0002'; end if;
  end if;
  insert into public.command_receipts values (save_payroll_component.operation_id, auth.uid(), 'save_payroll_component', r.hash, 'payroll_component', component_id, now());
  return component_id;
end $function$;
revoke all on function public.save_payroll_component(uuid, uuid, text, text, text, text, bigint, jsonb, uuid, boolean, uuid, uuid) from public, anon;
grant execute on function public.save_payroll_component(uuid, uuid, text, text, text, text, bigint, jsonb, uuid, boolean, uuid, uuid) to authenticated;

-- ===== the rate commands =====
-- A price per unit of a material as sold: the unit must be the material's base unit or one it converts from.
create or replace function public.save_transport_pay_rate(target_branch_id uuid, target_material_id uuid, target_uom_id uuid, rate bigint, is_active boolean, operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r record; rate_id uuid; base uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_transport_pay_rate.operation_id, 'save_transport_pay_rate',
    jsonb_build_array(target_branch_id, target_material_id, target_uom_id, rate, is_active));
  if r.replay is not null then return r.replay; end if;
  select m.base_uom_id into base from public.materials m where m.id = target_material_id and m.active;
  if base is null or rate is null or rate <= 0 or rate > 1000000000
    or (target_uom_id <> base and not exists (select 1 from public.material_uom_conversions c where c.material_id = target_material_id
      and c.from_uom_id = target_uom_id and c.to_uom_id = base and c.active)) then
    raise exception 'invalid_work_rate' using errcode='22023'; end if;
  insert into public.transport_pay_rates(branch_id, material_id, uom_id, rate_vnd, active, created_by)
  values (target_branch_id, target_material_id, target_uom_id, rate, coalesce(is_active, true), auth.uid())
  on conflict (branch_id, material_id, uom_id) do update set rate_vnd = excluded.rate_vnd, active = excluded.active,
    version = public.transport_pay_rates.version + 1, updated_at = now()
  returning id into rate_id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), target_branch_id, 'payroll.transport_rate.saved', 'transport_pay_rate', rate_id, save_transport_pay_rate.operation_id, array['rate_vnd', 'active']);
  insert into public.command_receipts values (save_transport_pay_rate.operation_id, auth.uid(), 'save_transport_pay_rate', r.hash, 'transport_pay_rate', rate_id, now());
  return rate_id;
end $function$;
revoke all on function public.save_transport_pay_rate(uuid, uuid, uuid, bigint, boolean, uuid) from public, anon;
grant execute on function public.save_transport_pay_rate(uuid, uuid, uuid, bigint, boolean, uuid) to authenticated;

-- What a worker earns per unit of a service type (amount) or as a share of what the job was billed (percent × 100 = basis points); exactly one of the two.
create or replace function public.save_service_pay_rate(target_branch_id uuid, target_service_type_id uuid, rate bigint, rate_percent_bps integer, is_active boolean, operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r record; rate_id uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_service_pay_rate.operation_id, 'save_service_pay_rate',
    jsonb_build_array(target_branch_id, target_service_type_id, rate, rate_percent_bps, is_active));
  if r.replay is not null then return r.replay; end if;
  if not exists (select 1 from public.service_types t where t.id = target_service_type_id and t.branch_id = target_branch_id)
    or num_nonnulls(rate, rate_percent_bps) <> 1 or (rate is not null and (rate <= 0 or rate > 1000000000))
    or (rate_percent_bps is not null and rate_percent_bps not between 1 and 10000) then
    raise exception 'invalid_work_rate' using errcode='22023'; end if;
  insert into public.service_pay_rates(branch_id, service_type_id, rate_vnd, rate_bps, active, created_by)
  values (target_branch_id, target_service_type_id, rate, rate_percent_bps, coalesce(is_active, true), auth.uid())
  on conflict (service_type_id) do update set rate_vnd = excluded.rate_vnd, rate_bps = excluded.rate_bps, active = excluded.active,
    version = public.service_pay_rates.version + 1, updated_at = now()
  returning id into rate_id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), target_branch_id, 'payroll.service_rate.saved', 'service_pay_rate', rate_id, save_service_pay_rate.operation_id, array['rate_vnd', 'rate_bps', 'active']);
  insert into public.command_receipts values (save_service_pay_rate.operation_id, auth.uid(), 'save_service_pay_rate', r.hash, 'service_pay_rate', rate_id, now());
  return rate_id;
end $function$;
revoke all on function public.save_service_pay_rate(uuid, uuid, bigint, integer, boolean, uuid) from public, anon;
grant execute on function public.save_service_pay_rate(uuid, uuid, bigint, integer, boolean, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
