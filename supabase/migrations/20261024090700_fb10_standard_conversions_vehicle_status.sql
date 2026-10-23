-- FB10 (6.2): a truck that carries "5 tấn" must take goods sold in bao or kg. The capacity check walks the material's own
-- conversions and the shared ones (material left empty), but no shared weight conversion existed, so a material with
-- only "1 bao = 50 kg" could not be measured against a truck in tấn (Production log: vehicle_capacity_conversion_missing).
-- This adds the exact shared conversions between the weight units in use (kg, yến, tạ, tấn) and between lít and khối
-- (m³), found by unit code, once. Bao, viên, khối of sand stay material-specific: their weight depends on the material.
-- It also gives the delivery forms a vehicle status ("Đang giao PG-… đến HH:MM" / "Rảnh") for the vehicle pickers.
begin;

create or replace function private.seed_standard_conversions() returns integer
language plpgsql security definer set search_path='' as $seed$
declare pair record; added integer:=0;
begin
  for pair in select f.id from_id, t.id to_id, x.num, x.den from (values
      ('kg','tan',1::numeric,1000::numeric),('yen','tan',1,100),('ta','tan',1,10),('kg','ta',1,100),('kg','yen',1,10),('yen','ta',1,10),
      ('lit','khoi',1,1000),('l','khoi',1,1000),('lit','m3',1,1000),('l','m3',1,1000)) x(from_code,to_code,num,den)
    join public.units_of_measure f on f.code=x.from_code join public.units_of_measure t on t.code=x.to_code
  loop
    if not exists (select 1 from public.material_uom_conversions c where c.material_id is null and c.active
        and ((c.from_uom_id=pair.from_id and c.to_uom_id=pair.to_id) or (c.from_uom_id=pair.to_id and c.to_uom_id=pair.from_id))) then
      insert into public.material_uom_conversions(material_id,from_uom_id,to_uom_id,numerator,denominator,conversion_type,settlement_allowed,source_note)
      values (null,pair.from_id,pair.to_id,pair.num,pair.den,'EXACT',true,'Quy đổi chuẩn');
      added:=added+1;
    end if;
  end loop;
  return added;
end
$seed$;
revoke all on function private.seed_standard_conversions() from public,anon,authenticated,service_role;
select private.seed_standard_conversions();

-- One row per vehicle: the delivery it is on now or next today, and until when.
create or replace view public.vehicle_status_read with(security_barrier=true) as
select v.branch_id,v.id vehicle_id,v.code,v.plate_number,v.capacity_quantity::text capacity_quantity,u.symbol capacity_symbol,
  busy.delivery_number busy_delivery_number,busy.execution_state busy_state,busy.busy_until
from public.vehicles v
left join public.units_of_measure u on u.id=v.capacity_uom_id
left join lateral (select d.delivery_number,d.execution_state,coalesce(d.scheduled_end_at,d.scheduled_at+make_interval(mins=>coalesce((select s.stop_minutes from public.branch_operation_settings s where s.branch_id=d.branch_id),60))) busy_until
  from public.delivery_assignments a join public.deliveries d on d.id=a.delivery_id
  where a.vehicle_id=v.id and a.superseded_at is null and d.execution_state in ('ASSIGNED','DISPATCHED','ARRIVED')
    and (d.execution_state in ('DISPATCHED','ARRIVED') or (d.scheduled_at at time zone 'Asia/Ho_Chi_Minh')::date=(now() at time zone 'Asia/Ho_Chi_Minh')::date)
  order by (d.execution_state in ('DISPATCHED','ARRIVED')) desc,d.scheduled_at limit 1) busy on true
where v.active and private.has_permission(v.branch_id,'delivery.read');
revoke all on public.vehicle_status_read from anon,public;
grant select on public.vehicle_status_read to authenticated;

notify pgrst,'reload schema';
commit;
