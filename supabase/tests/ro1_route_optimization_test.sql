begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

select has_table('public', 'route_plans', 'RO1 stores a non-authoritative route plan');
select has_table('public', 'route_plan_stops', 'RO1 stores ordered delivery references');
select has_table('public', 'route_plan_events', 'RO1 records route lifecycle history');
select has_column('public', 'route_plans', 'vehicle_id', 'Plan references its vehicle');
select has_column('public', 'route_plans', 'driver_user_id', 'Plan references its driver');
select has_column('public', 'route_plan_stops', 'delivery_id', 'Stop references the P7 Delivery');
select has_column('public', 'route_plan_stops', 'stop_sequence', 'Stop retains its recommendation order');

select has_function('app_private', 'create_route_plan', array['date', 'uuid', 'uuid', 'uuid[]', 'jsonb', 'text', 'uuid'], 'Route creation is a private command');
select has_function('app_private', 'approve_route_plan', array['uuid', 'text', 'uuid'], 'Approval is a private command');
select has_function('app_private', 'apply_route_plan', array['uuid', 'text', 'uuid'], 'Apply is a private command');

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.route_plans'::regclass,
    'public.route_plan_stops'::regclass,
    'public.route_plan_events'::regclass
  )),
  'All RO1 public planning records have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.route_plans', 'INSERT')
  and not has_table_privilege('authenticated', 'public.route_plan_stops', 'INSERT')
  and not has_table_privilege('authenticated', 'public.route_plan_events', 'INSERT'),
  'Browser clients cannot write RoutePlan records directly'
);
select ok(
  has_table_privilege('authenticated', 'public.route_plans', 'SELECT')
  and has_table_privilege('authenticated', 'public.route_plan_stops', 'SELECT'),
  'Approved route projections are available behind RLS'
);
select ok(
  not exists (
    select 1 from pg_constraint constraint_row
    join pg_class source on source.oid = constraint_row.conrelid
    join pg_class target on target.oid = constraint_row.confrelid
    where source.relname in ('route_plans', 'route_plan_stops')
      and target.relname in ('work_items', 'work_assignments')
  ),
  'RoutePlan does not own P10 work assignment records'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'route_plan_stops_delivery_idx'
  ),
  'Delivery reference lookup is indexed'
);
select ok(
  not exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname in ('create_route_plan', 'approve_route_plan', 'apply_route_plan')
      and procedure.prosecdef
  ),
  'RO1 command functions run as security invoker'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'route_plans_read_dispatcher_or_own_driver'),
  'Dispatcher and own approved driver are the only route plan readers'
);
select ok(
  position('app_private.assign_delivery(' in pg_get_functiondef('app_private.apply_route_plan(uuid, text, uuid)'::regprocedure)) > 0,
  'Applying a route delegates assignment to the existing P7 command'
);
select ok(
  position('POOL_CLAIM_REQUIRES_EXPLICIT_WORKFLOW' in pg_get_functiondef('app_private.apply_route_plan(uuid, text, uuid)'::regprocedure)) > 0,
  'Pool-claim work is rejected during route apply'
);
select ok(
  position('insert into public.delivery_assignments' in lower(pg_get_functiondef('app_private.apply_route_plan(uuid, text, uuid)'::regprocedure))) = 0
  and position('update public.deliveries' in lower(pg_get_functiondef('app_private.apply_route_plan(uuid, text, uuid)'::regprocedure))) = 0,
  'RO1 apply does not directly mutate P7 Delivery or assignment tables'
);
select ok(
  exists (select 1 from public.permissions where code = 'route_plan.manage'),
  'Route management permission is explicitly granted by role, not browser state'
);

select * from finish(true);
rollback;
