-- D79 (Owner 15/11/2026): when no dispatcher is online, deliveries still go out and portal orders still get approved.
-- 1. Kho việc cho phiếu giao: a warehouse delivery waiting for dispatch (PLANNED, nobody on it) shows on the worker portal
--    "Nhận việc" AT THE SAME TIME as the dispatch suggestion. The first one wins: the office applying the suggestion or
--    assigning by hand, or a worker pressing "Nhận phiếu giao này". The worker picks one of the free trucks (the suggestion's
--    truck, then the truck named like the order's unit, then the one free soonest is pre-selected); the time window is the
--    one the dispatcher would get for that worker + truck (private.dispatch_pairs). Not listed: dispatch mode OFF, supplier
--    direct lines, a delivery missing address / receiver / phone, a worker who declined it, more than 14 days ahead.
-- 2. Tự duyệt đơn khách khi an toàn: an order placed on the customer portal is confirmed and sourced at once when the
--    customer is within credit limit (no overdue debt) and EVERY line is fully in stock. Otherwise it waits for "Duyệt đơn"
--    as before and the office notification says why. The approval runs as the branch's owner account (an active employee
--    with orders.confirm + delivery.create + delivery.assign, the one with roles.manage first), as D42 posts bank receipts as
--    the person who switched the feed on; the audit says "Tự duyệt".

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1a. The assignment itself, without the permission check (the callers check). Body unchanged from the current
--     public.assign_delivery_scheduled.
CREATE OR REPLACE FUNCTION private.assign_delivery_core(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid, external_carrier_name text, external_carrier_phone text, expected_version integer, operation_id uuid, scheduled_start timestamp with time zone, scheduled_end timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare delivery public.deliveries%rowtype; next_assignment_version integer; assignment_id uuid; work public.work_items%rowtype; work_assignment_version integer; hash text; receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  -- D79: the permission check is the caller's (public.assign_delivery_scheduled: delivery.assign; public.claim_delivery: the worker himself).
  if delivery.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery_id', target_delivery_id, 'employee_id', target_employee_id, 'vehicle_id', target_vehicle_id, 'external_name', nullif(trim(external_carrier_name), ''), 'external_phone', nullif(trim(external_carrier_phone), ''), 'version', expected_version,'scheduled_start',scheduled_start,'scheduled_end',scheduled_end));
  select * into receipt from public.command_receipts where command_receipts.operation_id = assign_delivery_core.operation_id;
  if found then if receipt.command_name <> 'assign_delivery_scheduled' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if delivery.execution_state not in ('PLANNED','ASSIGNED') or delivery.version is distinct from expected_version then raise exception 'delivery_assignment_version_conflict' using errcode = 'PT409'; end if;
  if not ((target_employee_id is not null and target_vehicle_id is not null and nullif(trim(external_carrier_name), '') is null)
    or (target_employee_id is null and target_vehicle_id is null and nullif(trim(external_carrier_name), '') is not null)) then raise exception 'invalid_assignment_shape' using errcode = '22023'; end if;
  if target_employee_id is not null and (not exists (select 1 from public.employees e join public.employee_branch_access a on a.employee_id = e.id where e.id = target_employee_id and e.active and a.branch_id = delivery.branch_id and a.active)
    or not exists (select 1 from public.vehicles where id = target_vehicle_id and branch_id = delivery.branch_id and active)) then raise exception 'assignment_resource_invalid' using errcode = '23503'; end if;
  if scheduled_start is null or scheduled_end is null or scheduled_end<=scheduled_start
  then raise exception 'delivery_schedule_window_required' using errcode='22023';end if;
  delivery.scheduled_at:=scheduled_start;delivery.scheduled_end_at:=scheduled_end;
  select * into work from public.work_items where delivery_id=delivery.id for update;
  if work.id is not null and(work.execution_state not in('AVAILABLE','CLAIMED') or work.started_at is not null)
  then raise exception 'delivery_reassignment_after_work_started_forbidden' using errcode='PT409';end if;
  if work.id is not null and target_employee_id is null then
   raise exception 'delivery_external_assignment_with_work_forbidden' using errcode='PT409';
  end if;
  if target_employee_id is not null then
   perform private.assert_delivery_resources(delivery.id,target_employee_id,target_vehicle_id,delivery.scheduled_at,
     coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+private.delivery_stop_interval(delivery.branch_id)));
  end if;
  update public.gps_tracking_sessions set status='REVOKED',stopped_at=now(),stop_reason='assignment_superseded'
   where delivery_id=delivery.id and status='ACTIVE';
  update public.delivery_assignments set superseded_at = now() where delivery_id = target_delivery_id and superseded_at is null;
  select coalesce(max(assignment_version), 0) + 1 into next_assignment_version from public.delivery_assignments where delivery_id = target_delivery_id;
  insert into public.delivery_assignments(delivery_id, assignment_version, employee_id, vehicle_id,
    external_carrier_name, external_carrier_phone, assigned_by)
  values (target_delivery_id, next_assignment_version, target_employee_id, target_vehicle_id,
    nullif(trim(external_carrier_name), ''), nullif(trim(external_carrier_phone), ''), (select auth.uid())) returning id into assignment_id;
  update public.deliveries set execution_state = 'ASSIGNED', scheduled_at=scheduled_start,scheduled_end_at=scheduled_end, version = version + 1 where id = target_delivery_id;
  if work.id is not null then
   update public.work_item_assignments set superseded_at=now() where work_item_id=work.id and superseded_at is null;
   if target_employee_id is null then
    update public.work_items set execution_state='CANCELLED',version=version+1 where id=work.id;
   else
    select coalesce(max(assignment_version),0)+1 into work_assignment_version from public.work_item_assignments where work_item_id=work.id;
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by)
     values(work.id,work_assignment_version,target_employee_id,target_vehicle_id,null,'DIRECT',(select auth.uid()));
    update public.work_items set planned_vehicle_id=target_vehicle_id,scheduled_start=delivery.scheduled_at,scheduled_end=coalesce(delivery.scheduled_end_at,work.scheduled_end,delivery.scheduled_at+private.delivery_stop_interval(delivery.branch_id)),execution_state='CLAIMED',version=version+1 where id=work.id;
   end if;
  end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),delivery.branch_id,'delivery.assigned','delivery',delivery.id,assign_delivery_core.operation_id,
   array['delivery_assignment','work_assignment','assignment_version','gps_session'],
   case when work.id is not null then 'Đồng bộ phân giao trước khi bắt đầu việc' else 'Phân giao theo kế hoạch' end);
  -- A2: assigning a driver puts the job on the worker portal.
  if target_employee_id is not null and work.id is null then perform private.sync_delivery_work_item(delivery.id, assign_delivery_core.operation_id); end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'assign_delivery_scheduled', hash, 'delivery_assignment', assignment_id, now());
  return assignment_id;
end
$function$;
revoke all on function private.assign_delivery_core(uuid, uuid, uuid, text, text, integer, uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.assign_delivery_scheduled(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid,
  external_carrier_name text, external_carrier_phone text, expected_version integer, operation_id uuid,
  scheduled_start timestamptz, scheduled_end timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare branch uuid;
begin
  select d.branch_id into branch from public.deliveries d where d.id = target_delivery_id;
  if branch is null or not private.has_permission(branch, 'delivery.assign') then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.assign_delivery_core(target_delivery_id, target_employee_id, target_vehicle_id, external_carrier_name, external_carrier_phone,
    expected_version, operation_id, scheduled_start, scheduled_end);
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1b. Which deliveries are open for workers to take.
create or replace function private.delivery_pool_open(target_delivery_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deliveries d
    where d.id = target_delivery_id and d.execution_state = 'PLANNED'
      and (private.branch_settings(d.branch_id)).dispatch_mode <> 'OFF'
      and coalesce(d.scheduled_at, now()) < now() + interval '14 days'
      and nullif(trim(d.delivery_address_snapshot), '') is not null
      and nullif(trim(d.receiver_name_snapshot), '') is not null
      and nullif(trim(d.receiver_phone_snapshot), '') is not null
      and not exists (select 1 from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null)
      and exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.planned_base_quantity > 0)
      and not exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.source_mode = 'SUPPLIER_DIRECT')
      and not exists (select 1 from public.work_items w where w.delivery_id = d.id
        and (w.started_at is not null or w.execution_state not in ('AVAILABLE', 'CLAIMED'))))
$$;
revoke all on function private.delivery_pool_open(uuid) from public, anon, authenticated, service_role;

-- The trucks a worker can take a delivery with, and when (same rules and times as the dispatcher's suggestion).
create or replace function private.delivery_pool_options(target_delivery_id uuid, target_employee_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare suggested uuid; options jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('vehicle_id', p.vehicle_id, 'code', p.vehicle_code, 'plate_number', p.plate_number,
      'start_at', p.start_at, 'end_at', p.end_at) order by p.start_at, p.default_driver desc, p.vehicle_code, p.vehicle_id), '[]'::jsonb)
  into options from private.dispatch_pairs(target_delivery_id) p where p.employee_id = target_employee_id;
  if jsonb_array_length(options) = 0 then return jsonb_build_object('vehicles', options, 'suggested_vehicle_id', null); end if;
  select o->>'vehicle_id' into suggested from jsonb_array_elements(options) o
  order by (o->>'vehicle_id')::uuid = (select x.vehicle_id from public.delivery_dispatch_proposals x where x.delivery_id = target_delivery_id) desc nulls last,
    exists (select 1 from public.delivery_lines l join public.sales_order_lines sl on sl.id = l.sales_order_line_id
      join public.units_of_measure u on u.id = sl.ordered_uom_id
      where l.delivery_id = target_delivery_id and lower(trim(u.name)) = lower(trim(o->>'code'))) desc,
    (o->>'start_at')::timestamptz, o->>'code'
  limit 1;
  return jsonb_build_object('vehicles', options, 'suggested_vehicle_id', suggested);
end $$;
revoke all on function private.delivery_pool_options(uuid, uuid) from public, anon, authenticated, service_role;

-- Deliveries the signed-in worker may take (branches where he reports work, not declined by him).
create or replace function private.worker_pool_deliveries(target_employee_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select d.id from public.deliveries d
  where d.execution_state = 'PLANNED'
    and private.employee_can_report_work(target_employee_id, d.branch_id)
    and private.delivery_pool_open(d.id)
    and not exists (select 1 from public.delivery_dispatch_exclusions ex where ex.delivery_id = d.id and ex.employee_id = target_employee_id)
    -- Office staff who manage roles are not sent on trips unless they drive one of the branch's trucks (as private.dispatch_pairs).
    and (exists (select 1 from public.vehicles v where v.branch_id = d.branch_id and v.active and v.default_driver_employee_id = target_employee_id)
      or not exists (select 1 from public.employee_branch_access a join public.role_permissions rp on rp.role_id = a.role_id
        where a.employee_id = target_employee_id and a.branch_id = d.branch_id and a.active and rp.permission_code = 'roles.manage'))
$$;
revoke all on function private.worker_pool_deliveries(uuid) from public, anon, authenticated, service_role;

create or replace function public.worker_delivery_pool_count()
returns integer language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.current_employee_id();
begin
  if me is null then return 0; end if;
  return (select count(*)::integer from private.worker_pool_deliveries(me));
end $$;
revoke all on function public.worker_delivery_pool_count() from public, anon;
grant execute on function public.worker_delivery_pool_count() to authenticated;

create or replace function public.worker_delivery_pool()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.current_employee_id(); rows jsonb := '[]'::jsonb; d public.deliveries%rowtype; options jsonb;
begin
  if me is null then raise exception 'active_worker_required' using errcode = '42501'; end if;
  for d in select x.* from public.deliveries x where x.id in (select p from private.worker_pool_deliveries(me) p)
    order by coalesce(x.scheduled_at, x.created_at), x.delivery_number limit 30 loop
    options := private.delivery_pool_options(d.id, me);
    continue when jsonb_array_length(options->'vehicles') = 0;
    rows := rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', d.id, 'number', d.delivery_number, 'version', d.version,
      'requested_at', d.scheduled_at,
      'customer_name', d.customer_name_snapshot, 'site_name', d.site_name_snapshot, 'address', d.delivery_address_snapshot,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('material_name', sl.material_name_snapshot,
          'quantity', trim_scale(round(l.planned_base_quantity * sl.conversion_denominator / sl.conversion_numerator, 6))::text,
          'unit', coalesce(su.symbol, u.symbol)) order by sl.line_number, l.id), '[]'::jsonb)
        from public.delivery_lines l join public.sales_order_lines sl on sl.id = l.sales_order_line_id
          join public.units_of_measure u on u.id = l.base_uom_id left join public.units_of_measure su on su.id = sl.ordered_uom_id
        where l.delivery_id = d.id),
      'vehicles', options->'vehicles', 'suggested_vehicle_id', options->'suggested_vehicle_id')));
  end loop;
  return rows;
end $$;
revoke all on function public.worker_delivery_pool() from public, anon;
grant execute on function public.worker_delivery_pool() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 1c. A worker takes a delivery from the pool. One winner: the proposal row then the delivery row are locked (the same
--     order as apply_dispatch_proposal), the delivery must still be open and unchanged.
create or replace function public.claim_delivery(target_delivery_id uuid, target_vehicle_id uuid, expected_version integer, operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.current_employee_id();
  d public.deliveries%rowtype;
  pair record;
  hash text;
  receipt public.command_receipts%rowtype;
  work uuid;
  who text;
begin
  if auth.uid() is null or me is null or claim_delivery.operation_id is null or target_delivery_id is null or target_vehicle_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery', target_delivery_id, 'vehicle', target_vehicle_id, 'version', expected_version, 'employee', me));
  perform pg_advisory_xact_lock(hashtextextended(claim_delivery.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = claim_delivery.operation_id;
  if found then
    if receipt.command_name <> 'claim_delivery' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('work_item_id', receipt.result_entity_id, 'delivery_id', target_delivery_id, 'replayed', true);
  end if;
  perform 1 from public.delivery_dispatch_proposals p where p.delivery_id = target_delivery_id for update;
  select * into d from public.deliveries x where x.id = target_delivery_id for update;
  if d.id is null or not private.employee_can_report_work(me, d.branch_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from private.worker_pool_deliveries(me) x where x = d.id) then
    raise exception 'delivery_not_claimable' using errcode = '55000';
  end if;
  if d.version is distinct from expected_version then raise exception 'delivery_claim_stale' using errcode = 'PT409'; end if;
  select * into pair from private.dispatch_pairs(d.id) p where p.employee_id = me and p.vehicle_id = target_vehicle_id;
  if pair.vehicle_id is null then raise exception 'claim_vehicle_unavailable' using errcode = '55000'; end if;
  perform private.assign_delivery_core(d.id, me, target_vehicle_id, null, null, d.version,
    md5(claim_delivery.operation_id::text || ':claim')::uuid, pair.start_at, pair.end_at);
  delete from public.delivery_dispatch_proposals p where p.delivery_id = d.id;
  select w.id into work from public.work_items w where w.delivery_id = d.id
    and exists (select 1 from public.work_item_assignments a where a.work_item_id = w.id and a.superseded_at is null and a.employee_id = me);
  if work is null then raise exception 'delivery_not_claimable' using errcode = '55000'; end if;
  select e.display_name into who from public.employees e where e.id = me;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), d.branch_id, 'delivery.claimed', 'delivery', d.id, claim_delivery.operation_id, array['delivery_assignment', 'work_assignment'],
    left('Thợ tự nhận trong Kho việc: ' || pair.vehicle_code || ' / ' || who || ' — '
      || to_char(pair.start_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), 500));
  perform private.notify(d.branch_id, 'delivery.claimed', 'delivery', d.id, who || ' đã nhận ' || d.delivery_number,
    pair.vehicle_code || ' · ' || to_char(pair.start_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ' · ' || coalesce(d.site_name_snapshot, d.customer_name_snapshot),
    '/admin/deliveries/' || d.id, 'delivery.assign', null, 'delivery.claimed:' || claim_delivery.operation_id);
  insert into public.command_receipts values (claim_delivery.operation_id, auth.uid(), 'claim_delivery', hash, 'work_item', work, now());
  return jsonb_build_object('work_item_id', work, 'delivery_id', d.id, 'start_at', pair.start_at, 'vehicle_id', target_vehicle_id);
end $$;
revoke all on function public.claim_delivery(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.claim_delivery(uuid, uuid, integer, uuid) to authenticated;

-- The office applying a suggestion for a delivery a worker already took: say so instead of "suggestion missing".
create or replace function public.apply_dispatch_proposal(target_delivery_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  proposal public.delivery_dispatch_proposals%rowtype;
  d public.deliveries%rowtype;
  assignment uuid;
begin
  select * into d from public.deliveries x where x.id = target_delivery_id;
  if d.id is null or auth.uid() is null or apply_dispatch_proposal.operation_id is null or not private.has_permission(d.branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into proposal from public.delivery_dispatch_proposals p where p.delivery_id = d.id for update;
  if proposal.delivery_id is null then
    -- Already applied by this operation: the assignment it made.
    select a.id into assignment from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null;
    if assignment is not null and exists (select 1 from public.command_receipts r where r.operation_id = md5(apply_dispatch_proposal.operation_id::text || ':apply')::uuid) then
      return assignment;
    end if;
    if assignment is not null and exists (select 1 from public.audit_events e where e.entity_id = d.id and e.action = 'delivery.claimed') then
      raise exception 'delivery_already_claimed' using errcode = 'PT409';
    end if;
    raise exception 'dispatch_proposal_missing' using errcode = 'PT409';
  end if;
  assignment := public.assign_delivery_scheduled(d.id, proposal.employee_id, proposal.vehicle_id, null, null, d.version,
    md5(apply_dispatch_proposal.operation_id::text || ':apply')::uuid, proposal.scheduled_start, proposal.scheduled_end);
  delete from public.delivery_dispatch_proposals p where p.delivery_id = d.id;
  return assignment;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Tự duyệt đơn khách khi an toàn.
create or replace function private.portal_auto_approve_actor(target_branch_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select e.auth_user_id from public.employees e
  join public.employee_branch_access a on a.employee_id = e.id and a.active and a.branch_id = target_branch_id
  where e.active and e.auth_user_id is not null
    and private.login_has_permission(e.auth_user_id, target_branch_id, 'orders.confirm')
    and private.login_has_permission(e.auth_user_id, target_branch_id, 'delivery.create')
    and private.login_has_permission(e.auth_user_id, target_branch_id, 'delivery.assign')
  order by private.login_has_permission(e.auth_user_id, target_branch_id, 'roles.manage') desc, e.created_at, e.id
  limit 1
$$;
revoke all on function private.portal_auto_approve_actor(uuid) from public, anon, authenticated, service_role;

create or replace function private.portal_auto_approve(target_sales_order_id uuid, trace uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_orders%rowtype;
  caller text := current_setting('request.jwt.claim.sub', true);
  actor uuid;
  plan jsonb;
  status text := 'WAITING';
  why text;
  sourced jsonb;
begin
  select * into o from public.sales_orders x where x.id = target_sales_order_id;
  if o.id is null or o.commercial_state <> 'DRAFT' or o.order_channel <> 'CUSTOMER_PORTAL' then return jsonb_build_object('status', 'SKIPPED'); end if;
  actor := private.portal_auto_approve_actor(o.branch_id);
  if actor is null then
    why := 'chưa có tài khoản duyệt thay';
  else
    perform set_config('request.jwt.claim.sub', actor::text, true);
    begin
      plan := private.solve_order_sourcing(o.id);
      if jsonb_array_length(plan->'lines') = 0 or exists (select 1 from jsonb_array_elements(plan->'lines') x where x->>'choice' <> 'WAREHOUSE') then
        why := 'kho chưa đủ hàng';
      else
        perform public.confirm_sales_order(o.id, md5(trace::text || ':auto-confirm')::uuid);
        sourced := public.auto_source_sales_order(o.id, md5(trace::text || ':auto-source')::uuid);
        status := 'APPROVED';
      end if;
    exception when others then
      why := case
        when sqlerrm = 'credit_limit_exceeded' then 'vượt hạn mức nợ'
        when sqlerrm = 'overdue_receivable_blocks_credit' then 'khách có nợ quá hạn'
        when sqlerrm = 'credit_limit_not_approved' then 'khách chưa có hạn mức nợ'
        else 'chưa tự duyệt được' end;
    end;
    perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  end if;
  if status = 'APPROVED' then
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (actor, o.branch_id, 'sales_order.portal_auto_approved', 'sales_order', o.id, trace, array['commercial_state', 'credit_commitment', 'supply_allocations'],
      'Tự duyệt đơn khách đặt: trong hạn mức, đủ hàng trong kho (D79)');
    update public.notifications n set title = 'Đơn mới từ khách (đã tự duyệt): ' || o.customer_name_snapshot,
      body = regexp_replace(coalesce(n.body, ''), ' — chờ duyệt$', ' — đã tự duyệt, đang điều phối giao')
    where n.branch_id = o.branch_id and n.dedupe_key = 'order.portal_submitted:' || o.id;
  else
    update public.notifications n set body = regexp_replace(coalesce(n.body, ''), ' — chờ duyệt$', ' — chờ duyệt (' || why || ')')
    where n.branch_id = o.branch_id and n.dedupe_key = 'order.portal_submitted:' || o.id;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('status', status, 'reason', why, 'deliveries', sourced->'deliveries'));
end $$;
revoke all on function private.portal_auto_approve(uuid, uuid) from public, anon, authenticated, service_role;

-- The customer's order command: the existing one (now private, unchanged), then the automatic approval in the same
-- transaction. A replay of the same operation returns the same order and does not approve twice.
alter function public.submit_portal_order(uuid, uuid, jsonb, timestamptz, jsonb, text, uuid) set schema private;
revoke all on function private.submit_portal_order(uuid, uuid, jsonb, timestamptz, jsonb, text, uuid) from public, anon, authenticated, service_role;

create function public.submit_portal_order(target_customer_id uuid, target_site_id uuid, new_site jsonb, requested_delivery_at timestamptz,
  order_lines jsonb, note text, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare created uuid; replay boolean;
begin
  replay := exists (select 1 from public.command_receipts r where r.operation_id = submit_portal_order.operation_id);
  created := private.submit_portal_order(target_customer_id, target_site_id, new_site, requested_delivery_at, order_lines, note, operation_id);
  if not replay then perform private.portal_auto_approve(created, operation_id); end if;
  return created;
end $$;
revoke all on function public.submit_portal_order(uuid, uuid, jsonb, timestamptz, jsonb, text, uuid) from public, anon;
grant execute on function public.submit_portal_order(uuid, uuid, jsonb, timestamptz, jsonb, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
