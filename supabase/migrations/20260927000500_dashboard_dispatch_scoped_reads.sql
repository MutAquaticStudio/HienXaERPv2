create function public.dashboard_site_options(target_branch_id uuid)
returns table(id uuid, customer_id uuid, name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_permission(target_branch_id, 'dashboard.read') then
    raise exception 'dashboard_forbidden' using errcode = '42501';
  end if;
  return query
    select s.id, s.customer_id, s.name
    from public.customer_sites s
    join public.customers c on c.id = s.customer_id
    where c.branch_id = target_branch_id and s.active
    order by s.name, s.id
    limit 300;
end;
$$;

create function public.dispatch_board_page(
  target_branch_id uuid, target_bucket text, target_q text,
  target_offset integer, target_limit integer
) returns table(
  id uuid, delivery_number text, customer_name_snapshot text,
  site_name_snapshot text, execution_state text, result_kind text, scheduled_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  safe_offset integer := greatest(0, least(coalesce(target_offset, 0), 250000));
  safe_limit integer := greatest(1, least(coalesce(target_limit, 26), 26));
  q text := coalesce(target_q, '');
begin
  if not private.has_permission(target_branch_id, 'delivery.read')
     or target_bucket not in ('planned', 'assigned', 'active', 'exception')
     or length(q) > 80 then
    raise exception 'dispatch_forbidden' using errcode = '42501';
  end if;

  if target_bucket = 'planned' and q = '' then
    return query
      select d.id, d.delivery_number, d.customer_name_snapshot, d.site_name_snapshot,
        d.execution_state, d.result_kind, d.scheduled_at
      from public.deliveries d
      where d.branch_id = target_branch_id and d.execution_state = 'PLANNED'
      order by d.scheduled_at asc nulls last, d.id asc
      offset safe_offset limit safe_limit;
  else
    return query
      select d.id, d.delivery_number, d.customer_name_snapshot, d.site_name_snapshot,
        d.execution_state, d.result_kind, d.scheduled_at
      from public.deliveries d
      where d.branch_id = target_branch_id and d.execution_state <> 'CANCELLED'
        and (
          (target_bucket = 'planned' and d.execution_state = 'PLANNED')
          or (target_bucket = 'assigned' and d.execution_state = 'ASSIGNED')
          or (target_bucket = 'active' and d.execution_state in ('DISPATCHED', 'ARRIVED', 'RESULT_SUBMITTED'))
          or (target_bucket = 'exception' and d.result_kind in ('PARTIAL', 'FAILED'))
        )
        and (q = '' or d.delivery_number ilike '%' || q || '%'
          or d.customer_name_snapshot ilike '%' || q || '%'
          or d.site_name_snapshot ilike '%' || q || '%')
      order by d.scheduled_at asc nulls last, d.id asc
      offset safe_offset limit safe_limit;
  end if;
end;
$$;

revoke all on function public.dashboard_site_options(uuid), public.dispatch_board_page(uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.dashboard_site_options(uuid), public.dispatch_board_page(uuid, text, text, integer, integer)
  to authenticated;
