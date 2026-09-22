create or replace function public.my_active_delivery_assignments()
returns table(
  delivery_id uuid,
  assignment_version integer,
  delivery_number text,
  customer_name text,
  site_name text,
  address_text text,
  execution_state text,
  scheduled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.current_employee_id() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select d.id, a.assignment_version, d.delivery_number, d.customer_name_snapshot,
      d.site_name_snapshot, d.delivery_address_snapshot, d.execution_state, d.scheduled_at
    from public.delivery_assignments a
    join public.deliveries d on d.id = a.delivery_id
    where a.employee_id = private.current_employee_id()
      and a.superseded_at is null
      and d.execution_state in ('ASSIGNED','DISPATCHED','ARRIVED','RESULT_SUBMITTED')
    order by d.scheduled_at asc nulls last, d.id
    limit 50;
end
$$;

revoke all on function public.my_active_delivery_assignments() from public, anon, authenticated;
grant execute on function public.my_active_delivery_assignments() to authenticated;
