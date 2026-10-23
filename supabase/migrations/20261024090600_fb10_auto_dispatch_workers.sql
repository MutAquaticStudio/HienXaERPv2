-- FB10 (6.1): "Tự chia việc" assigned nobody although two workers were free. On Production no vehicle has a default
-- driver, and auto-dispatch only paired a vehicle with its default driver, so it had no candidate at all. Two vehicles
-- also had no capacity note (the vehicle form stopped asking for it in FB5), which every assignment rejects.
-- Now:
-- * candidates are every active vehicle with a capacity × (its default driver first, then every active worker of the
--   branch who can take jobs — by role or by an extra "work.claim" grant — and has an account); office staff who manage
--   roles are not sent on trips; the earliest free start wins, then the fewest jobs that day;
-- * an extra "work.claim" grant counts for taking delivery jobs, as on the worker portal;
-- * a vehicle with a capacity always has a capacity note (filled in when missing), so it can be assigned.
begin;

create or replace function private.employee_can_report_work(target_employee_id uuid,target_branch_id uuid) returns boolean
language sql stable security definer set search_path='' as $body$
 select exists(select 1 from public.employees e join public.employee_branch_access a on a.employee_id=e.id and a.active
  join public.branches b on b.id=a.branch_id and b.active
  where e.id=target_employee_id and e.active and e.auth_user_id is not null and a.branch_id=target_branch_id
   and (exists(select 1 from public.roles r join public.role_permissions rp on rp.role_id=r.id where r.id=a.role_id and r.active and rp.permission_code='work.claim')
    or exists(select 1 from public.employee_permission_grants g where g.employee_id=e.id and g.branch_id=target_branch_id and g.permission_code='work.claim')))
$body$;
revoke all on function private.employee_can_report_work(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.default_vehicle_capacity_note() returns trigger
language plpgsql set search_path='' as $function$
begin
  if new.capacity_quantity is not null and nullif(trim(coalesce(new.capacity_source_note,'')),'') is null then
    new.capacity_source_note:='Sức chở khai báo trên xe';
  end if;
  return new;
end $function$;
drop trigger if exists vehicle_default_capacity_note on public.vehicles;
create trigger vehicle_default_capacity_note before insert or update of capacity_quantity,capacity_source_note on public.vehicles
  for each row execute function private.default_vehicle_capacity_note();
update public.vehicles set capacity_source_note='Sức chở khai báo trên xe'
  where capacity_quantity is not null and nullif(trim(coalesce(capacity_source_note,'')),'') is null;

drop function if exists private.dispatch_candidates(uuid);
create function private.dispatch_candidates(target_delivery_id uuid)
returns table(vehicle_id uuid, vehicle_code text, plate_number text, employee_id uuid, employee_name text, start_at timestamptz, end_at timestamptz,
  day_count integer, same_site boolean, default_driver boolean)
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
    select x.id, x.code, x.plate_number, e.id as driver, e.display_name, (e.id = x.default_driver_employee_id) as is_default
    from public.vehicles x
    join public.employees e on e.active and e.auth_user_id is not null
    where x.branch_id = d.branch_id and x.active and x.capacity_quantity is not null and x.capacity_verified_at is not null
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
revoke all on function private.dispatch_candidates(uuid) from public, anon, authenticated, service_role;

create or replace function private.auto_dispatch_delivery(target_delivery_id uuid, trace uuid, forced_mode text default null) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  d public.deliveries%rowtype;
  mode text;
  c record;
  refusal text;
  last_refusal text;
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
  for c in select * from private.dispatch_candidates(d.id) x
    order by x.start_at, x.default_driver desc, x.day_count, x.same_site desc, x.vehicle_code, x.employee_name, x.vehicle_id, x.employee_id limit 60 loop
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
    last_refusal := refusal;
  end loop;
  reason := case when tried = 0 then 'Chưa có xe có sức chở hoặc thợ có tài khoản nhận việc giao hàng. Kiểm tra danh sách xe và thợ.'
    when last_refusal like 'vehicle_capacity_exceeded%' then 'Hàng vượt sức chở của mọi xe. Chia phiếu nhỏ hơn hoặc phân xe tay.'
    when last_refusal like 'vehicle_capacity_conversion_missing%' then 'Chưa quy đổi được đơn vị hàng sang đơn vị sức chở của xe. Thêm quy đổi cho vật tư hoặc phân xe tay.'
    when last_refusal like '%collision%' or last_refusal like '%schedule%' then 'Xe và thợ đều kín lịch trong ngày. Đổi giờ giao hoặc phân xe tay.'
    else 'Không xe/thợ nào nhận được phiếu này. Phân xe tay trên phiếu.' end;
  perform private.notify(d.branch_id, 'delivery.waiting_dispatch', 'delivery', d.id, d.delivery_number || ' chờ điều phối',
    reason, '/admin/deliveries/' || d.id, 'delivery.assign', null, 'delivery.waiting_dispatch:' || d.id || ':' || trace);
  return jsonb_build_object('status', 'WAITING', 'tried', tried, 'reason', reason);
end
$function$;
revoke all on function private.auto_dispatch_delivery(uuid, uuid, text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
