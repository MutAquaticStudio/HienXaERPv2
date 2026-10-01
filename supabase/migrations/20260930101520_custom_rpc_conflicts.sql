-- Business conflicts must not trigger PostgREST serialization retries.
-- Preserve genuine SQLSTATE 40001 handlers; only explicit custom raises change.
do $migration$
declare
  custom_error_pattern constant text := $pattern$errcode[[:space:]]*=[[:space:]]*'40001'$pattern$;
  conflict_error constant text := $replacement$errcode = 'PT409'$replacement$;
  required_names constant text[] := array[
    'apply_route_plan', 'approve_earning_event', 'approve_expense', 'approve_invoice_business',
    'approve_stock_count', 'assign_delivery', 'assign_work_item', 'cancel_invoice_draft',
    'claim_work_item', 'create_route_plan', 'handoff_delivery', 'mark_delivery_arrived',
    'record_gps_ping', 'record_stock_count_line', 'release_inventory_reservation',
    'request_quotation_change', 'resolve_return_case', 'review_payment_notice',
    'start_work_item', 'submit_delivery_result', 'submit_work_result',
    'upsert_supply_allocation', 'verify_delivery', 'verify_service_job'
  ];
  optional_names constant text[] := array['cancel_planned_delivery', 'cancel_scheduled_service_job'];
  routine record;
  definitions text[] := array[]::text[];
  missing_names text[];
  source_sql text;
  routine_count integer := 0;
  site_count integer := 0;
  routine_sites integer;
begin
  select array_agg(expected.name) into missing_names
  from unnest(required_names) as expected(name)
  where (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = expected.name) <> 1;
  if missing_names is not null then
    raise exception 'Missing or overloaded conflict RPCs: %', missing_names;
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = any(optional_names)
    group by p.proname having count(*) > 1
  ) then
    raise exception 'Unexpected overloaded optional conflict RPC';
  end if;

  -- Collect and validate the complete scope before replacing any definition.
  for routine in
    select p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
    order by p.proname, p.oid
  loop
    select count(*) into routine_sites
    from regexp_matches(routine.definition, custom_error_pattern, 'gi');
    if routine_sites = 0 then continue; end if;
    if not (routine.proname = any(required_names || optional_names)) then
      raise exception 'Unexpected custom 40001 RPC: %', routine.proname;
    end if;
    routine_count := routine_count + 1;
    site_count := site_count + routine_sites;
    definitions := array_append(definitions, routine.definition);
  end loop;

  foreach source_sql in array definitions loop
    execute regexp_replace(source_sql, custom_error_pattern, conflict_error, 'gi');
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* custom_error_pattern
  ) then
    raise exception 'Custom 40001 remains in a public function';
  end if;
  raise notice 'Custom conflict codes replaced: % functions, % sites', routine_count, site_count;
end
$migration$;
