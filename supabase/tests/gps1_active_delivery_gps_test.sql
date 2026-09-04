begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

select has_table('public', 'current_vehicle_locations', 'GPS1 stores one current location per vehicle');
select has_table('public', 'vehicle_location_pings', 'GPS1 keeps a short telemetry history');
select has_table('public', 'vehicle_location_retention_holds', 'GPS1 supports audit/dispute retention holds');
select has_column('public', 'current_vehicle_locations', 'vehicle_id', 'Current location references a vehicle');
select has_column('public', 'current_vehicle_locations', 'worker_user_id', 'Current location records the resolved worker');
select has_column('public', 'current_vehicle_locations', 'delivery_id', 'Current location records the active Delivery');
select has_column('public', 'current_vehicle_locations', 'recorded_at', 'Current location carries its recorded timestamp');
select has_column('public', 'vehicle_location_pings', 'accuracy_m', 'Telemetry keeps accuracy for operational context');

select has_function('app_private', 'record_active_delivery_location', array['numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'timestamp with time zone', 'uuid'], 'GPS ingest is an app-private command');
select has_function('app_private', 'purge_vehicle_location_pings', array['timestamp with time zone', 'uuid'], 'Retention purge is an app-private command');
select has_view('public', 'active_vehicle_location_view', 'Authorized fleet projection is a view');

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.current_vehicle_locations'::regclass,
    'public.vehicle_location_pings'::regclass,
    'public.vehicle_location_retention_holds'::regclass
  )),
  'All GPS1 public telemetry records have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.current_vehicle_locations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.current_vehicle_locations', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.vehicle_location_pings', 'INSERT')
  and not has_table_privilege('authenticated', 'public.vehicle_location_pings', 'DELETE'),
  'Browser clients cannot write or purge GPS telemetry directly'
);
select ok(
  has_table_privilege('authenticated', 'public.current_vehicle_locations', 'SELECT')
  and has_table_privilege('authenticated', 'public.vehicle_location_pings', 'SELECT')
  and has_table_privilege('authenticated', 'public.active_vehicle_location_view', 'SELECT'),
  'Authorized projections are available behind RLS'
);
select ok(
  coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.active_vehicle_location_view'::regclass), false),
  'Fleet view honors underlying RLS with security invoker'
);
select ok(
  not exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname in ('record_active_delivery_location', 'purge_vehicle_location_pings')
      and procedure.prosecdef
  ),
  'GPS commands run as security invoker'
);
select ok(
  position('assignment.driver_user_id = p_actor_id' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamp with time zone, uuid)'::regprocedure))) > 0
  and position('delivery.status in (''dispatched'', ''arrived'')' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamp with time zone, uuid)'::regprocedure))) > 0,
  'GPS command resolves one assigned active Delivery from the authenticated server actor'
);
select ok(
  position('gps_ping_throttled' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamp with time zone, uuid)'::regprocedure))) > 0,
  'GPS command throttles successive telemetry writes'
);
select ok(
  position('update public.deliveries' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamp with time zone, uuid)'::regprocedure))) = 0
  and position('update public.delivery_assignments' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamp with time zone, uuid)'::regprocedure))) = 0
  and position('update public.work_' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamp with time zone, uuid)'::regprocedure))) = 0,
  'GPS ingest never changes P7 Delivery or P10 work truth'
);
select ok(
  position('now() - interval ''30 days''' in lower(pg_get_functiondef('app_private.purge_vehicle_location_pings(timestamp with time zone, uuid)'::regprocedure))) > 0
  and position('vehicle_location_retention_holds' in lower(pg_get_functiondef('app_private.purge_vehicle_location_pings(timestamp with time zone, uuid)'::regprocedure))) > 0,
  'Retention purge retains active audit/dispute holds and rejects a shorter window'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'current_vehicle_locations_delivery_idx')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'vehicle_location_pings_delivery_idx')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'vehicle_location_pings_retention_idx'),
  'Dispatcher and retention lookup paths are indexed'
);
select ok(
  exists (select 1 from public.permissions where code = 'gps.location.submit')
  and exists (select 1 from public.permissions where code = 'gps.location.read_fleet'),
  'GPS permissions are explicit operational capabilities'
);
select ok(
  exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code = 'DRIVER' and permission.code = 'gps.location.submit'
  )
  and exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('OWNER_ADMIN', 'SUPERVISOR', 'DISPATCHER') and permission.code = 'gps.location.read_fleet'
  ),
  'Only drivers submit and dispatch roles read the fleet'
);
select ok(
  position('now() - ''00:01:30''::interval' in lower(pg_get_viewdef('public.active_vehicle_location_view'::regclass, true))) > 0
  and position('then ''live''::text' in lower(pg_get_viewdef('public.active_vehicle_location_view'::regclass, true))) > 0
  and position('now() - ''00:15:00''::interval' in lower(pg_get_viewdef('public.active_vehicle_location_view'::regclass, true))) > 0
  and position('then ''stale''::text' in lower(pg_get_viewdef('public.active_vehicle_location_view'::regclass, true))) > 0,
  'Fleet view marks stale telemetry instead of rendering old positions as live'
);

select * from finish(true);
rollback;
