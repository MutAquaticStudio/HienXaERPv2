-- Audit 14/11/2026 of D76 (pay by work rates), forward-only on 20261114100000:
--  * the amount of a line is quantity × rate on the exact quantity (the quantity is still shown with at most 6 decimals);
--  * a transport rate that exists can always be stopped, also after its material or its unit conversion was stopped.
begin;

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
    select m.name as label, u.symbol as uom, round(x.qty, 6) as qty, t.rate_vnd, round(x.qty * t.rate_vnd) as amount
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
      case when rate_vnd is not null then round(qty * rate_vnd) when rate_bps is not null then round(billed * rate_bps / 10000.0) end as amount
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

create or replace function public.save_transport_pay_rate(target_branch_id uuid, target_material_id uuid, target_uom_id uuid, rate bigint, is_active boolean, operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare r record; rate_id uuid; base uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(save_transport_pay_rate.operation_id, 'save_transport_pay_rate',
    jsonb_build_array(target_branch_id, target_material_id, target_uom_id, rate, is_active));
  if r.replay is not null then return r.replay; end if;
  select m.base_uom_id into base from public.materials m where m.id = target_material_id and m.active;
  -- Stopping a rate that exists is always allowed, even after its material or unit was stopped (audit 14/11).
  if rate is null or rate <= 0 or rate > 1000000000 then raise exception 'invalid_work_rate' using errcode='22023'; end if;
  if not (coalesce(is_active, true) = false and exists (select 1 from public.transport_pay_rates t where t.branch_id = target_branch_id
      and t.material_id = target_material_id and t.uom_id = target_uom_id))
    and (base is null or (target_uom_id <> base and not exists (select 1 from public.material_uom_conversions c where c.material_id = target_material_id
      and c.from_uom_id = target_uom_id and c.to_uom_id = base and c.active))) then
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

notify pgrst, 'reload schema';
commit;
