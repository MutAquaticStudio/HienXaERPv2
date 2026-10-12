begin;
create or replace function private.delivery_has_unresolved_exception(did uuid) returns boolean
 language sql stable security definer set search_path='' as $exception$
 select exists(select 1 from public.return_cases r where r.state='OPEN' and r.delivery_line_id in(select id from public.delivery_lines where delivery_id=did))
 or exists(select 1 from public.deliveries d where d.id=did and d.execution_state='VERIFIED' and(
  exists(select 1 from public.inventory_movements m where m.delivery_id=d.id and m.location_kind='IN_TRANSIT'
   group by m.material_id,m.base_uom_id having sum(m.base_quantity_delta)<>0 or sum(m.inventory_value_delta_vnd)<>0)
  or exists(select 1 from public.delivery_verification_lines v join public.delivery_lines l on l.id=v.delivery_line_id
   left join public.delivery_handoff_lines h on h.delivery_line_id=l.id where l.delivery_id=d.id
   and coalesce(h.moved_base_quantity,v.actual_base_quantity)-v.accepted_base_quantity>
    coalesce((select sum(r.base_quantity) from public.return_cases r where r.delivery_line_id=l.id
      and r.case_kind in('TRANSIT_REMAINDER','TRANSIT_LOSS') and r.state in('RETURNED','LOSS_APPROVED')),0))
 ))
 or exists(select 1 from public.deliveries d where d.id=did and d.execution_state='RESULT_SUBMITTED' and d.result_kind in('PARTIAL','FAILED'))
$exception$;
notify pgrst,'reload schema';
commit;
