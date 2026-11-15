-- D85 (Owner 16/11/2026: "Liệu tôi có thể thêm quyền điều phối cho thợ chính chứ? Thợ chính là người có quyền quản lý thợ ở
-- ngoài, và hiểu rõ hơn người ngồi văn phòng."): a lead worker ("thợ chính") dispatches every worker of his branch from a new
-- "Điều phối" tab in the worker portal.
-- 1. A narrow permission work.field_dispatch ("Điều phối hiện trường (thợ chính)"), granted person by person per branch in
--    Nhân viên & quyền → Quyền riêng (employee_permission_grants, read by private.has_permission). No template role carries it;
--    whoever manages roles holds it so the owner can grant it (a grant never exceeds the granter, as ai.use in D34d).
-- 2. Read: field_dispatch_board (what waits for a person: deliveries open in "Nhận việc" and service jobs published to the pool;
--    today's assignments by worker with short / failed results; workers with shift, free time and the dispatcher's free pairs),
--    field_dispatch_summary (the tab's red count and the "Hôm nay" card). No money, no prices.
-- 3. Write: field_assign_delivery / field_reassign_delivery and field_assign_work_item / field_reassign_work_item. The time is
--    the one the dispatch suggestion computes unless the lead picks another; a picked time is checked again for the worker and
--    the truck. First tap wins (suggestion row then delivery row locked, version checked, as claim_delivery). Changing the person
--    stops once the goods are loaded ("Đã lấy hàng lên xe") or the service job is started. The worker who declined a delivery
--    cannot be chosen for it. A worker not clocked in yet can be chosen. The new worker gets the existing "Việc mới" (D80); the
--    office gets a notification and an audit line "Tuấn đã giao … cho …"; the job page names who gave the job.
-- 4. The lead's phone (D80 built-in push, Owner: "Có") is told when a delivery or a service job waits for a person and when a
--    worker declines one. Leads are people with work.field_dispatch and work.claim at the branch, without delivery.assign
--    (office dispatchers already get the office notifications).
begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. The permission.
insert into public.permissions(code, name) values ('work.field_dispatch', 'Điều phối hiện trường (thợ chính)')
on conflict (code) do update set name = excluded.name;
insert into public.role_permissions(role_id, permission_code)
  select distinct rp.role_id, 'work.field_dispatch' from public.role_permissions rp where rp.permission_code = 'roles.manage'
on conflict do nothing;

-- The lead changing the person on an unstarted job may close the current work assignment (set only inside the field_reassign
-- commands, after their own checks), as the worker declining his own job does (C2).
CREATE OR REPLACE FUNCTION private.guard_work_assignment_supersession()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare work public.work_items%rowtype;
begin
 if tg_op='UPDATE' and old.superseded_at is null and new.superseded_at is not null
  and (to_jsonb(old)-'superseded_at')=(to_jsonb(new)-'superseded_at') then
  select * into work from public.work_items where id=old.work_item_id for update;
  if work.started_at is null and work.execution_state in('AVAILABLE','CLAIMED')
   and (private.has_permission(work.branch_id,'work.manage')
     or (work.delivery_id is not null and private.has_permission(work.branch_id,'delivery.assign'))
     -- C2: the worker declining their own unstarted job (set only inside decline_portal_work_item).
     or coalesce(current_setting('hx.decline_work_item', true), '') = old.work_item_id::text
     -- D85: the lead worker changing the person (set only inside private.field_dispatch_delivery / field_dispatch_work).
     or coalesce(current_setting('hx.field_dispatch_work_item', true), '') = old.work_item_id::text) then
   return new;
  end if;
 end if;
 raise exception 'work_assignment_history_immutable' using errcode='55000';
end $function$;
revoke all on function private.guard_work_assignment_supersession() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Helpers.
-- The people a lead may send: those the dispatch suggestion sends (work.claim at the branch; staff who manage roles only when
-- they drive one of the branch's trucks).
create or replace function private.field_dispatch_eligible(target_employee_id uuid, target_branch_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.employee_can_report_work(target_employee_id, target_branch_id)
    and (exists (select 1 from public.vehicles v where v.branch_id = target_branch_id and v.active and v.default_driver_employee_id = target_employee_id)
      or not exists (select 1 from public.employee_branch_access a join public.role_permissions rp on rp.role_id = a.role_id
        where a.employee_id = target_employee_id and a.branch_id = target_branch_id and a.active and rp.permission_code = 'roles.manage'))
$$;
revoke all on function private.field_dispatch_eligible(uuid, uuid) from public, anon, authenticated, service_role;

-- The lead workers of a branch who are told about jobs waiting for a person (office dispatchers have their own notifications).
create or replace function private.field_dispatch_leads(target_branch_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.employees e
  join public.employee_branch_access a on a.employee_id = e.id and a.active and a.branch_id = target_branch_id
  where e.active and e.auth_user_id is not null
    and private.login_has_permission(e.auth_user_id, target_branch_id, 'work.field_dispatch')
    and private.employee_can_report_work(e.id, target_branch_id)
    and not private.login_has_permission(e.auth_user_id, target_branch_id, 'delivery.assign')
  order by e.id
$$;
revoke all on function private.field_dispatch_leads(uuid) from public, anon, authenticated, service_role;

-- When a person is next free for a stop of this length from a time on (the dispatch suggestion's own loop, in working hours).
create or replace function private.field_free_start(target_branch_id uuid, target_employee_id uuid, target_vehicle_id uuid,
  desired timestamptz, length interval, skip_delivery_id uuid)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare candidate timestamptz := desired; rounds integer := 0;
begin
  if desired is null or length is null or length <= interval '0' then return desired; end if;
  loop
    candidate := private.within_work_day(target_branch_id,
      private.next_free_start(target_branch_id, target_employee_id, target_vehicle_id, candidate, length, skip_delivery_id), length);
    exit when private.next_free_start(target_branch_id, target_employee_id, target_vehicle_id, candidate, length, skip_delivery_id) = candidate;
    rounds := rounds + 1;
    exit when rounds > 30;
  end loop;
  return candidate;
end $$;
revoke all on function private.field_free_start(uuid, uuid, uuid, timestamptz, interval, uuid) from public, anon, authenticated, service_role;

-- When a person (and the job's planned truck / machine) can take a service job from a time on: the same clashes as
-- private.assert_work_resources_available, the job itself left out. A time that has to move is kept in working hours.
create or replace function private.field_work_free_start(target_work_item_id uuid, target_employee_id uuid, desired timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare w public.work_items%rowtype; length interval; candidate timestamptz := desired; blocking timestamptz; rounds integer := 0;
begin
  select * into w from public.work_items x where x.id = target_work_item_id;
  if w.id is null or desired is null then return desired; end if;
  length := w.scheduled_end - w.scheduled_start;
  loop
    select max(busy.busy_end) into blocking from (
      select coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id)) as busy_end
      from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
      where a.superseded_at is null and d.execution_state in ('ASSIGNED', 'DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED') and d.scheduled_at is not null
        and (a.employee_id = target_employee_id or (w.planned_vehicle_id is not null and a.vehicle_id = w.planned_vehicle_id))
        and tstzrange(d.scheduled_at, coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id)), '[)')
          && tstzrange(candidate, candidate + length, '[)')
      union all
      select x.scheduled_end from public.work_item_assignments a join public.work_items x on x.id = a.work_item_id
      where a.superseded_at is null and x.id <> w.id and x.execution_state in ('CLAIMED', 'IN_PROGRESS', 'BLOCKED')
        and (a.employee_id = target_employee_id or (w.planned_vehicle_id is not null and a.vehicle_id = w.planned_vehicle_id)
          or (w.planned_machine_id is not null and a.machine_id = w.planned_machine_id))
        and tstzrange(x.scheduled_start, x.scheduled_end, '[)') && tstzrange(candidate, candidate + length, '[)')
    ) busy;
    exit when blocking is null or blocking <= candidate;
    candidate := private.within_work_day(w.branch_id, blocking, length);
    rounds := rounds + 1;
    exit when rounds > 60;
  end loop;
  return candidate;
end $$;
revoke all on function private.field_work_free_start(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-- Whether the current assignment of a delivery / service job was made from "Điều phối" by a lead, and how.
create or replace function private.field_dispatch_mark(target_entity_id uuid, assigned_by uuid, assigned_at timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('action', split_part(e.action, '.', 2), 'by_employee_id', x.id, 'by_name', x.display_name)
  from public.audit_events e left join public.employees x on x.auth_user_id = e.actor_auth_user_id
  where e.entity_type in ('delivery', 'service_job') and e.entity_id = target_entity_id
    and e.actor_auth_user_id = assigned_by and e.occurred_at = assigned_at
    and e.action in ('delivery.field_assigned', 'delivery.field_claimed', 'delivery.field_reassigned',
      'service_job.field_assigned', 'service_job.field_claimed', 'service_job.field_reassigned')
  order by e.id desc limit 1
$$;
revoke all on function private.field_dispatch_mark(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-- What to carry, in the unit it was sold in (as "Nhận việc").
create or replace function private.field_delivery_lines(target_delivery_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('material_name', sl.material_name_snapshot,
      'quantity', trim_scale(round(l.planned_base_quantity * sl.conversion_denominator / sl.conversion_numerator, 6))::text,
      'unit', coalesce(su.symbol, u.symbol)) order by sl.line_number, l.id), '[]'::jsonb)
  from public.delivery_lines l join public.sales_order_lines sl on sl.id = l.sales_order_line_id
    join public.units_of_measure u on u.id = l.base_uom_id left join public.units_of_measure su on su.id = sl.ordered_uom_id
  where l.delivery_id = target_delivery_id
$$;
revoke all on function private.field_delivery_lines(uuid) from public, anon, authenticated, service_role;

-- Every worker + truck the dispatch suggestion could use for a delivery, with the time it would give them; the one it would
-- pick first (private.auto_dispatch_delivery's order).
create or replace function private.field_delivery_pairs(target_delivery_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('employee_id', p.employee_id, 'vehicle_id', p.vehicle_id, 'start_at', p.start_at, 'end_at', p.end_at,
      'default_driver', p.default_driver, 'same_site', p.same_site, 'day_count', p.day_count)
      order by p.start_at, p.default_driver desc, p.day_count, p.same_site desc, p.vehicle_code, p.employee_name, p.vehicle_id, p.employee_id), '[]'::jsonb)
  from private.dispatch_pairs(target_delivery_id) p
$$;
revoke all on function private.field_delivery_pairs(uuid) from public, anon, authenticated, service_role;

-- Who declined a delivery, when and why.
create or replace function private.field_delivery_declined(target_delivery_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_agg(jsonb_build_object('employee_id', x.employee_id, 'name', e.display_name, 'reason', x.reason, 'at', x.created_at) order by x.created_at)
  from public.delivery_dispatch_exclusions x join public.employees e on e.id = x.employee_id where x.delivery_id = target_delivery_id
$$;
revoke all on function private.field_delivery_declined(uuid) from public, anon, authenticated, service_role;

-- When each worker of the branch could do a service job (its time, or later when he is busy then).
create or replace function private.field_service_candidates(target_work_item_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id,
      'start_at', private.field_work_free_start(w.id, e.id, greatest(w.scheduled_start, date_trunc('minute', now())))) order by e.id), '[]'::jsonb)
  from public.work_items w join public.employees e on e.active and e.auth_user_id is not null and private.field_dispatch_eligible(e.id, w.branch_id)
  where w.id = target_work_item_id
$$;
revoke all on function private.field_service_candidates(uuid) from public, anon, authenticated, service_role;

-- Today's jobs of the branch's workers (Vietnam day): deliveries with a worker, and service jobs with a person.
create or replace function private.field_dispatch_today(target_branch_id uuid)
returns table(kind text, entity_id uuid, work_item_id uuid, number text, version integer, employee_id uuid, vehicle_id uuid,
  start_at timestamptz, end_at timestamptz, title text, site_name text, address text, state text, result_kind text,
  can_change boolean, receiver_phone text, mark jsonb, previous_employee_id uuid)
language sql stable security definer set search_path = '' as $$
  select 'DELIVERY', d.id, w.id, d.delivery_number, d.version, a.employee_id, a.vehicle_id, d.scheduled_at,
    coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id)), null::text,
    coalesce(d.site_name_snapshot, d.customer_name_snapshot), d.delivery_address_snapshot, d.execution_state, d.result_kind,
    d.execution_state = 'ASSIGNED' and (w.id is null or (w.execution_state in ('AVAILABLE', 'CLAIMED') and w.started_at is null)),
    case when d.result_kind in ('PARTIAL', 'FAILED') then d.receiver_phone_snapshot end,
    private.field_dispatch_mark(d.id, a.assigned_by, a.assigned_at),
    (select p.employee_id from public.delivery_assignments p where p.delivery_id = d.id and p.assignment_version = a.assignment_version - 1)
  from public.deliveries d
  join public.delivery_assignments a on a.delivery_id = d.id and a.superseded_at is null and a.employee_id is not null
  left join public.work_items w on w.delivery_id = d.id
  where d.branch_id = target_branch_id and d.execution_state in ('ASSIGNED', 'DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED', 'VERIFIED')
    and (d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
  union all
  select 'SERVICE_JOB', s.id, w.id, s.job_number, w.version, a.employee_id, a.vehicle_id, w.scheduled_start, w.scheduled_end, s.service_type,
    coalesce(cs.name, c.display_name), cs.address_text, w.execution_state, null::text,
    w.execution_state = 'CLAIMED' and w.started_at is null, null::text,
    private.field_dispatch_mark(s.id, a.assigned_by, a.assigned_at),
    (select p.employee_id from public.work_item_assignments p where p.work_item_id = w.id and p.assignment_version = a.assignment_version - 1)
  from public.work_items w
  join public.service_jobs s on s.id = w.service_job_id
  join public.customers c on c.id = s.customer_id
  join public.customer_sites cs on cs.id = s.site_id
  join public.work_item_assignments a on a.work_item_id = w.id and a.superseded_at is null
  where w.branch_id = target_branch_id and w.delivery_id is null and w.execution_state in ('CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'VERIFIED')
    and (w.scheduled_start at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;
revoke all on function private.field_dispatch_today(uuid) from public, anon, authenticated, service_role;

-- Service jobs published to the pool and waiting for a person (as "Nhận việc": the next 14 days).
create or replace function private.field_waiting_work(target_branch_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select w.id from public.work_items w
  where w.branch_id = target_branch_id and w.delivery_id is null and w.service_job_id is not null and w.execution_state = 'AVAILABLE'
    and not exists (select 1 from public.work_item_assignments a where a.work_item_id = w.id and a.superseded_at is null)
    and w.scheduled_start < now() + interval '14 days'
  order by w.scheduled_start, w.work_number
$$;
revoke all on function private.field_waiting_work(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. What the lead sees.
create or replace function public.field_dispatch_board(target_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := private.current_employee_id();
  stop interval := private.delivery_stop_interval(target_branch_id);
  waiting jsonb := '[]'::jsonb;
  d public.deliveries%rowtype;
  pairs jsonb;
  suggestion jsonb;
  proposal public.delivery_dispatch_proposals%rowtype;
  services jsonb;
  given jsonb;
  workers jsonb;
  vehicles jsonb;
begin
  if auth.uid() is null or me is null or target_branch_id is null or not private.has_permission(target_branch_id, 'work.field_dispatch') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for d in select x.* from public.deliveries x where x.branch_id = target_branch_id and x.execution_state = 'PLANNED' and private.delivery_pool_open(x.id)
    order by coalesce(x.scheduled_at, x.created_at), x.delivery_number limit 30 loop
    pairs := private.field_delivery_pairs(d.id);
    select * into proposal from public.delivery_dispatch_proposals x where x.delivery_id = d.id;
    suggestion := null;
    if proposal.delivery_id is not null then
      select e.value || jsonb_build_object('from_proposal', true) into suggestion from jsonb_array_elements(pairs) e(value)
      where e.value->>'employee_id' = proposal.employee_id::text and e.value->>'vehicle_id' = proposal.vehicle_id::text limit 1;
    end if;
    if suggestion is null and jsonb_array_length(pairs) > 0 then suggestion := pairs->0; end if;
    waiting := waiting || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'kind', 'DELIVERY', 'id', d.id, 'number', d.delivery_number, 'version', d.version, 'requested_at', d.scheduled_at,
      'customer_name', d.customer_name_snapshot, 'site_name', d.site_name_snapshot, 'address', d.delivery_address_snapshot,
      'lines', private.field_delivery_lines(d.id),
      'declined', private.field_delivery_declined(d.id),
      'pairs', pairs, 'suggestion', suggestion)));
  end loop;

  select coalesce(jsonb_agg(q.item order by q.start_at, q.number), '[]'::jsonb) into services from (
    select w.scheduled_start as start_at, w.work_number as number, jsonb_strip_nulls(jsonb_build_object(
      'kind', 'SERVICE_JOB', 'id', w.id, 'number', s.job_number, 'version', w.version, 'requested_at', w.scheduled_start,
      'duration_minutes', (extract(epoch from (w.scheduled_end - w.scheduled_start)) / 60)::integer,
      'title', s.service_type, 'description', s.description, 'customer_name', c.display_name, 'site_name', cs.name, 'address', cs.address_text,
      'quantity', trim_scale(s.planned_quantity)::text, 'unit', s.unit_label,
      'candidates', private.field_service_candidates(w.id))) as item
    from public.work_items w join public.service_jobs s on s.id = w.service_job_id
      join public.customers c on c.id = s.customer_id join public.customer_sites cs on cs.id = s.site_id
    where w.id in (select x from private.field_waiting_work(target_branch_id) x limit 30)) q;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind', t.kind, 'id', t.entity_id, 'work_item_id', t.work_item_id,
      'number', t.number, 'version', t.version, 'employee_id', t.employee_id, 'vehicle_id', t.vehicle_id, 'start_at', t.start_at, 'end_at', t.end_at,
      'title', t.title, 'site_name', t.site_name, 'address', t.address, 'state', t.state, 'result_kind', t.result_kind, 'can_change', t.can_change,
      'receiver_phone', t.receiver_phone, 'previous_employee_id', case when t.mark->>'action' = 'field_reassigned' then t.previous_employee_id end,
      'field', t.mark || jsonb_build_object('by_me', (t.mark->>'by_employee_id')::uuid = me),
      'shortfall', case when t.result_kind in ('PARTIAL', 'FAILED') then (
        select string_agg(sl.material_name_snapshot || ' ' || trim_scale(round(coalesce(rl.actual_base_quantity, 0) * sl.conversion_denominator / sl.conversion_numerator, 6))::text
            || '/' || trim_scale(round(l.planned_base_quantity * sl.conversion_denominator / sl.conversion_numerator, 6))::text || ' ' || coalesce(su.symbol, u.symbol),
            ', ' order by sl.line_number, l.id)
        from public.delivery_lines l join public.sales_order_lines sl on sl.id = l.sales_order_line_id
          join public.units_of_measure u on u.id = l.base_uom_id left join public.units_of_measure su on su.id = sl.ordered_uom_id
          left join public.delivery_results r on r.delivery_id = l.delivery_id
          left join public.delivery_result_lines rl on rl.delivery_result_id = r.id and rl.delivery_line_id = l.id
        where l.delivery_id = t.entity_id and coalesce(rl.actual_base_quantity, 0) < l.planned_base_quantity) end))
      order by t.start_at, t.number), '[]'::jsonb)
  into given from private.field_dispatch_today(target_branch_id) t;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.id, 'name', e.display_name, 'me', e.id = me,
      'clocked_in_at', (select r.clock_in_at from public.attendance_records r where r.employee_id = e.id and r.branch_id = target_branch_id
        and r.clock_in_at is not null and r.clock_out_at is null and r.clock_in_at > now() - interval '20 hours' order by r.clock_in_at desc limit 1),
      -- A non-delivery id to skip, so service jobs count as busy (private.next_free_start skips the jobs of the delivery it is given).
      'free_from', private.field_free_start(target_branch_id, e.id, null, date_trunc('minute', now()), stop, '00000000-0000-0000-0000-000000000000'::uuid)))
      order by e.display_name, e.id), '[]'::jsonb)
  into workers from public.employees e
  where e.active and e.auth_user_id is not null and private.field_dispatch_eligible(e.id, target_branch_id);

  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'code', v.code, 'plate_number', coalesce(v.plate_number, v.code)) order by v.code, v.id), '[]'::jsonb)
  into vehicles from public.vehicles v where v.branch_id = target_branch_id and v.active;

  return jsonb_build_object('branch_id', target_branch_id, 'now', now(), 'me', me, 'stop_minutes', (extract(epoch from stop) / 60)::integer,
    'waiting', waiting || services, 'given', given, 'workers', workers, 'vehicles', vehicles);
end $$;
revoke all on function public.field_dispatch_board(uuid) from public, anon;
grant execute on function public.field_dispatch_board(uuid) to authenticated;

-- The tab's red count and the "Điều phối hôm nay" card.
create or replace function public.field_dispatch_summary(target_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare deliveries integer; services integer; declined integer; given integer; people integer; short integer;
begin
  if auth.uid() is null or private.current_employee_id() is null or target_branch_id is null
    or not private.has_permission(target_branch_id, 'work.field_dispatch') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select count(*)::integer, count(*) filter (where exists (select 1 from public.delivery_dispatch_exclusions x where x.delivery_id = d.id))::integer
  into deliveries, declined
  from public.deliveries d where d.branch_id = target_branch_id and d.execution_state = 'PLANNED' and private.delivery_pool_open(d.id);
  select count(*)::integer into services from private.field_waiting_work(target_branch_id);
  select count(*)::integer, count(distinct t.employee_id)::integer, count(*) filter (where t.result_kind in ('PARTIAL', 'FAILED'))::integer
  into given, people, short from private.field_dispatch_today(target_branch_id) t;
  return jsonb_build_object('waiting', deliveries + services, 'declined', declined, 'given', given, 'given_workers', people, 'short', short);
end $$;
revoke all on function public.field_dispatch_summary(uuid) from public, anon;
grant execute on function public.field_dispatch_summary(uuid) to authenticated;

-- "Đổi người": who could take one of today's jobs instead, and when.
create or replace function public.field_dispatch_options(target_kind text, target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare branch uuid;
begin
  if target_kind = 'DELIVERY' then
    select d.branch_id into branch from public.deliveries d where d.id = target_id;
  elsif target_kind = 'SERVICE_JOB' then
    select w.branch_id into branch from public.work_items w where w.id = target_id and w.delivery_id is null;
  end if;
  if auth.uid() is null or private.current_employee_id() is null or branch is null or not private.has_permission(branch, 'work.field_dispatch') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_kind = 'DELIVERY' then
    return jsonb_strip_nulls(jsonb_build_object('pairs', private.field_delivery_pairs(target_id), 'declined', private.field_delivery_declined(target_id)));
  end if;
  return jsonb_build_object('candidates', private.field_service_candidates(target_id));
end $$;
revoke all on function public.field_dispatch_options(text, uuid) from public, anon;
grant execute on function public.field_dispatch_options(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Giving a delivery to a worker (ASSIGN: waiting in "Chờ người"; REASSIGN: change the person before loading).
create or replace function private.field_dispatch_delivery(mode text, target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid,
  chosen_start timestamptz, expected_version integer, operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.current_employee_id();
  command text := case mode when 'REASSIGN' then 'field_reassign_delivery' else 'field_assign_delivery' end;
  d public.deliveries%rowtype;
  current_assignment public.delivery_assignments%rowtype;
  work public.work_items%rowtype;
  pair record;
  hash text;
  receipt public.command_receipts%rowtype;
  start_at timestamptz;
  end_at timestamptz;
  free_at timestamptz;
  work_id uuid;
  lead_name text;
  worker_name text;
  previous_name text;
  action text;
  title text;
  slot text;
begin
  if auth.uid() is null or me is null or field_dispatch_delivery.operation_id is null or target_delivery_id is null
    or target_employee_id is null or target_vehicle_id is null or mode not in ('ASSIGN', 'REASSIGN') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery', target_delivery_id, 'employee', target_employee_id, 'vehicle', target_vehicle_id,
    'start', chosen_start, 'version', expected_version));
  perform pg_advisory_xact_lock(hashtextextended(field_dispatch_delivery.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = field_dispatch_delivery.operation_id;
  if found then
    if receipt.command_name <> command or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('work_item_id', receipt.result_entity_id, 'delivery_id', target_delivery_id, 'replayed', true);
  end if;
  -- One winner: the dispatch suggestion row, then the delivery (the order of claim_delivery and apply_dispatch_proposal).
  perform 1 from public.delivery_dispatch_proposals p where p.delivery_id = target_delivery_id for update;
  select * into d from public.deliveries x where x.id = target_delivery_id for update;
  if d.id is null or not private.has_permission(d.branch_id, 'work.field_dispatch') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into current_assignment from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null;
  select * into work from public.work_items w where w.delivery_id = d.id for update;
  if mode = 'ASSIGN' then
    if current_assignment.id is not null or d.execution_state <> 'PLANNED' then raise exception 'field_dispatch_taken' using errcode = 'PT409'; end if;
    if not private.delivery_pool_open(d.id) then raise exception 'field_dispatch_not_open' using errcode = '55000'; end if;
  else
    if d.execution_state in ('DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED', 'VERIFIED')
      or (work.id is not null and (work.started_at is not null or work.execution_state not in ('AVAILABLE', 'CLAIMED'))) then
      raise exception 'field_dispatch_locked' using errcode = '55000';
    end if;
    if d.execution_state <> 'ASSIGNED' or current_assignment.employee_id is null then raise exception 'field_dispatch_stale' using errcode = 'PT409'; end if;
    if current_assignment.employee_id = target_employee_id then raise exception 'field_dispatch_same_worker' using errcode = '22023'; end if;
  end if;
  if d.version is distinct from expected_version then raise exception 'field_dispatch_stale' using errcode = 'PT409'; end if;
  if exists (select 1 from public.delivery_dispatch_exclusions x where x.delivery_id = d.id and x.employee_id = target_employee_id) then
    raise exception 'field_dispatch_worker_declined' using errcode = '55000';
  end if;
  select * into pair from private.dispatch_pairs(d.id) p where p.employee_id = target_employee_id and p.vehicle_id = target_vehicle_id;
  if pair.vehicle_id is null then raise exception 'field_dispatch_unavailable' using errcode = '55000'; end if;
  if chosen_start is null then
    start_at := pair.start_at;
    end_at := pair.end_at;
  else
    -- Owner: "Giờ giao hệ thống và tự chọn được" — a picked time, checked again for the worker and the truck.
    if chosen_start < now() - interval '1 hour' or chosen_start > now() + interval '14 days' then
      raise exception 'field_dispatch_time_out_of_range' using errcode = '22023';
    end if;
    start_at := date_trunc('minute', chosen_start);
    end_at := start_at + (pair.end_at - pair.start_at);
    if private.next_free_start(d.branch_id, target_employee_id, target_vehicle_id, start_at, end_at - start_at, d.id) > start_at then
      free_at := private.field_free_start(d.branch_id, target_employee_id, target_vehicle_id, start_at, end_at - start_at, d.id);
      raise exception 'field_dispatch_busy' using errcode = '23P01',
        hint = 'next_free_at=' || to_char(free_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;
  perform set_config('hx.field_dispatch_work_item', coalesce(work.id::text, ''), true);
  perform private.assign_delivery_core(d.id, target_employee_id, target_vehicle_id, null, null, d.version,
    md5(field_dispatch_delivery.operation_id::text || ':field')::uuid, start_at, end_at);
  perform set_config('hx.field_dispatch_work_item', '', true);
  delete from public.delivery_dispatch_proposals p where p.delivery_id = d.id;
  select w.id into work_id from public.work_items w where w.delivery_id = d.id
    and exists (select 1 from public.work_item_assignments a where a.work_item_id = w.id and a.superseded_at is null and a.employee_id = target_employee_id);
  if work_id is null then raise exception 'field_dispatch_unavailable' using errcode = '55000'; end if;

  select e.display_name into lead_name from public.employees e where e.id = me;
  select e.display_name into worker_name from public.employees e where e.id = target_employee_id;
  select e.display_name into previous_name from public.employees e where e.id = current_assignment.employee_id;
  slot := to_char(start_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
  action := case when mode = 'REASSIGN' then 'delivery.field_reassigned' when target_employee_id = me then 'delivery.field_claimed' else 'delivery.field_assigned' end;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), d.branch_id, action, 'delivery', d.id, field_dispatch_delivery.operation_id, array['delivery_assignment', 'work_assignment', 'schedule'],
    left(case when action = 'delivery.field_claimed' then 'Thợ chính tự nhận: ' else 'Thợ chính giao: ' end || pair.vehicle_code || ' / ' || worker_name
      || ' — ' || slot || case when mode = 'REASSIGN' then ' (trước đó: ' || previous_name || ')' else '' end, 500));
  title := case when mode = 'REASSIGN' then lead_name || ' đã đổi người ' || d.delivery_number || ': ' || previous_name || ' → ' || worker_name
    when target_employee_id = me then lead_name || ' đã tự nhận ' || d.delivery_number
    else lead_name || ' đã giao ' || d.delivery_number || ' cho ' || worker_name end;
  perform private.notify(d.branch_id, 'delivery.field_assigned', 'delivery', d.id, title,
    pair.vehicle_code || ' · ' || slot || ' · ' || coalesce(d.site_name_snapshot, d.customer_name_snapshot),
    '/admin/deliveries/' || d.id, 'delivery.assign', null, 'delivery.field_assigned:' || field_dispatch_delivery.operation_id);
  insert into public.command_receipts values (field_dispatch_delivery.operation_id, auth.uid(), command, hash, 'work_item', work_id, now());
  return jsonb_build_object('work_item_id', work_id, 'delivery_id', d.id, 'employee_id', target_employee_id, 'vehicle_id', target_vehicle_id,
    'start_at', start_at, 'end_at', end_at);
end $$;
revoke all on function private.field_dispatch_delivery(text, uuid, uuid, uuid, timestamptz, integer, uuid) from public, anon, authenticated, service_role;

create or replace function public.field_assign_delivery(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid,
  chosen_start timestamptz, expected_version integer, operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.field_dispatch_delivery('ASSIGN', target_delivery_id, target_employee_id, target_vehicle_id, chosen_start, expected_version, operation_id)
$$;
revoke all on function public.field_assign_delivery(uuid, uuid, uuid, timestamptz, integer, uuid) from public, anon;
grant execute on function public.field_assign_delivery(uuid, uuid, uuid, timestamptz, integer, uuid) to authenticated;

create or replace function public.field_reassign_delivery(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid,
  chosen_start timestamptz, expected_version integer, operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.field_dispatch_delivery('REASSIGN', target_delivery_id, target_employee_id, target_vehicle_id, chosen_start, expected_version, operation_id)
$$;
revoke all on function public.field_reassign_delivery(uuid, uuid, uuid, timestamptz, integer, uuid) from public, anon;
grant execute on function public.field_reassign_delivery(uuid, uuid, uuid, timestamptz, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Giving a service job to a worker (a DIRECT assignment, so "Việc mới" reaches him as when the office gives it).
create or replace function private.field_dispatch_work(mode text, target_work_item_id uuid, target_employee_id uuid,
  chosen_start timestamptz, expected_version integer, operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.current_employee_id();
  command text := case mode when 'REASSIGN' then 'field_reassign_work_item' else 'field_assign_work_item' end;
  w public.work_items%rowtype;
  s public.service_jobs%rowtype;
  current_assignment public.work_item_assignments%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  length interval;
  start_at timestamptz;
  end_at timestamptz;
  free_at timestamptz;
  lead_name text;
  worker_name text;
  previous_name text;
  action text;
  title text;
  slot text;
begin
  if auth.uid() is null or me is null or field_dispatch_work.operation_id is null or target_work_item_id is null or target_employee_id is null
    or mode not in ('ASSIGN', 'REASSIGN') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('work', target_work_item_id, 'employee', target_employee_id, 'start', chosen_start,
    'version', expected_version));
  perform pg_advisory_xact_lock(hashtextextended(field_dispatch_work.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = field_dispatch_work.operation_id;
  if found then
    if receipt.command_name <> command or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('work_item_id', receipt.result_entity_id, 'replayed', true);
  end if;
  select * into w from public.work_items x where x.id = target_work_item_id for update;
  if w.id is null or not private.has_permission(w.branch_id, 'work.field_dispatch') then raise exception 'forbidden' using errcode = '42501'; end if;
  if w.delivery_id is not null or w.service_job_id is null then raise exception 'field_dispatch_use_delivery' using errcode = '22023'; end if;
  select * into s from public.service_jobs x where x.id = w.service_job_id for update;
  select * into current_assignment from public.work_item_assignments a where a.work_item_id = w.id and a.superseded_at is null;
  if mode = 'ASSIGN' then
    if w.execution_state = 'CANCELLED' or s.execution_state = 'CANCELLED' then raise exception 'field_dispatch_not_open' using errcode = '55000'; end if;
    if w.execution_state <> 'AVAILABLE' or current_assignment.id is not null then raise exception 'field_dispatch_taken' using errcode = 'PT409'; end if;
    if w.scheduled_start >= now() + interval '14 days' then raise exception 'field_dispatch_not_open' using errcode = '55000'; end if;
  else
    if w.started_at is not null or w.execution_state in ('IN_PROGRESS', 'BLOCKED', 'DONE', 'VERIFIED') then
      raise exception 'field_dispatch_locked' using errcode = '55000';
    end if;
    if w.execution_state <> 'CLAIMED' or current_assignment.id is null then raise exception 'field_dispatch_stale' using errcode = 'PT409'; end if;
    if current_assignment.employee_id = target_employee_id then raise exception 'field_dispatch_same_worker' using errcode = '22023'; end if;
  end if;
  if w.version is distinct from expected_version then raise exception 'field_dispatch_stale' using errcode = 'PT409'; end if;
  if not exists (select 1 from public.employees e where e.id = target_employee_id and e.active and e.auth_user_id is not null)
    or not private.field_dispatch_eligible(target_employee_id, w.branch_id) then
    raise exception 'field_dispatch_unavailable' using errcode = '55000';
  end if;
  length := w.scheduled_end - w.scheduled_start;
  if chosen_start is null then
    start_at := private.field_work_free_start(w.id, target_employee_id, greatest(w.scheduled_start, date_trunc('minute', now())));
  else
    if chosen_start < now() - interval '1 hour' or chosen_start > now() + interval '14 days' then
      raise exception 'field_dispatch_time_out_of_range' using errcode = '22023';
    end if;
    start_at := date_trunc('minute', chosen_start);
    free_at := private.field_work_free_start(w.id, target_employee_id, start_at);
    if free_at > start_at then
      raise exception 'field_dispatch_busy' using errcode = '23P01',
        hint = 'next_free_at=' || to_char(free_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;
  end_at := start_at + length;
  perform private.assert_work_resources_available(w.id, w.branch_id, target_employee_id, w.planned_vehicle_id, w.planned_machine_id, start_at, end_at);
  if mode = 'REASSIGN' then
    perform set_config('hx.field_dispatch_work_item', w.id::text, true);
    update public.work_item_assignments set superseded_at = now() where id = current_assignment.id;
    perform set_config('hx.field_dispatch_work_item', '', true);
  end if;
  -- The schedule first: "Việc mới" (private.notify_work_assignment) reads the job's time when the assignment is written.
  update public.work_items set execution_state = 'CLAIMED', scheduled_start = start_at, scheduled_end = end_at, version = version + 1 where id = w.id;
  if s.scheduled_start is distinct from start_at then
    update public.service_jobs set scheduled_start = start_at, scheduled_end = start_at + (s.scheduled_end - s.scheduled_start), version = version + 1 where id = s.id;
  end if;
  insert into public.work_item_assignments(work_item_id, assignment_version, employee_id, vehicle_id, machine_id, assignment_kind, assigned_by)
  values (w.id, (select coalesce(max(a.assignment_version), 0) + 1 from public.work_item_assignments a where a.work_item_id = w.id),
    target_employee_id, w.planned_vehicle_id, w.planned_machine_id, 'DIRECT', auth.uid());

  select e.display_name into lead_name from public.employees e where e.id = me;
  select e.display_name into worker_name from public.employees e where e.id = target_employee_id;
  select e.display_name into previous_name from public.employees e where e.id = current_assignment.employee_id;
  slot := to_char(start_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
  action := case when mode = 'REASSIGN' then 'service_job.field_reassigned' when target_employee_id = me then 'service_job.field_claimed'
    else 'service_job.field_assigned' end;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), w.branch_id, action, 'service_job', s.id, field_dispatch_work.operation_id, array['work_assignment', 'schedule'],
    left(case when action = 'service_job.field_claimed' then 'Thợ chính tự nhận: ' else 'Thợ chính giao: ' end || worker_name || ' — ' || slot
      || case when mode = 'REASSIGN' then ' (trước đó: ' || previous_name || ')' else '' end, 500));
  title := case when mode = 'REASSIGN' then lead_name || ' đã đổi người ' || s.job_number || ': ' || previous_name || ' → ' || worker_name
    when target_employee_id = me then lead_name || ' đã tự nhận ' || s.job_number
    else lead_name || ' đã giao ' || s.job_number || ' cho ' || worker_name end;
  perform private.notify(w.branch_id, 'work.field_assigned', 'service_job', s.id, title,
    s.service_type || ' · ' || slot || ' · ' || coalesce((select cs.name from public.customer_sites cs where cs.id = s.site_id), ''),
    '/admin/service-jobs/' || s.id, 'work.manage', null, 'work.field_assigned:' || field_dispatch_work.operation_id);
  insert into public.command_receipts values (field_dispatch_work.operation_id, auth.uid(), command, hash, 'work_item', w.id, now());
  return jsonb_build_object('work_item_id', w.id, 'employee_id', target_employee_id, 'start_at', start_at, 'end_at', end_at);
end $$;
revoke all on function private.field_dispatch_work(text, uuid, uuid, timestamptz, integer, uuid) from public, anon, authenticated, service_role;

create or replace function public.field_assign_work_item(target_work_item_id uuid, target_employee_id uuid, chosen_start timestamptz,
  expected_version integer, operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.field_dispatch_work('ASSIGN', target_work_item_id, target_employee_id, chosen_start, expected_version, operation_id)
$$;
revoke all on function public.field_assign_work_item(uuid, uuid, timestamptz, integer, uuid) from public, anon;
grant execute on function public.field_assign_work_item(uuid, uuid, timestamptz, integer, uuid) to authenticated;

create or replace function public.field_reassign_work_item(target_work_item_id uuid, target_employee_id uuid, chosen_start timestamptz,
  expected_version integer, operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.field_dispatch_work('REASSIGN', target_work_item_id, target_employee_id, chosen_start, expected_version, operation_id)
$$;
revoke all on function public.field_reassign_work_item(uuid, uuid, timestamptz, integer, uuid) from public, anon;
grant execute on function public.field_reassign_work_item(uuid, uuid, timestamptz, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. What the office and the worker see of it.
-- The day board's label on deliveries a lead gave or moved ("Thợ chính Tuấn giao", "Tuấn đổi người: Hùng → Sơn").
create or replace function public.field_dispatch_labels(target_branch_id uuid, target_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or target_branch_id is null or not private.has_permission(target_branch_id, 'delivery.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_object_agg(q.id, q.label), '{}'::jsonb) from (
    select d.id, case m.mark->>'action'
        when 'field_claimed' then 'Thợ chính tự nhận'
        when 'field_reassigned' then (m.mark->>'by_name') || ' đổi người: ' || coalesce((select e.display_name from public.delivery_assignments p
          join public.employees e on e.id = p.employee_id where p.delivery_id = d.id and p.assignment_version = a.assignment_version - 1), '?')
          || ' → ' || coalesce((select e.display_name from public.employees e where e.id = a.employee_id), '?')
        else 'Thợ chính ' || (m.mark->>'by_name') || ' giao' end as label
    from public.deliveries d
    join public.delivery_assignments a on a.delivery_id = d.id and a.superseded_at is null and a.employee_id is not null
    cross join lateral (select private.field_dispatch_mark(d.id, a.assigned_by, a.assigned_at) as mark) m
    where d.branch_id = target_branch_id and m.mark is not null
      and (d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date = target_day) q);
end $$;
revoke all on function public.field_dispatch_labels(uuid, date) from public, anon;
grant execute on function public.field_dispatch_labels(uuid, date) to authenticated;

-- "Người giao việc" on the worker's job page, when a lead gave it.
create or replace function public.work_item_field_dispatcher(target_work_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.work_items%rowtype; a public.work_item_assignments%rowtype; mark jsonb;
begin
  select * into w from public.work_items x where x.id = target_work_item_id;
  if auth.uid() is null or w.id is null or not (private.has_permission(w.branch_id, 'work.read') or private.has_permission(w.branch_id, 'work.claim')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if w.delivery_id is not null then
    select * into a from public.work_item_assignments x where x.work_item_id = w.id and x.superseded_at is null;
    mark := (select private.field_dispatch_mark(w.delivery_id, da.assigned_by, da.assigned_at) from public.delivery_assignments da
      where da.delivery_id = w.delivery_id and da.superseded_at is null);
  else
    select * into a from public.work_item_assignments x where x.work_item_id = w.id and x.superseded_at is null;
    mark := private.field_dispatch_mark(w.service_job_id, a.assigned_by, a.assigned_at);
  end if;
  if mark is null or a.id is null or (mark->>'by_employee_id')::uuid = a.employee_id then return null; end if;
  return jsonb_build_object('name', mark->>'by_name', 'assigned_at', a.assigned_at);
end $$;
revoke all on function public.work_item_field_dispatcher(uuid) from public, anon;
grant execute on function public.work_item_field_dispatcher(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. The lead's phone: jobs waiting for a person, and a worker declining one (Owner: "Có").
-- A delivery open in "Nhận việc": one notification per lead, to the Điều phối tab. The key is the one D80 gives the worker, so a
-- lead who could also take it himself is told once.
create or replace function private.notify_field_dispatch_delivery(target_delivery_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare d public.deliveries%rowtype; lead uuid; goods text; sent integer := 0;
begin
  select * into d from public.deliveries x where x.id = target_delivery_id;
  if d.id is null or not private.delivery_pool_open(d.id) then return 0; end if;
  select string_agg(x->>'material_name' || ' ' || (x->>'quantity') || ' ' || (x->>'unit'), ', ') into goods
  from jsonb_array_elements(private.field_delivery_lines(d.id)) x;
  for lead in select * from private.field_dispatch_leads(d.branch_id) loop
    perform private.notify(d.branch_id, 'delivery.pool_open', 'delivery', d.id,
      'Việc chờ người: ' || coalesce(d.site_name_snapshot, d.customer_name_snapshot, d.delivery_number),
      concat_ws(' · ', d.delivery_number, left(goods, 300), nullif(d.delivery_address_snapshot, '')),
      '/work/dispatch', 'work.field_dispatch', lead, 'delivery.pool_open:' || d.id || ':' || lead || ':' || d.version);
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke all on function private.notify_field_dispatch_delivery(uuid) from public, anon, authenticated, service_role;

create or replace function private.delivery_pool_notify_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid := coalesce(to_jsonb(new)->>'delivery_id', to_jsonb(new)->>'id')::uuid;
begin
  -- deliveries rows carry the delivery as id, dispatch proposals as delivery_id.
  -- A notification must never undo the dispatch it reports on.
  begin
    -- D85: the leads first, so one who could take it himself gets the Điều phối one.
    perform private.notify_field_dispatch_delivery(target);
  exception when others then
    raise warning 'field_dispatch_notify_failed: %', sqlerrm;
  end;
  begin
    perform private.notify_delivery_pool(target);
  exception when others then
    raise warning 'delivery_pool_notify_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.delivery_pool_notify_trigger() from public, anon, authenticated, service_role;

-- A delivery that ends its transaction waiting for a person (also when automatic dispatch found nobody): the leads are told.
create or replace function private.field_dispatch_delivery_insert_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.notify_field_dispatch_delivery(new.id);
  exception when others then
    raise warning 'field_dispatch_notify_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.field_dispatch_delivery_insert_trigger() from public, anon, authenticated, service_role;
create constraint trigger deliveries_field_dispatch_notify
  after insert on public.deliveries
  deferrable initially deferred
  for each row execute function private.field_dispatch_delivery_insert_trigger();

-- A service job published to the pool and still waiting at commit.
create or replace function private.field_dispatch_work_notify_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w public.work_items%rowtype; s public.service_jobs%rowtype; site text; lead uuid;
begin
  begin
    select * into w from public.work_items x where x.id = new.id;
    if w.id is null or not exists (select 1 from private.field_waiting_work(w.branch_id) x where x = w.id) then return null; end if;
    select * into s from public.service_jobs x where x.id = w.service_job_id;
    select coalesce(cs.name, '') into site from public.customer_sites cs where cs.id = s.site_id;
    for lead in select * from private.field_dispatch_leads(w.branch_id) loop
      perform private.notify(w.branch_id, 'work.pool_open', 'work_item', w.id, 'Việc chờ người: ' || s.service_type || coalesce(' · ' || nullif(site, ''), ''),
        concat_ws(' · ', s.job_number, to_char(w.scheduled_start at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), left(s.description, 300)),
        '/work/dispatch', 'work.field_dispatch', lead, 'work.pool_open:' || w.id || ':' || lead || ':' || w.version);
    end loop;
  exception when others then
    raise warning 'field_dispatch_notify_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.field_dispatch_work_notify_trigger() from public, anon, authenticated, service_role;
create constraint trigger work_items_field_dispatch_notify
  after insert or update of execution_state on public.work_items
  deferrable initially deferred
  for each row when (new.delivery_id is null and new.execution_state = 'AVAILABLE')
  execute function private.field_dispatch_work_notify_trigger();

-- A worker declining a delivery: the leads are told too (the office already is). Body unchanged except that line.
CREATE OR REPLACE FUNCTION public.decline_portal_work_item(target_work_item_id uuid, reason text, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  work public.work_items%rowtype;
  current_assignment public.work_item_assignments%rowtype;
  d public.deliveries%rowtype;
  me uuid := private.current_employee_id();
  hash text;
  receipt public.command_receipts%rowtype;
  lead uuid;
  who text;
begin
  if auth.uid() is null or me is null or decline_portal_work_item.operation_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(reason, ''))) not between 3 and 300 then raise exception 'decline_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('work_item', target_work_item_id, 'reason', trim(reason), 'version', expected_version));
  perform pg_advisory_xact_lock(hashtextextended(decline_portal_work_item.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = decline_portal_work_item.operation_id;
  if found then
    if receipt.command_name <> 'decline_portal_work_item' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into work from public.work_items w where w.id = target_work_item_id for update;
  select * into current_assignment from public.work_item_assignments a where a.work_item_id = work.id and a.superseded_at is null;
  if work.id is null or current_assignment.employee_id is distinct from me or not private.has_permission(work.branch_id, 'work.claim') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if work.version is distinct from expected_version then raise exception 'work_version_conflict' using errcode = 'PT409'; end if;
  if work.delivery_id is null then raise exception 'decline_not_supported' using errcode = '23514'; end if;
  select * into d from public.deliveries x where x.id = work.delivery_id for update;
  if work.execution_state <> 'CLAIMED' or work.started_at is not null or d.execution_state <> 'ASSIGNED' then
    raise exception 'work_already_started' using errcode = '23514';
  end if;
  -- The job keeps its history; the declined assignment is closed (allowed for this command only) and the delivery is planned again.
  perform set_config('hx.decline_work_item', work.id::text, true);
  update public.work_item_assignments set superseded_at = now() where id = current_assignment.id;
  perform set_config('hx.decline_work_item', '', true);
  update public.work_items set version = version + 1 where id = work.id;
  update public.gps_tracking_sessions set status = 'REVOKED', stopped_at = now(), stop_reason = 'assignment_superseded'
    where delivery_id = d.id and status = 'ACTIVE';
  update public.delivery_assignments set superseded_at = now() where delivery_id = d.id and superseded_at is null;
  update public.deliveries set execution_state = 'PLANNED', version = version + 1 where id = d.id;
  insert into public.delivery_dispatch_exclusions(delivery_id, employee_id, reason, created_by)
  values (d.id, me, trim(reason), (select auth.uid()))
  on conflict (delivery_id, employee_id) do update set reason = excluded.reason, created_at = now();
  select e.display_name into who from public.employees e where e.id = me;
  perform private.notify(d.branch_id, 'work.declined', 'delivery', d.id,
    who || ' từ chối ' || d.delivery_number, trim(reason),
    '/admin/dispatch', 'delivery.assign', null, 'work.declined:' || decline_portal_work_item.operation_id);
  -- D85: and every lead worker of the branch, to his Điều phối tab.
  for lead in select x from private.field_dispatch_leads(d.branch_id) x where x <> me loop
    perform private.notify(d.branch_id, 'work.declined', 'delivery', d.id, who || ' từ chối ' || d.delivery_number, trim(reason),
      '/work/dispatch', 'work.field_dispatch', lead, 'work.declined:' || decline_portal_work_item.operation_id || ':' || lead);
  end loop;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), d.branch_id, 'work_item.declined', 'work_item', work.id, decline_portal_work_item.operation_id,
    array['work_assignment', 'delivery_assignment', 'execution_state'], left('Thợ từ chối: ' || trim(reason), 500));
  insert into public.command_receipts values (decline_portal_work_item.operation_id, auth.uid(), 'decline_portal_work_item', hash, 'work_item', work.id, now());
  return work.id;
end
$function$;

-- The D80 built-in push, now also for the lead's own notifications (a PUSH rule for the same event still takes over).
create or replace function private.fire_automation() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  rule public.automation_rules%rowtype;
  sub public.push_subscriptions%rowtype;
  payload jsonb;
  amount bigint;
begin
  payload := jsonb_strip_nulls(jsonb_build_object('kind', new.kind, 'title', new.title, 'body', new.body, 'link', new.link,
    'entity_type', new.entity_type, 'entity_id', new.entity_id, 'notification_id', new.id, 'created_at', new.created_at));
  for rule in select * from public.automation_rules r where r.branch_id = new.branch_id and r.active and r.event = new.kind order by r.id loop
    if rule.min_amount_vnd is not null then
      amount := private.automation_amount(new.entity_type, new.entity_id);
      if coalesce(amount, 0) < rule.min_amount_vnd then continue; end if;
    end if;
    if rule.problems_only and not (new.kind = 'delivery.result_submitted'
      and exists (select 1 from public.deliveries d where d.id = new.entity_id and d.result_kind in ('PARTIAL', 'FAILED'))) then continue; end if;
    if rule.channel = 'PUSH' then
      for sub in select s.* from public.push_subscriptions s
        where private.login_has_permission(s.auth_user_id, new.branch_id, new.required_permission)
          and (new.recipient_employee_id is null or exists (select 1 from public.employees e where e.id = new.recipient_employee_id and e.auth_user_id = s.auth_user_id))
        order by s.id
      loop
        perform private.enqueue_outbound_job(new.branch_id, rule.id, new.id, 'PUSH', sub.id::text, payload, 'rule:' || rule.id || ':' || new.id || ':' || sub.id);
      end loop;
    else
      perform private.enqueue_outbound_job(new.branch_id, rule.id, new.id, rule.channel, rule.target, payload, 'rule:' || rule.id || ':' || new.id);
    end if;
  end loop;
  -- D80: the worker's own jobs reach his phone without a rule (unless a PUSH rule for the event already sends them).
  -- D85: so do the lead's (a job waiting for a person, a worker declining one).
  if new.recipient_employee_id is not null and new.kind in ('work.assigned', 'delivery.pool_open', 'work.pool_open', 'work.declined')
    and not exists (select 1 from public.automation_rules r where r.branch_id = new.branch_id and r.active and r.event = new.kind and r.channel = 'PUSH') then
    for sub in select s.* from public.push_subscriptions s join public.employees e on e.auth_user_id = s.auth_user_id
      where e.id = new.recipient_employee_id and e.active order by s.id
    loop
      perform private.enqueue_outbound_job(new.branch_id, null, new.id, 'PUSH', sub.id::text, payload, 'worker:' || new.id || ':' || sub.id);
    end loop;
  end if;
  return null;
end
$function$;
revoke all on function private.fire_automation() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
