-- FB4 D22 + C2 (Owner 17/10/2026): auto-dispatch "Tự động, sửa được".
-- * Trucks get a default driver (catalog "Xe"). A warehouse delivery made without a driver is given to the best truck + default
--   driver: free soonest within the working day (branch setting, default 07:00–18:00) → fewest deliveries that day → already
--   going to the same site → truck code; the assignment goes through assign_delivery_scheduled with all its checks (rights,
--   capacity, clashes, worker account), so the job lands on the worker portal as before. Branch mode AUTO (default) assigns,
--   SUGGEST stores a proposal the dispatcher applies, OFF leaves it to the dispatcher. Nobody fits → "Chờ điều phối" + bell.
-- * Auto-sourcing (D19) now also makes the warehouse deliveries of the order and dispatches them.
-- * "Tự chia việc" (auto_dispatch_day) and the day board (dispatch_day) for the Điều phối page.
-- * C2: a worker declines an unstarted delivery job with a reason; the delivery waits for dispatch again, that worker is not
--   proposed for it again, the dispatchers are told. Assigning stays with people who may assign (no rights are borrowed).
begin;

alter table public.vehicles add column default_driver_employee_id uuid references public.employees(id) on delete set null;

-- Same validator as 20261018090000, plus the truck's default driver.
CREATE OR REPLACE FUNCTION private.canonical_save_catalog_record(kind text, target_id uuid, target_branch_id uuid, values_json jsonb, expected_json jsonb, change_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tab text; allowed text[]; permission text; old_row jsonb; payload jsonb;
  cols text; vals text; assignments text; k text; parent_branch uuid;
begin
  case kind
  when 'materials' then tab:='materials'; permission:='catalog.manage'; allowed:=array['code','name','group_id','base_uom_id','specification','sale_enabled','purchase_enabled','active'];
  when 'units' then tab:='units_of_measure'; permission:='catalog.manage'; allowed:=array['code','name','symbol','decimal_scale','active'];
  when 'groups' then tab:='material_groups'; permission:='catalog.manage'; allowed:=array['code','name','active'];
  when 'customers' then tab:='customers'; permission:='customers.manage'; allowed:=array['code','display_name','customer_type','phone','email','address_text','tax_code','active'];
  when 'suppliers' then tab:='suppliers'; permission:='suppliers.manage'; allowed:=array['code','name','phone','email','address_text','tax_code','payment_terms_days','active'];
  when 'sites' then tab:='customer_sites'; permission:='customers.manage'; allowed:=array['customer_id','code','name','address_text','receiver_name','receiver_phone','access_note','receiving_window','active'];
  when 'warehouses' then tab:='warehouses'; permission:='roles.manage'; allowed:=array['code','name','address_text','active'];
  when 'vehicles' then tab:='vehicles'; permission:='roles.manage'; allowed:=array['code','plate_number','capacity_quantity','capacity_uom_id','capacity_source_note','default_driver_employee_id','active'];
  when 'machines' then tab:='machines'; permission:='roles.manage'; allowed:=array['code','name','machine_type','active'];
  when 'conversions' then tab:='material_uom_conversions'; permission:='catalog.manage'; allowed:=array['material_id','from_uom_id','to_uom_id','numerator','denominator','conversion_type','settlement_allowed','rounding_scale','rounding_mode','source_note','active'];
  when 'service_types' then tab:='service_types'; permission:='service.manage'; allowed:=array['code','name','unit_label','default_price_vnd','resource_kind','active'];
  else raise exception 'unsupported_catalog' using errcode='22023'; end case;
  if auth.uid() is null or not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501'; end if;
  if char_length(trim(coalesce(change_reason,''))) not between 3 and 500 or target_id is null or operation_id is null or jsonb_typeof(values_json)<>'object' then raise exception 'invalid_input' using errcode='22023'; end if;
  for k in select jsonb_object_keys(values_json) loop
    if not k=any(allowed) then raise exception 'field_not_editable' using errcode='42501'; end if;
  end loop;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into old_row using target_id;
  if old_row is not null then
    if expected_json is null then raise exception 'record_already_exists' using errcode='23505'; end if;
    if tab in ('customers','suppliers','warehouses','vehicles','machines','service_types') and (old_row->>'branch_id')::uuid<>target_branch_id then raise exception 'forbidden' using errcode='42501'; end if;
    if tab='customer_sites' then
      select branch_id into parent_branch from public.customers where id=(old_row->>'customer_id')::uuid;
      if parent_branch is distinct from target_branch_id or values_json->>'customer_id' is distinct from old_row->>'customer_id' then raise exception 'site_customer_immutable' using errcode='42501'; end if;
    end if;
    for k in select jsonb_object_keys(values_json) loop
      if not expected_json ? k or old_row->k is distinct from expected_json->k then raise exception 'stale_record_reload' using errcode='PT409'; end if;
    end loop;
    if tab='materials' and values_json->>'base_uom_id' is distinct from old_row->>'base_uom_id' then raise exception 'base_unit_immutable' using errcode='22023'; end if;
    if tab='material_uom_conversions' and (values_json - 'active') <> (expected_json - 'active') then raise exception 'create_new_conversion_version' using errcode='22023'; end if;
  elsif expected_json is not null then raise exception 'record_missing' using errcode='PT409';
  end if;
  if kind='vehicles' and (values_json ? 'capacity_quantity' or values_json ? 'capacity_uom_id' or values_json ? 'capacity_source_note') then
    if exists(select 1 from public.delivery_assignments a join public.deliveries d on d.id=a.delivery_id
      where a.vehicle_id=target_id and a.superseded_at is null and d.execution_state in('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED'))
      and ((values_json->>'capacity_quantity')::numeric is distinct from (old_row->>'capacity_quantity')::numeric
        or (values_json->>'capacity_uom_id')::uuid is distinct from (old_row->>'capacity_uom_id')::uuid
        or coalesce((values_json->>'active')::boolean,true)=false) then
      raise exception 'vehicle_capacity_locked_by_assignment' using errcode='PT409';
    end if;
    if values_json->>'capacity_quantity' is not null then
      perform private.require_exact_quantity((values_json->>'capacity_quantity')::numeric,false);
      if nullif(trim(values_json->>'capacity_source_note'),'') is null or length(trim(values_json->>'capacity_source_note')) not between 3 and 500
      then raise exception 'vehicle_capacity_evidence_required' using errcode='22023';end if;
    end if;
  end if;
  -- F3: a truck's default driver works in the same branch.
  if kind='vehicles' and nullif(values_json->>'default_driver_employee_id','') is not null and not exists(select 1 from public.employee_branch_access a
    join public.employees e on e.id=a.employee_id where a.employee_id=(values_json->>'default_driver_employee_id')::uuid and a.branch_id=target_branch_id and a.active and e.active)
  then raise exception 'invalid_default_driver' using errcode='23503'; end if;
  if kind='vehicles' and values_json ? 'default_driver_employee_id' and values_json->>'default_driver_employee_id'='' then
    values_json:=jsonb_set(values_json,'{default_driver_employee_id}','null'::jsonb);
  end if;
  payload:=values_json||jsonb_build_object('id',target_id);
  if tab in ('customers','suppliers','warehouses','vehicles','machines','service_types') then payload:=payload||jsonb_build_object('branch_id',target_branch_id); end if;
  if tab='customer_sites' then
    select branch_id into parent_branch from public.customers where id=(payload->>'customer_id')::uuid and active;
    if parent_branch is distinct from target_branch_id then raise exception 'customer_outside_branch' using errcode='42501'; end if;
  end if;
  if old_row is null then
    select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into cols,vals from jsonb_object_keys(payload) key;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r',tab,cols,vals,tab) using payload;
  else
    select string_agg(format('%I=r.%I',key,key),',') into assignments from jsonb_object_keys(values_json) key;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2',tab,assignments,tab) using payload,target_id;
  end if;
  if kind='vehicles' and (values_json ? 'capacity_quantity' or values_json ? 'capacity_uom_id' or values_json ? 'capacity_source_note') then
    update public.vehicles set capacity_verified_at=case when capacity_quantity is null then null else now() end,
      capacity_verified_by=case when capacity_quantity is null then null else (select auth.uid()) end where id=target_id;
  end if;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values(auth.uid(),target_branch_id,'catalog.save',tab,target_id,operation_id,array(select jsonb_object_keys(values_json)),change_reason);
  return target_id;
end $function$
;
revoke all on function private.canonical_save_catalog_record(text,uuid,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;

create or replace function private.guard_work_assignment_supersession() returns trigger
language plpgsql security definer set search_path to '' as $function$
declare work public.work_items%rowtype;
begin
 if tg_op='UPDATE' and old.superseded_at is null and new.superseded_at is not null
  and (to_jsonb(old)-'superseded_at')=(to_jsonb(new)-'superseded_at') then
  select * into work from public.work_items where id=old.work_item_id for update;
  if work.started_at is null and work.execution_state in('AVAILABLE','CLAIMED')
   and (private.has_permission(work.branch_id,'work.manage')
     or (work.delivery_id is not null and private.has_permission(work.branch_id,'delivery.assign'))
     -- C2: the worker declining their own unstarted job (set only inside decline_portal_work_item).
     or coalesce(current_setting('hx.decline_work_item', true), '') = old.work_item_id::text) then
   return new;
  end if;
 end if;
 raise exception 'work_assignment_history_immutable' using errcode='55000';
end $function$;

-- Deliveries the board cannot give to a person again (a worker declined it).
create table public.delivery_dispatch_exclusions (
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (delivery_id, employee_id)
);
-- SUGGEST mode: the proposal the dispatcher applies with one click.
create table public.delivery_dispatch_proposals (
  delivery_id uuid primary key references public.deliveries(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null check (scheduled_end > scheduled_start),
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.delivery_dispatch_exclusions enable row level security;
alter table public.delivery_dispatch_proposals enable row level security;
revoke all on public.delivery_dispatch_exclusions, public.delivery_dispatch_proposals from anon, authenticated;
grant select on public.delivery_dispatch_exclusions, public.delivery_dispatch_proposals to authenticated;
create policy delivery_dispatch_exclusions_select on public.delivery_dispatch_exclusions for select to authenticated
  using (exists (select 1 from public.deliveries d where d.id = delivery_id and private.has_permission(d.branch_id, 'delivery.read')));
create policy delivery_dispatch_proposals_select on public.delivery_dispatch_proposals for select to authenticated
  using (exists (select 1 from public.deliveries d where d.id = delivery_id and private.has_permission(d.branch_id, 'delivery.read')));

-- The working-day window of a start: before the day starts → day start; a stop that would end after the day → next day.
create or replace function private.within_work_day(target_branch_id uuid, start_at timestamptz, length interval) returns timestamptz
language plpgsql stable security definer set search_path = '' as $function$
declare
  settings public.branch_operation_settings := private.branch_settings(target_branch_id);
  local_start timestamp := start_at at time zone 'Asia/Ho_Chi_Minh';
begin
  if local_start::time < settings.work_day_start then
    return (local_start::date + settings.work_day_start) at time zone 'Asia/Ho_Chi_Minh';
  end if;
  if (local_start + length)::time > settings.work_day_end or (local_start + length)::date > local_start::date then
    return (local_start::date + 1 + settings.work_day_start) at time zone 'Asia/Ho_Chi_Minh';
  end if;
  return start_at;
end
$function$;
revoke all on function private.within_work_day(uuid, timestamptz, interval) from public, anon, authenticated, service_role;

-- Every truck with a default driver who could take the delivery, best first: free soonest (within the working day) → fewest
-- deliveries that day → already going to the same site that day → code.
create or replace function private.dispatch_candidates(target_delivery_id uuid)
returns table(vehicle_id uuid, vehicle_code text, plate_number text, employee_id uuid, employee_name text, start_at timestamptz, end_at timestamptz,
  day_count integer, same_site boolean)
language plpgsql stable security definer set search_path = '' as $function$
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
    select x.id, x.code, x.plate_number, e.id as driver, e.display_name
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
revoke all on function private.dispatch_candidates(uuid) from public, anon, authenticated, service_role;

-- One assignment attempt through the real command (all its checks: rights, capacity, clashes, worker account). probe = check
-- only, undone afterwards. Returns null on success, else the refusal.
create or replace function private.try_dispatch_assignment(target_delivery_id uuid, target_employee_id uuid, target_vehicle_id uuid,
  start_at timestamptz, end_at timestamptz, trace uuid, probe boolean) returns text
language plpgsql security definer set search_path = '' as $function$
begin
  begin
    perform public.assign_delivery_scheduled(target_delivery_id, target_employee_id, target_vehicle_id, null, null,
      (select d.version from public.deliveries d where d.id = target_delivery_id),
      md5(trace::text || ':dispatch:' || target_employee_id::text || ':' || target_vehicle_id::text || ':' || start_at::text)::uuid, start_at, end_at);
    if probe then raise exception 'hx_dispatch_probe_ok'; end if;
    return null;
  exception when others then
    if sqlerrm = 'hx_dispatch_probe_ok' then return null; end if;
    return sqlerrm;
  end;
end
$function$;
revoke all on function private.try_dispatch_assignment(uuid, uuid, uuid, timestamptz, timestamptz, uuid, boolean) from public, anon, authenticated, service_role;

-- D22: gives a planned warehouse delivery to the best truck + default driver (AUTO), stores the proposal (SUGGEST), or does
-- nothing (OFF). Nobody fits → "Chờ điều phối" and the dispatchers are told. forced_mode overrides the branch setting.
create or replace function private.auto_dispatch_delivery(target_delivery_id uuid, trace uuid, forced_mode text default null) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  d public.deliveries%rowtype;
  mode text;
  c record;
  refusal text;
  tried integer := 0;
  reason text;
begin
  select * into d from public.deliveries x where x.id = target_delivery_id for update;
  if d.id is null then return jsonb_build_object('status', 'MISSING'); end if;
  mode := coalesce(forced_mode, (private.branch_settings(d.branch_id)).dispatch_mode);
  if mode = 'OFF' then return jsonb_build_object('status', 'OFF'); end if;
  if d.execution_state <> 'PLANNED' or exists (select 1 from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null)
    or not exists (select 1 from public.delivery_lines l where l.delivery_id = d.id)
    or exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.source_mode = 'SUPPLIER_DIRECT') then
    return jsonb_build_object('status', 'NOT_PLANNED');
  end if;
  for c in select * from private.dispatch_candidates(d.id) x order by x.start_at, x.day_count, x.same_site desc, x.vehicle_code, x.vehicle_id loop
    tried := tried + 1;
    refusal := private.try_dispatch_assignment(d.id, c.employee_id, c.vehicle_id, c.start_at, c.end_at, trace, mode = 'SUGGEST');
    if refusal is null then
      reason := c.vehicle_code || ' / ' || c.employee_name || ' — rảnh lúc ' || to_char(c.start_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
        || ', ' || c.day_count || ' phiếu khác trong ngày' || case when c.same_site then ', cùng công trình' else '' end;
      if mode = 'SUGGEST' then
        insert into public.delivery_dispatch_proposals(delivery_id, employee_id, vehicle_id, scheduled_start, scheduled_end, reason, created_by)
        values (d.id, c.employee_id, c.vehicle_id, c.start_at, c.end_at, reason, (select auth.uid()))
        on conflict (delivery_id) do update set employee_id = excluded.employee_id, vehicle_id = excluded.vehicle_id,
          scheduled_start = excluded.scheduled_start, scheduled_end = excluded.scheduled_end, reason = excluded.reason,
          created_by = excluded.created_by, created_at = now();
        perform private.notify(d.branch_id, 'delivery.dispatch_suggested', 'delivery', d.id, 'Gợi ý điều phối ' || d.delivery_number,
          reason, '/admin/dispatch', 'delivery.assign', null, 'delivery.dispatch_suggested:' || d.id || ':' || trace);
        return jsonb_build_object('status', 'SUGGESTED', 'vehicle_id', c.vehicle_id, 'employee_id', c.employee_id, 'start_at', c.start_at, 'reason', reason);
      end if;
      delete from public.delivery_dispatch_proposals p where p.delivery_id = d.id;
      insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
      values ((select auth.uid()), d.branch_id, 'delivery.auto_dispatched', 'delivery', d.id, trace, array['delivery_assignment'], left('Tự điều phối: ' || reason, 500));
      return jsonb_build_object('status', 'ASSIGNED', 'vehicle_id', c.vehicle_id, 'employee_id', c.employee_id, 'start_at', c.start_at, 'reason', reason);
    end if;
  end loop;
  perform private.notify(d.branch_id, 'delivery.waiting_dispatch', 'delivery', d.id, d.delivery_number || ' chờ điều phối',
    case when tried = 0 then 'Chưa có xe nào có tài xế mặc định rảnh; khai báo "Tài xế mặc định" cho xe hoặc phân xe tay.'
      else 'Không xe/tài xế nào nhận được phiếu này (lịch, tải xe hoặc quyền). Phân xe tay trên phiếu.' end,
    '/admin/deliveries/' || d.id, 'delivery.assign', null, 'delivery.waiting_dispatch:' || d.id || ':' || trace);
  return jsonb_build_object('status', 'WAITING', 'tried', tried);
end
$function$;
revoke all on function private.auto_dispatch_delivery(uuid, uuid, text) from public, anon, authenticated, service_role;

-- "Tự chia việc": every planned warehouse delivery of the day (and the ones without a time) goes through auto-dispatch.
create or replace function public.auto_dispatch_day(target_branch_id uuid, target_day date, operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  hash text;
  receipt public.command_receipts%rowtype;
  item record;
  outcome jsonb;
  assigned integer := 0;
  waiting integer := 0;
begin
  if auth.uid() is null or target_branch_id is null or target_day is null or auto_dispatch_day.operation_id is null
    or not private.has_permission(target_branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'day', target_day));
  perform pg_advisory_xact_lock(hashtextextended('auto_dispatch_day:' || target_branch_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = auto_dispatch_day.operation_id;
  if found then
    if receipt.command_name <> 'auto_dispatch_day' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('replayed', true);
  end if;
  for item in select d.id from public.deliveries d
    where d.branch_id = target_branch_id and d.execution_state = 'PLANNED'
      and (d.scheduled_at is null or (d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date <= target_day)
      and not exists (select 1 from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null)
    order by d.scheduled_at nulls first, d.delivery_number limit 100
  loop
    outcome := private.auto_dispatch_delivery(item.id, auto_dispatch_day.operation_id, 'AUTO');
    if outcome->>'status' = 'ASSIGNED' then assigned := assigned + 1; elsif outcome->>'status' = 'WAITING' then waiting := waiting + 1; end if;
  end loop;
  insert into public.command_receipts values (auto_dispatch_day.operation_id, auth.uid(), 'auto_dispatch_day', hash, 'branch', target_branch_id, now());
  return jsonb_build_object('assigned', assigned, 'waiting', waiting);
end
$function$;
revoke all on function public.auto_dispatch_day(uuid, date, uuid) from public, anon;
grant execute on function public.auto_dispatch_day(uuid, date, uuid) to authenticated;

-- SUGGEST mode: the dispatcher applies the stored proposal (all assignment checks run again).
create or replace function public.apply_dispatch_proposal(target_delivery_id uuid, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
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
    raise exception 'dispatch_proposal_missing' using errcode = 'PT409';
  end if;
  assignment := public.assign_delivery_scheduled(d.id, proposal.employee_id, proposal.vehicle_id, null, null, d.version,
    md5(apply_dispatch_proposal.operation_id::text || ':apply')::uuid, proposal.scheduled_start, proposal.scheduled_end);
  delete from public.delivery_dispatch_proposals p where p.delivery_id = d.id;
  return assignment;
end
$function$;
revoke all on function public.apply_dispatch_proposal(uuid, uuid) from public, anon;
grant execute on function public.apply_dispatch_proposal(uuid, uuid) to authenticated;

-- The dispatch board of a day: each default driver's deliveries by time, everything still waiting, and the proposals.
create or replace function public.dispatch_day(target_branch_id uuid, target_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'delivery.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'drivers', coalesce((select jsonb_agg(driver order by driver->>'name') from (
      select jsonb_build_object('employee_id', e.id, 'name', e.display_name,
        'vehicles', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'code', v.code, 'plate', v.plate_number) order by v.code), '[]'::jsonb)
          from public.vehicles v where v.branch_id = target_branch_id and v.active and v.default_driver_employee_id = e.id),
        'deliveries', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'number', d.delivery_number, 'customer', d.customer_name_snapshot,
            'site', d.site_name_snapshot, 'state', d.execution_state, 'start', d.scheduled_at,
            'end', coalesce(d.scheduled_end_at, d.scheduled_at + private.delivery_stop_interval(d.branch_id)), 'vehicle', v.plate_number)
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
revoke all on function public.dispatch_day(uuid, date) from public, anon;
grant execute on function public.dispatch_day(uuid, date) to authenticated;

-- F1 → F3: a sourced order gets its warehouse deliveries (one per warehouse, at the requested time while it is ahead, else
-- now), each auto-dispatched. Only for someone who may make deliveries; otherwise they are told to.
create or replace function private.after_order_sourced(target_sales_order_id uuid, trace uuid) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  sale_order public.sales_orders%rowtype;
  wh record;
  lines jsonb;
  delivery uuid;
  made jsonb := '[]'::jsonb;
  dispatch jsonb;
  at_time timestamptz;
begin
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id;
  if sale_order.id is null or sale_order.commercial_state <> 'CONFIRMED' then return made; end if;
  if not private.has_permission(sale_order.branch_id, 'delivery.create') then
    if exists (select 1 from public.supply_allocations a join public.sales_order_lines l on l.id = a.sales_order_line_id
      where l.sales_order_id = sale_order.id and a.supply_mode = 'WAREHOUSE' and a.allocated_base_quantity > private.delivery_allocation_consumed(a.id)) then
      perform private.notify(sale_order.branch_id, 'sales_order.needs_delivery', 'sales_order', sale_order.id, sale_order.order_number || ' chờ lập phiếu giao',
        'Đã phân nguồn kho; người xác nhận đơn không có quyền lập phiếu giao.', '/admin/orders/' || sale_order.id, 'delivery.create', null,
        'sales_order.needs_delivery:' || trace);
    end if;
    return made;
  end if;
  at_time := case when sale_order.requested_delivery_at > now() then sale_order.requested_delivery_at else now() end;
  for wh in select distinct a.warehouse_id from public.supply_allocations a join public.sales_order_lines l on l.id = a.sales_order_line_id
    where l.sales_order_id = sale_order.id and a.supply_mode = 'WAREHOUSE' and a.allocated_base_quantity > private.delivery_allocation_consumed(a.id)
    order by a.warehouse_id
  loop
    select jsonb_agg(jsonb_build_object('supply_allocation_id', x.id, 'planned_base_quantity', x.left_qty) order by x.line_number) into lines
    from (select distinct on (a.sales_order_line_id) a.id, l.line_number, a.allocated_base_quantity - private.delivery_allocation_consumed(a.id) as left_qty
      from public.supply_allocations a join public.sales_order_lines l on l.id = a.sales_order_line_id
      where l.sales_order_id = sale_order.id and a.supply_mode = 'WAREHOUSE' and a.warehouse_id = wh.warehouse_id
        and a.allocated_base_quantity > private.delivery_allocation_consumed(a.id)
      order by a.sales_order_line_id, a.created_at) x;
    delivery := public.create_delivery_from_allocations(sale_order.id, lines, at_time, md5(trace::text || ':delivery:' || wh.warehouse_id::text)::uuid);
    dispatch := private.auto_dispatch_delivery(delivery, trace);
    made := made || jsonb_build_object('delivery_id', delivery, 'number', (select d.delivery_number from public.deliveries d where d.id = delivery), 'dispatch', dispatch);
  end loop;
  return made;
end
$function$;
revoke all on function private.after_order_sourced(uuid, uuid) from public, anon, authenticated, service_role;

-- C2: the assigned worker declines a delivery job that has not started (goods not handed over yet). The job leaves their list,
-- the delivery waits for dispatch again, that worker is not proposed for it again, and the dispatchers are told why.
create or replace function public.decline_portal_work_item(target_work_item_id uuid, reason text, expected_version integer, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  work public.work_items%rowtype;
  current_assignment public.work_item_assignments%rowtype;
  d public.deliveries%rowtype;
  me uuid := private.current_employee_id();
  hash text;
  receipt public.command_receipts%rowtype;
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
  perform private.notify(d.branch_id, 'work.declined', 'delivery', d.id,
    (select e.display_name from public.employees e where e.id = me) || ' từ chối ' || d.delivery_number, trim(reason),
    '/admin/dispatch', 'delivery.assign', null, 'work.declined:' || decline_portal_work_item.operation_id);
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), d.branch_id, 'work_item.declined', 'work_item', work.id, decline_portal_work_item.operation_id,
    array['work_assignment', 'delivery_assignment', 'execution_state'], left('Thợ từ chối: ' || trim(reason), 500));
  insert into public.command_receipts values (decline_portal_work_item.operation_id, auth.uid(), 'decline_portal_work_item', hash, 'work_item', work.id, now());
  return work.id;
end
$function$;
revoke all on function public.decline_portal_work_item(uuid, text, integer, uuid) from public, anon;
grant execute on function public.decline_portal_work_item(uuid, text, integer, uuid) to authenticated;

-- Same as 20261018110000, plus auto-dispatch when no driver is given.
create or replace function public.create_delivery_for_order(
  target_sales_order_id uuid,
  target_warehouse_id uuid,
  delivery_lines jsonb,
  scheduled_at timestamptz,
  assignment jsonb,
  operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  sale_order public.sales_orders%rowtype;
  sale_line public.sales_order_lines%rowtype;
  allocation public.supply_allocations%rowtype;
  item jsonb;
  item_no integer;
  line_ids uuid[] := '{}';
  base_quantity numeric;
  covered numeric;
  allocation_id uuid;
  planned jsonb := '[]';
  delivery_id uuid;
  assignment_id uuid;
  assign_start timestamptz;
  stop_length interval;
  dispatch jsonb;
begin
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id;
  if sale_order.id is null or auth.uid() is null or not private.has_permission(sale_order.branch_id, 'delivery.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if operation_id is null or target_warehouse_id is null or scheduled_at is null or jsonb_typeof(delivery_lines) is distinct from 'array'
    or jsonb_array_length(delivery_lines) not between 1 and 50 or (assignment is not null and jsonb_typeof(assignment) <> 'object') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('order', target_sales_order_id, 'warehouse', target_warehouse_id,
    'lines', delivery_lines, 'scheduled_at', scheduled_at, 'assignment', assignment));
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = create_delivery_for_order.operation_id;
  if found then
    if receipt.command_name <> 'create_delivery_for_order' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('delivery_id', receipt.result_entity_id, 'replayed', true,
      'scheduled_at', (select d.scheduled_at from public.deliveries d where d.id = receipt.result_entity_id),
      'scheduled_end_at', (select d.scheduled_end_at from public.deliveries d where d.id = receipt.result_entity_id));
  end if;

  for item in select value from jsonb_array_elements(delivery_lines) loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) key where key <> all(array['sales_order_line_id', 'quantity']))
      or (item->>'sales_order_line_id') is null or (item->>'sales_order_line_id')::uuid = any(line_ids)
      or coalesce(item->>'quantity', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'invalid_delivery_line' using errcode = '22023';
    end if;
    line_ids := line_ids || (item->>'sales_order_line_id')::uuid;
  end loop;
  -- Same lock order as create_delivery_from_allocations: allocations, sales lines, then the order.
  perform 1 from public.supply_allocations a where a.sales_order_line_id = any(line_ids) order by a.id for update;
  perform 1 from public.sales_order_lines l where l.id = any(line_ids) order by l.id for update;
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id for update;
  if sale_order.commercial_state <> 'CONFIRMED' then raise exception 'order_not_ready_for_delivery' using errcode = '42501'; end if;

  for item, item_no in select value, ordinality from jsonb_array_elements(delivery_lines) with ordinality loop
    select * into sale_line from public.sales_order_lines l where l.id = (item->>'sales_order_line_id')::uuid;
    if sale_line.id is null or sale_line.sales_order_id <> sale_order.id then raise exception 'delivery_line_source_invalid_or_duplicate' using errcode = '23514'; end if;
    -- The quantity is typed in the unit the order was sold in; the delivery keeps base units, which must stay exact.
    perform private.require_exact_quantity((item->>'quantity')::numeric, false);
    base_quantity := trim_scale((item->>'quantity')::numeric * sale_line.conversion_numerator / sale_line.conversion_denominator);
    perform private.require_exact_quantity(base_quantity, false);

    select * into allocation from public.supply_allocations a
      where a.sales_order_line_id = sale_line.id and a.supply_mode = 'WAREHOUSE' and a.warehouse_id = target_warehouse_id
      order by a.id limit 1;
    if allocation.id is null then
      allocation_id := private.allocate_warehouse_source(sale_line.id, target_warehouse_id, base_quantity, null, null);
    else
      covered := allocation.allocated_base_quantity - private.delivery_allocation_consumed(allocation.id);
      allocation_id := allocation.id;
      if covered < base_quantity then
        perform private.allocate_warehouse_source(sale_line.id, target_warehouse_id,
          allocation.allocated_base_quantity + (base_quantity - covered), allocation.id, allocation.version);
      end if;
    end if;
    planned := planned || jsonb_build_array(jsonb_build_object('supply_allocation_id', allocation_id, 'planned_base_quantity', base_quantity));
  end loop;

  delivery_id := public.create_delivery_from_allocations(sale_order.id, planned, scheduled_at, md5(operation_id::text || ':delivery')::uuid);
  if assignment is not null then
    if exists (select 1 from jsonb_object_keys(assignment) key where key <> all(array['employee_id', 'vehicle_id', 'scheduled_start', 'scheduled_end', 'schedule_mode']))
      or coalesce(assignment->>'schedule_mode', 'AT') not in ('AT', 'NOW') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    assign_start := coalesce((assignment->>'scheduled_start')::timestamptz, scheduled_at);
    stop_length := coalesce((assignment->>'scheduled_end')::timestamptz - assign_start, private.delivery_stop_interval(sale_order.branch_id));
    if stop_length <= interval '0' then raise exception 'delivery_schedule_window_required' using errcode = '22023'; end if;
    -- F2 "Giao ngay": a busy driver or vehicle gets this stop right after what they already have, instead of a clash.
    if assignment->>'schedule_mode' = 'NOW' then
      assign_start := private.next_free_start(sale_order.branch_id, (assignment->>'employee_id')::uuid, (assignment->>'vehicle_id')::uuid,
        greatest(assign_start, now()), stop_length, delivery_id);
    end if;
    assignment_id := public.assign_delivery_scheduled(delivery_id, (assignment->>'employee_id')::uuid, (assignment->>'vehicle_id')::uuid, null, null,
      (select d.version from public.deliveries d where d.id = delivery_id), md5(operation_id::text || ':assign')::uuid,
      assign_start, assign_start + stop_length);
  end if;

  -- F3/D22: no driver chosen → the branch's auto-dispatch (AUTO assigns, SUGGEST proposes, OFF leaves it to the dispatcher).
  if assignment is null then dispatch := private.auto_dispatch_delivery(delivery_id, operation_id); end if;
  insert into public.command_receipts values (operation_id, auth.uid(), 'create_delivery_for_order', payload_hash, 'delivery', delivery_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), sale_order.branch_id, 'delivery.create_for_order', 'deliveries', delivery_id, operation_id,
    array_remove(array['supply_allocations', 'delivery_lines', case when assignment is not null then 'assignment' end], null), null);
  return jsonb_build_object('delivery_id', delivery_id, 'assignment_id', assignment_id, 'replayed', false, 'dispatch', dispatch,
    'scheduled_at', (select d.scheduled_at from public.deliveries d where d.id = delivery_id),
    'scheduled_end_at', (select d.scheduled_end_at from public.deliveries d where d.id = delivery_id));
end
$function$;

revoke all on function public.create_delivery_for_order(uuid, uuid, jsonb, timestamptz, jsonb, uuid) from public, anon;
grant execute on function public.create_delivery_for_order(uuid, uuid, jsonb, timestamptz, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
