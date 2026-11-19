-- D54 (Owner 03/11): xe giao hàng không cần biển số. Biển số thành không bắt buộc; mọi chỗ hiển thị
-- dùng biển số nếu có, nếu không thì dùng mã/tên xe (vd. "Xe điện"). Không đổi dữ liệu xe hiện có.

alter table public.vehicles alter column plate_number drop not null;
alter table public.vehicles add constraint vehicles_plate_number_not_blank check (plate_number is null or btrim(plate_number) <> '');

create or replace view public.vehicle_status_read with (security_barrier=true) as
 SELECT v.branch_id,
    v.id AS vehicle_id,
    v.code,
    COALESCE(v.plate_number, v.code) AS plate_number,
    v.capacity_quantity::text AS capacity_quantity,
    u.symbol AS capacity_symbol,
    busy.delivery_number AS busy_delivery_number,
    busy.execution_state AS busy_state,
    busy.busy_until
   FROM vehicles v
     LEFT JOIN units_of_measure u ON u.id = v.capacity_uom_id
     LEFT JOIN LATERAL ( SELECT d.delivery_number,
            d.execution_state,
            COALESCE(d.scheduled_end_at, d.scheduled_at + make_interval(mins => COALESCE(( SELECT s.stop_minutes
                   FROM branch_operation_settings s
                  WHERE s.branch_id = d.branch_id), 60))) AS busy_until
           FROM delivery_assignments a
             JOIN deliveries d ON d.id = a.delivery_id
          WHERE a.vehicle_id = v.id AND a.superseded_at IS NULL AND (d.execution_state = ANY (ARRAY['ASSIGNED'::text, 'DISPATCHED'::text, 'ARRIVED'::text])) AND ((d.execution_state = ANY (ARRAY['DISPATCHED'::text, 'ARRIVED'::text])) OR (d.scheduled_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text)::date)
          ORDER BY (d.execution_state = ANY (ARRAY['DISPATCHED'::text, 'ARRIVED'::text])) DESC, d.scheduled_at
         LIMIT 1) busy ON true
  WHERE v.active AND private.has_permission(v.branch_id, 'delivery.read'::text);

create or replace view public.work_item_read with (security_invoker=true) as
 SELECT w.id,
    w.branch_id,
    w.work_number,
    w.delivery_id,
    w.service_job_id,
    w.title,
    w.assignment_mode,
    w.execution_state,
    w.scheduled_start,
    w.scheduled_end,
    w.version,
    w.started_at,
    w.completed_at,
    w.last_heartbeat_at,
    w.lease_expires_at,
    a.id AS assignment_id,
    a.employee_id,
    e.display_name AS employee_name,
    a.vehicle_id,
    COALESCE(v.plate_number, v.code) AS plate_number,
    a.machine_id,
    m.name AS machine_name,
    r.id AS result_id,
    r.actual_quantity,
    r.note,
    r.receiver_name,
    r.evidence_object_id
   FROM work_items w
     LEFT JOIN work_item_assignments a ON a.work_item_id = w.id AND a.superseded_at IS NULL
     LEFT JOIN employees e ON e.id = a.employee_id
     LEFT JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN machines m ON m.id = a.machine_id
     LEFT JOIN work_item_results r ON r.work_item_id = w.id;

create or replace view public.service_job_read with (security_invoker=true) as
 SELECT j.id,
    j.branch_id,
    j.job_number,
    j.customer_id,
    c.display_name AS customer_name,
    j.site_id,
    s.name AS site_name,
    j.sales_employee_id,
    j.service_type,
    j.description,
    j.scheduled_start,
    j.scheduled_end,
    j.planned_quantity,
    j.unit_label,
    j.vehicle_id,
    COALESCE(v.plate_number, v.code) AS plate_number,
    j.machine_id,
    m.name AS machine_name,
    j.execution_state,
    j.version,
    w.id AS work_item_id,
    w.work_number,
    w.execution_state AS work_state,
    w.version AS work_version,
    a.employee_id,
    e.display_name AS operator_name,
    l.actual_quantity,
    sv.billable_quantity,
    sv.compensable_quantity,
    sv.billable_amount_vnd,
    sv.id AS service_verification_id,
    ro.id AS receivable_obligation_id
   FROM service_jobs j
     JOIN customers c ON c.id = j.customer_id
     JOIN customer_sites s ON s.id = j.site_id
     LEFT JOIN vehicles v ON v.id = j.vehicle_id
     LEFT JOIN machines m ON m.id = j.machine_id
     LEFT JOIN work_items w ON w.service_job_id = j.id
     LEFT JOIN work_item_assignments a ON a.work_item_id = w.id AND a.superseded_at IS NULL
     LEFT JOIN employees e ON e.id = a.employee_id
     LEFT JOIN service_work_logs l ON l.work_item_id = w.id
     LEFT JOIN service_verifications sv ON sv.service_job_id = j.id
     LEFT JOIN receivable_obligations ro ON ro.service_verification_id = sv.id;

create or replace view public.delivery_expense_assignment_read with (security_barrier=true) as
 SELECT a.id AS assignment_id,
    d.id AS delivery_id,
    d.branch_id,
    d.delivery_number,
    d.execution_state,
    d.version AS delivery_version,
    a.assignment_version,
    a.vehicle_id,
    v.code AS vehicle_code,
    COALESCE(v.plate_number, v.code) AS plate_number,
    a.external_carrier_name,
    h.handed_off_at
   FROM delivery_assignments a
     JOIN deliveries d ON d.id = a.delivery_id
     JOIN delivery_handoffs h ON h.assignment_id = a.id
     LEFT JOIN vehicles v ON v.id = a.vehicle_id
  WHERE private.has_permission(d.branch_id, 'finance.expense.manage'::text);

CREATE OR REPLACE FUNCTION private.dispatch_candidates(target_delivery_id uuid)
 RETURNS TABLE(vehicle_id uuid, vehicle_code text, plate_number text, employee_id uuid, employee_name text, start_at timestamp with time zone, end_at timestamp with time zone, day_count integer, same_site boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.deliveries%rowtype;
  stop interval;
  desired timestamptz;
  v record;
  candidate timestamptz;
  rounds integer;
begin
  select * into d from public.deliveries x where x.id = target_delivery_id;
  if d.id is null then return; end if;
  stop := coalesce(d.scheduled_end_at - d.scheduled_at, private.delivery_stop_interval(d.branch_id));
  if stop <= interval '0' then stop := private.delivery_stop_interval(d.branch_id); end if;
  desired := greatest(coalesce(d.scheduled_at, now()), now());
  for v in
    select x.id, x.code, coalesce(x.plate_number, x.code) as plate_number, e.id as driver, e.display_name
    from public.vehicles x join public.employees e on e.id = x.default_driver_employee_id and e.active
    where x.branch_id = d.branch_id and x.active and x.capacity_verified_at is not null
      and exists (select 1 from public.employee_branch_access a where a.employee_id = e.id and a.branch_id = d.branch_id and a.active)
      and not exists (select 1 from public.delivery_dispatch_exclusions ex where ex.delivery_id = d.id and ex.employee_id = e.id)
  loop
    candidate := desired;
    rounds := 0;
    loop
      candidate := private.within_work_day(d.branch_id, private.next_free_start(d.branch_id, v.driver, v.id, candidate, stop, d.id), stop);
      exit when private.next_free_start(d.branch_id, v.driver, v.id, candidate, stop, d.id) = candidate;
      rounds := rounds + 1;
      exit when rounds > 30;
    end loop;
    vehicle_id := v.id; vehicle_code := v.code; plate_number := v.plate_number; employee_id := v.driver; employee_name := v.display_name;
    start_at := candidate; end_at := candidate + stop;
    select count(*)::int into day_count from public.delivery_assignments a join public.deliveries o on o.id = a.delivery_id
      where a.superseded_at is null and a.employee_id = v.driver and o.id <> d.id and o.execution_state in ('ASSIGNED', 'DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED')
        and (o.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date = (candidate at time zone 'Asia/Ho_Chi_Minh')::date;
    same_site := exists (select 1 from public.delivery_assignments a join public.deliveries o on o.id = a.delivery_id
      where a.superseded_at is null and a.vehicle_id = v.id and o.id <> d.id and o.site_id = d.site_id
        and o.execution_state in ('ASSIGNED', 'DISPATCHED', 'ARRIVED')
        and (o.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date = (candidate at time zone 'Asia/Ho_Chi_Minh')::date);
    return next;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION private.dispatch_pairs(target_delivery_id uuid)
 RETURNS TABLE(vehicle_id uuid, vehicle_code text, plate_number text, employee_id uuid, employee_name text, start_at timestamp with time zone, end_at timestamp with time zone, day_count integer, same_site boolean, default_driver boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.deliveries%rowtype;
  stop interval;
  desired timestamptz;
  v record;
  candidate timestamptz;
  rounds integer;
begin
  select * into d from public.deliveries x where x.id = target_delivery_id;
  if d.id is null then return; end if;
  stop := coalesce(d.scheduled_end_at - d.scheduled_at, private.delivery_stop_interval(d.branch_id));
  if stop <= interval '0' then stop := private.delivery_stop_interval(d.branch_id); end if;
  desired := greatest(coalesce(d.scheduled_at, now()), now());
  for v in
    select x.id, x.code, coalesce(x.plate_number, x.code) as plate_number, e.id as driver, e.display_name, (e.id = x.default_driver_employee_id) as is_default
    from public.vehicles x
    join public.employees e on e.active and e.auth_user_id is not null
    where x.branch_id = d.branch_id and x.active  -- D53: every active vehicle, with or without a capacity
      and private.employee_can_report_work(e.id, d.branch_id)
      -- Office staff who manage roles are not sent on trips unless they are the vehicle's own driver.
      and (e.id = x.default_driver_employee_id or not exists (select 1 from public.employee_branch_access a join public.role_permissions rp on rp.role_id = a.role_id
        where a.employee_id = e.id and a.branch_id = d.branch_id and a.active and rp.permission_code = 'roles.manage'))
      and not exists (select 1 from public.delivery_dispatch_exclusions ex where ex.delivery_id = d.id and ex.employee_id = e.id)
  loop
    candidate := desired;
    rounds := 0;
    loop
      candidate := private.within_work_day(d.branch_id, private.next_free_start(d.branch_id, v.driver, v.id, candidate, stop, d.id), stop);
      exit when private.next_free_start(d.branch_id, v.driver, v.id, candidate, stop, d.id) = candidate;
      rounds := rounds + 1;
      exit when rounds > 30;
    end loop;
    vehicle_id := v.id; vehicle_code := v.code; plate_number := v.plate_number; employee_id := v.driver; employee_name := v.display_name;
    default_driver := v.is_default;
    start_at := candidate; end_at := candidate + stop;
    select count(*)::int into day_count from public.delivery_assignments a join public.deliveries o on o.id = a.delivery_id
      where a.superseded_at is null and a.employee_id = v.driver and o.id <> d.id and o.execution_state in ('ASSIGNED', 'DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED')
        and (o.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date = (candidate at time zone 'Asia/Ho_Chi_Minh')::date;
    same_site := exists (select 1 from public.delivery_assignments a join public.deliveries o on o.id = a.delivery_id
      where a.superseded_at is null and a.vehicle_id = v.id and o.id <> d.id and o.site_id = d.site_id
        and o.execution_state in ('ASSIGNED', 'DISPATCHED', 'ARRIVED')
        and (o.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date = (candidate at time zone 'Asia/Ho_Chi_Minh')::date);
    return next;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_day(target_branch_id uuid, target_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'delivery.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'drivers', coalesce((select jsonb_agg(driver order by driver->>'name') from (
      select jsonb_build_object('employee_id', e.id, 'name', e.display_name,
        'vehicles', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'code', v.code, 'plate', coalesce(v.plate_number, v.code)) order by v.code), '[]'::jsonb)
          from public.vehicles v where v.branch_id = target_branch_id and v.active and v.default_driver_employee_id = e.id),
        'deliveries', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'number', d.delivery_number, 'customer', d.customer_name_snapshot,
            'site', d.site_name_snapshot, 'state', d.execution_state, 'start', d.scheduled_at,
            'end', coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id)), 'vehicle', coalesce(v.plate_number, v.code))
            order by d.scheduled_at), '[]'::jsonb)
          from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id left join public.vehicles v on v.id = a.vehicle_id
          where a.superseded_at is null and a.employee_id = e.id and d.branch_id = target_branch_id
            and d.execution_state in ('ASSIGNED', 'DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED', 'VERIFIED')
            and (d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date = target_day)) as driver
      from public.employees e
      where e.active and (exists (select 1 from public.vehicles v where v.branch_id = target_branch_id and v.active and v.default_driver_employee_id = e.id)
        or exists (select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
          where a.superseded_at is null and a.employee_id = e.id and d.branch_id = target_branch_id
            and (d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date = target_day))) drivers), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'number', d.delivery_number, 'customer', d.customer_name_snapshot,
        'site', d.site_name_snapshot, 'start', d.scheduled_at, 'version', d.version,
        'proposal', (select jsonb_build_object('reason', p.reason, 'start', p.scheduled_start) from public.delivery_dispatch_proposals p where p.delivery_id = d.id),
        'declined', (select string_agg(e.display_name || ': ' || x.reason, '; ') from public.delivery_dispatch_exclusions x join public.employees e on e.id = x.employee_id where x.delivery_id = d.id))
        order by d.scheduled_at nulls first, d.delivery_number)
      from public.deliveries d
      where d.branch_id = target_branch_id and d.execution_state = 'PLANNED'
        and (d.scheduled_at is null or (d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date <= target_day)
        and not exists (select 1 from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null)
        and not exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.source_mode = 'SUPPLIER_DIRECT')), '[]'::jsonb),
    'mode', (private.branch_settings(target_branch_id)).dispatch_mode);
end
$function$;

CREATE OR REPLACE FUNCTION public.gps_fleet_snapshot(target_branch_id uuid)
 RETURNS TABLE(session_id uuid, delivery_id uuid, delivery_number text, vehicle_id uuid, plate_number text, employee_id uuid, employee_name text, latitude numeric, longitude numeric, accuracy_meters numeric, captured_at timestamp with time zone, received_at timestamp with time zone, is_stale boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare stale_seconds integer;
begin
  if not private.has_permission(target_branch_id, 'delivery.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(s.gps_stale_after_seconds, 300) into stale_seconds from public.routing_settings s where s.branch_id = target_branch_id;
  stale_seconds := coalesce(stale_seconds, 300);
  return query
  select s.id, d.id, d.delivery_number, s.vehicle_id, coalesce(v.plate_number, v.code), s.employee_id, e.display_name,
    p.latitude, p.longitude, p.accuracy_meters, p.captured_at, p.received_at,
    p.received_at < now() - make_interval(secs => stale_seconds)
  from public.gps_tracking_sessions s
  join public.deliveries d on d.id = s.delivery_id and d.execution_state in ('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
  join public.delivery_assignments a on a.id = s.assignment_id and a.superseded_at is null and a.assignment_version = s.assignment_version
  join public.vehicles v on v.id = s.vehicle_id
  join public.employees e on e.id = s.employee_id
  join lateral (
    select gp.latitude, gp.longitude, gp.accuracy_meters, gp.captured_at, gp.received_at
    from public.gps_positions gp where gp.session_id = s.id order by gp.sequence desc limit 1
  ) p on true
  where s.branch_id = target_branch_id and s.status = 'ACTIVE'
  order by p.received_at desc, s.id;
end
$function$;

CREATE OR REPLACE FUNCTION public.report_center(target_branch_id uuid, report_key text, from_date date, to_date date, target_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare from_ts timestamptz; to_ts timestamptz; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; result jsonb; permission text;
begin
  if from_date is null or to_date is null or to_date<from_date or to_date-from_date>400 then raise exception 'invalid_report_range' using errcode='22023'; end if;
  permission:=case report_key when 'END_OF_DAY' then 'finance.ar.read' when 'SALES_BY_DAY' then 'orders.read' when 'SALES_BY_CUSTOMER' then 'orders.read'
    when 'SALES_BY_STAFF' then 'orders.read' when 'GOODS_SALES' then 'orders.read' when 'STOCK_IO' then 'inventory.read' when 'CUSTOMER_DEBT' then 'finance.ar.read'
    when 'SUPPLIER' then 'finance.ap.read' when 'DELIVERY' then 'delivery.read' end;
  if permission is null then raise exception 'invalid_report' using errcode='22023'; end if;
  if auth.uid() is null or not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501'; end if;
  from_ts:=from_date::timestamp at time zone 'Asia/Ho_Chi_Minh';
  to_ts:=(to_date+1)::timestamp at time zone 'Asia/Ho_Chi_Minh';

  if report_key in ('SALES_BY_DAY','SALES_BY_CUSTOMER','SALES_BY_STAFF') then
    with sales as (
      select r.recorded_at at_time,o.customer_id,o.sales_owner_employee_id staff,o.id doc,r.amount_vnd amount
        from public.revenue_entries r join public.sales_orders o on o.id=r.sales_order_id
        where r.branch_id=target_branch_id and r.recorded_at>=from_ts and r.recorded_at<to_ts
      union all
      select v.verified_at,j.customer_id,j.sales_employee_id,j.id,v.billable_amount_vnd
        from public.service_verifications v join public.service_jobs j on j.id=v.service_job_id
        where j.branch_id=target_branch_id and v.verified_at>=from_ts and v.verified_at<to_ts and v.billable_amount_vnd>0
    ), grouped as (
      select case report_key when 'SALES_BY_DAY' then to_char(s.at_time at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
          when 'SALES_BY_CUSTOMER' then coalesce(c.display_name,'Khách lẻ') else coalesce(e.display_name,'Chưa gán nhân viên') end label,
        count(distinct s.doc) docs,sum(s.amount)::bigint amount
      from sales s left join public.customers c on c.id=s.customer_id left join public.employees e on e.id=s.staff
      group by 1
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',g.label,'documents',g.docs,'amount_vnd',g.amount::text)
        order by case when report_key='SALES_BY_DAY' then g.label end, g.amount desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Doanh thu','value',coalesce(sum(g.amount),0)::text,'kind','money'),
        jsonb_build_object('label','Số chứng từ','value',coalesce(sum(g.docs),0)::text,'kind','number')))
      into result from grouped g;

  elsif report_key='GOODS_SALES' then
    with lines as (
      select m.id material_id,m.code,m.name,coalesce(u.symbol,'') sold_unit,bu.symbol base_unit,
        sum(vl.accepted_base_quantity) base_qty,
        sum(vl.accepted_base_quantity*sol.conversion_denominator/sol.conversion_numerator) sold_qty,
        sum(vl.receivable_amount_vnd)::bigint amount
      from public.delivery_verification_lines vl
      join public.delivery_verifications dv on dv.id=vl.delivery_verification_id
      join public.delivery_lines dl on dl.id=vl.delivery_line_id
      join public.deliveries d on d.id=dl.delivery_id
      join public.sales_order_lines sol on sol.id=dl.sales_order_line_id
      join public.materials m on m.id=sol.material_id
      left join public.units_of_measure u on u.id=sol.ordered_uom_id
      left join public.units_of_measure bu on bu.id=sol.base_uom_id
      where d.branch_id=target_branch_id and dv.verified_at>=from_ts and dv.verified_at<to_ts and vl.accepted_base_quantity>0
      group by m.id,m.code,m.name,u.symbol,bu.symbol
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',l.name,'code',l.code,'quantity',round(l.sold_qty,3)::text,'unit',l.sold_unit,
        'base_quantity',round(l.base_qty,3)::text,'base_unit',l.base_unit,'amount_vnd',l.amount::text) order by l.amount desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Tiền hàng đã giao','value',coalesce(sum(l.amount),0)::text,'kind','money'),
        jsonb_build_object('label','Số mặt hàng','value',count(*)::text,'kind','number')))
      into result from lines l;

  elsif report_key='STOCK_IO' then
    with moves as (
      select m.material_id,
        sum(m.base_quantity_delta) filter (where m.occurred_at<from_ts) opening,
        sum(m.base_quantity_delta) filter (where m.occurred_at>=from_ts and m.occurred_at<to_ts and m.base_quantity_delta>0) qty_in,
        -sum(m.base_quantity_delta) filter (where m.occurred_at>=from_ts and m.occurred_at<to_ts and m.base_quantity_delta<0) qty_out,
        sum(m.base_quantity_delta) filter (where m.occurred_at<to_ts) closing,
        sum(m.inventory_value_delta_vnd) filter (where m.occurred_at<to_ts) closing_value
      from public.inventory_movements m
      where m.branch_id=target_branch_id and m.location_kind='WAREHOUSE' and (target_warehouse_id is null or m.warehouse_id=target_warehouse_id)
      group by m.material_id
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',mt.name,'code',mt.code,'unit',u.symbol,
        'opening',coalesce(mv.opening,0)::text,'in',coalesce(mv.qty_in,0)::text,'out',coalesce(mv.qty_out,0)::text,'closing',coalesce(mv.closing,0)::text,
        'closing_value_vnd',case when private.has_permission(target_branch_id,'inventory.cost.read') then coalesce(mv.closing_value,0)::bigint::text end)
        order by mt.name),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Mặt hàng có phát sinh','value',count(*) filter (where coalesce(mv.qty_in,0)<>0 or coalesce(mv.qty_out,0)<>0)::text,'kind','number'),
        jsonb_build_object('label','Giá trị tồn cuối kỳ','value',case when private.has_permission(target_branch_id,'inventory.cost.read') then coalesce(sum(mv.closing_value),0)::bigint::text end,'kind','money')))
      into result from moves mv join public.materials mt on mt.id=mv.material_id left join public.units_of_measure u on u.id=mt.base_uom_id
      where coalesce(mv.opening,0)<>0 or coalesce(mv.qty_in,0)<>0 or coalesce(mv.qty_out,0)<>0 or coalesce(mv.closing,0)<>0;

  elsif report_key='CUSTOMER_DEBT' then
    with debts as (
      select r.customer_id,private.current_receivable_outstanding(r.id) outstanding,greatest(today-r.due_date,0) late
      from public.receivable_obligations r where r.branch_id=target_branch_id
    ), grouped as (
      select c.display_name label,c.code,sum(d.outstanding)::bigint total,
        sum(d.outstanding) filter (where d.late=0)::bigint not_due,
        sum(d.outstanding) filter (where d.late between 1 and 30)::bigint d30,
        sum(d.outstanding) filter (where d.late between 31 and 60)::bigint d60,
        sum(d.outstanding) filter (where d.late>60)::bigint d90
      from debts d join public.customers c on c.id=d.customer_id where d.outstanding>0 group by c.id,c.display_name,c.code
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',g.label,'code',g.code,'total_vnd',g.total::text,'not_due_vnd',coalesce(g.not_due,0)::text,
        'd30_vnd',coalesce(g.d30,0)::text,'d60_vnd',coalesce(g.d60,0)::text,'d90_vnd',coalesce(g.d90,0)::text) order by g.total desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Tổng phải thu','value',coalesce(sum(g.total),0)::text,'kind','money'),
        jsonb_build_object('label','Quá hạn trên 60 ngày','value',coalesce(sum(g.d90),0)::text,'kind','money'),
        jsonb_build_object('label','Khách còn nợ','value',count(*)::text,'kind','number')))
      into result from grouped g;

  elsif report_key='SUPPLIER' then
    with received as (
      select p.supplier_id,sum(l.inventory_value_vnd)::bigint value,count(distinct pr.id) receipts
      from public.purchase_receipts pr join public.purchase_receipt_lines l on l.purchase_receipt_id=pr.id join public.purchase_orders p on p.id=pr.purchase_order_id
      where pr.branch_id=target_branch_id and pr.received_at>=from_ts and pr.received_at<to_ts group by p.supplier_id
    ), owed as (
      select o.supplier_id,sum(private.current_payable_outstanding(o.id))::bigint value
      from public.payable_obligations o where o.branch_id=target_branch_id and o.supplier_id is not null group by o.supplier_id
    ), grouped as (
      select s.name label,s.code,coalesce(r.value,0) received,coalesce(r.receipts,0) receipts,coalesce(w.value,0) owed
      from public.suppliers s left join received r on r.supplier_id=s.id left join owed w on w.supplier_id=s.id
      where s.branch_id=target_branch_id and (coalesce(r.value,0)<>0 or coalesce(w.value,0)<>0)
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',g.label,'code',g.code,'documents',g.receipts,'received_vnd',g.received::text,'owed_vnd',g.owed::text)
        order by g.received desc,g.owed desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Tiền hàng nhập','value',coalesce(sum(g.received),0)::text,'kind','money'),
        jsonb_build_object('label','Còn phải trả NCC','value',coalesce(sum(g.owed),0)::text,'kind','money')))
      into result from grouped g;

  elsif report_key='DELIVERY' then
    with trips as (
      select d.id,d.result_kind,a.employee_id,a.vehicle_id
      from public.delivery_verifications dv join public.deliveries d on d.id=dv.delivery_id
      left join public.delivery_assignments a on a.delivery_id=d.id and a.superseded_at is null
      where d.branch_id=target_branch_id and dv.verified_at>=from_ts and dv.verified_at<to_ts
    ), grouped as (
      select coalesce(e.display_name,'Chưa gán thợ') label,coalesce(v.plate_number,v.code,'—') vehicle,count(*) trips,
        count(*) filter (where t.result_kind='PARTIAL') partial,count(*) filter (where t.result_kind='FAILED') failed,
        coalesce((select sum(ee.approved_amount_vnd) from public.earning_events ee join public.work_item_verifications wv on wv.id=ee.work_item_verification_id
          join public.work_items wi on wi.id=wv.work_item_id where wi.delivery_id=any(array_agg(t.id)) and ee.approval_state='APPROVED'),0)::bigint pay
      from trips t left join public.employees e on e.id=t.employee_id left join public.vehicles v on v.id=t.vehicle_id
      group by e.display_name,v.plate_number,v.code
    )
    select jsonb_build_object(
      'rows',coalesce(jsonb_agg(jsonb_build_object('label',g.label,'vehicle',g.vehicle,'documents',g.trips,'partial',g.partial,'failed',g.failed,'pay_vnd',g.pay::text)
        order by g.trips desc),'[]'::jsonb),
      'kpis',jsonb_build_array(jsonb_build_object('label','Chuyến đã xong','value',coalesce(sum(g.trips),0)::text,'kind','number'),
        jsonb_build_object('label','Giao thiếu','value',coalesce(sum(g.partial),0)::text,'kind','number'),
        jsonb_build_object('label','Không giao được','value',coalesce(sum(g.failed),0)::text,'kind','number'),
        jsonb_build_object('label','Tiền chuyến','value',coalesce(sum(g.pay),0)::text,'kind','money')))
      into result from grouped g;

  else -- END_OF_DAY
    select jsonb_build_object(
      'rows',coalesce((select jsonb_agg(jsonb_build_object('label',p.payment_number,'time',p.effective_at,'direction',p.direction,
          'party',coalesce(c.display_name,s.name,e.display_name,'—'),'amount_vnd',p.amount_vnd::text) order by p.effective_at)
        from public.payments p left join public.customers c on c.id=p.customer_id left join public.suppliers s on s.id=p.supplier_id
        left join public.employees e on e.id=p.employee_id
        where p.branch_id=target_branch_id and p.effective_at>=from_ts and p.effective_at<to_ts and p.reversal_of_payment_id is null
          and not exists (select 1 from public.payments x where x.reversal_of_payment_id=p.id)),'[]'::jsonb),
      'kpis',jsonb_build_array(
        jsonb_build_object('label','Tiền thu','value',(select coalesce(sum(p.amount_vnd),0) from public.payments p where p.branch_id=target_branch_id and p.direction='RECEIPT'
          and p.effective_at>=from_ts and p.effective_at<to_ts and p.reversal_of_payment_id is null and not exists (select 1 from public.payments x where x.reversal_of_payment_id=p.id))::text,'kind','money'),
        jsonb_build_object('label','Tiền chi','value',(select coalesce(sum(p.amount_vnd),0) from public.payments p where p.branch_id=target_branch_id and p.direction='DISBURSEMENT'
          and p.effective_at>=from_ts and p.effective_at<to_ts and p.reversal_of_payment_id is null and not exists (select 1 from public.payments x where x.reversal_of_payment_id=p.id))::text,'kind','money'),
        jsonb_build_object('label','Doanh thu giao hàng','value',(select coalesce(sum(r.amount_vnd),0) from public.revenue_entries r where r.branch_id=target_branch_id
          and r.recorded_at>=from_ts and r.recorded_at<to_ts)::text,'kind','money'),
        jsonb_build_object('label','Phiếu giao xong','value',(select count(*) from public.delivery_verifications dv join public.deliveries d on d.id=dv.delivery_id
          where d.branch_id=target_branch_id and dv.verified_at>=from_ts and dv.verified_at<to_ts)::text,'kind','number'),
        jsonb_build_object('label','Phiếu nhập hàng','value',(select count(*) from public.purchase_receipts pr where pr.branch_id=target_branch_id
          and pr.received_at>=from_ts and pr.received_at<to_ts)::text,'kind','number')))
      into result;
  end if;
  return result||jsonb_build_object('report',report_key,'from',from_date,'to',to_date);
end $function$;

CREATE OR REPLACE FUNCTION public.worker_positions_snapshot(target_branch_id uuid)
 RETURNS TABLE(employee_id uuid, employee_name text, latitude numeric, longitude numeric, accuracy_meters numeric, captured_at timestamp with time zone, received_at timestamp with time zone, is_stale boolean, clock_in_at timestamp with time zone, delivery_number text, plate_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare stale_seconds integer;
begin
  if not private.has_permission(target_branch_id, 'delivery.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select s.gps_stale_after_seconds into stale_seconds from public.routing_settings s where s.branch_id = target_branch_id;
  stale_seconds := coalesce(stale_seconds, 300);
  return query
  select e.id, e.display_name, p.latitude, p.longitude, p.accuracy_meters, p.captured_at, p.received_at,
    p.received_at < now() - make_interval(secs => stale_seconds), r.clock_in_at, job.delivery_number, job.plate_number
  from public.attendance_records r
  join public.employees e on e.id = r.employee_id
  join lateral (select wp.latitude, wp.longitude, wp.accuracy_meters, wp.captured_at, wp.received_at from public.worker_positions wp
    where wp.attendance_record_id = r.id order by wp.received_at desc limit 1) p on true
  left join lateral (select d.delivery_number, coalesce(v.plate_number, v.code) as plate_number from public.delivery_assignments a
    join public.deliveries d on d.id = a.delivery_id and d.execution_state in ('ASSIGNED','DISPATCHED','ARRIVED')
    left join public.vehicles v on v.id = a.vehicle_id
    where a.employee_id = r.employee_id and a.superseded_at is null order by d.scheduled_at nulls last limit 1) job on true
  where r.branch_id = target_branch_id and r.clock_in_at is not null and r.clock_out_at is null and r.clock_in_at > now() - interval '20 hours'
  order by e.display_name;
end $function$;
