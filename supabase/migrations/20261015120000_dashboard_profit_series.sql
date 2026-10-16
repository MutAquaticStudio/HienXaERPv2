-- Dashboard line chart (owner decision D3, 2026-10-15): Thu / Chi / Lợi nhuận per day, week or month.
-- Every point is one call of finance_dashboard_snapshot, so formulas, permissions and quality rules stay
-- identical to the KPI cards. Chi = direct_cost + operating_expense and carries operating_profit's quality,
-- hence Lợi nhuận = Thu - Chi whenever the point is READY.
begin;

create or replace function public.finance_dashboard_series(
  target_branch_id uuid,
  from_inclusive timestamptz,
  to_exclusive timestamptz,
  knowledge_cutoff timestamptz,
  target_customer_id uuid default null,
  target_site_id uuid default null,
  target_sales_employee_id uuid default null,
  target_activity_kind text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  zone constant text := 'Asia/Ho_Chi_Minh';
  local_from timestamp := from_inclusive at time zone zone;
  local_to timestamp := to_exclusive at time zone zone;
  local_now timestamp := now() at time zone zone;
  granularity text;
  starts timestamp[] := '{}';
  ends timestamp[] := '{}';
  cursor_local timestamp;
  next_local timestamp;
  snap jsonb;
  profit jsonb;
  points jsonb := '[]'::jsonb;
begin
  if from_inclusive >= to_exclusive then raise exception 'invalid_report_period' using errcode = '22023'; end if;
  if to_exclusive - from_inclusive <= interval '31 days' then granularity := 'DAY';
  elsif to_exclusive - from_inclusive <= interval '217 days' then granularity := 'WEEK';
  else granularity := 'MONTH';
  end if;

  -- Bounds first (cheap), so an over-long period fails before any snapshot runs. Future buckets are omitted.
  cursor_local := local_from;
  while cursor_local < local_to and cursor_local < local_now loop
    next_local := case granularity
      when 'DAY' then cursor_local + interval '1 day'
      when 'WEEK' then cursor_local + interval '7 days'
      else date_trunc('month', cursor_local) + interval '1 month' end;
    if next_local > local_to then next_local := local_to; end if;
    starts := starts || cursor_local;
    ends := ends || next_local;
    if cardinality(starts) > 31 then raise exception 'report_period_too_long' using errcode = '22023'; end if;
    cursor_local := next_local;
  end loop;

  for i in 1 .. coalesce(cardinality(starts), 0) loop
    snap := public.finance_dashboard_snapshot(target_branch_id, starts[i] at time zone zone, ends[i] at time zone zone,
      knowledge_cutoff, target_customer_id, target_site_id, target_sales_employee_id, target_activity_kind);
    profit := snap -> 'operating_profit';
    points := points || jsonb_build_array(jsonb_build_object(
      'start', starts[i] at time zone zone,
      'end', ends[i] at time zone zone,
      'revenue', snap -> 'revenue',
      'total_cost', jsonb_build_object(
        'value_vnd', case when profit ->> 'quality' = 'READY'
          then ((snap -> 'direct_cost' ->> 'value_vnd')::bigint + (snap -> 'operating_expense' ->> 'value_vnd')::bigint)::text end,
        'quality', profit ->> 'quality'),
      'net_profit', profit));
  end loop;

  return jsonb_build_object('granularity', granularity, 'from', from_inclusive, 'to', to_exclusive, 'points', points);
end
$function$;

revoke all on function public.finance_dashboard_series(uuid, timestamptz, timestamptz, timestamptz, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.finance_dashboard_series(uuid, timestamptz, timestamptz, timestamptz, uuid, uuid, uuid, text) to authenticated;

commit;
