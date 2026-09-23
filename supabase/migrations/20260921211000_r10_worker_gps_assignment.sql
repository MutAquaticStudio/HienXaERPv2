create or replace function public.my_active_gps_assignment(target_work_item_id uuid)
returns table(delivery_id uuid, assignment_version integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.current_employee_id() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select d.id, a.assignment_version
    from public.work_items w
    join public.deliveries d on d.id = w.delivery_id
    join public.delivery_assignments a on a.delivery_id = d.id and a.superseded_at is null
    where w.id = target_work_item_id
      and a.employee_id = private.current_employee_id()
      and d.execution_state in ('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
    limit 1;
end
$$;

revoke all on function public.my_active_gps_assignment(uuid) from public, anon, authenticated;
grant execute on function public.my_active_gps_assignment(uuid) to authenticated;
