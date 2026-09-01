begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

select has_table('public', 'order_profitability', 'Order profitability projection exists');
select has_table('public', 'profitability_cost_entries', 'Immutable direct-cost evidence exists');
select has_table('public', 'profitability_lifecycle_events', 'Lifecycle audit exists');
select has_table('public', 'profitability_revenue_allocations', 'Dimension revenue evidence exists');
select has_type('public', 'profitability_lifecycle', 'Profitability lifecycle is explicit');
select has_type('public', 'profitability_basis', 'Quoted, committed and actual bases are explicit');
select has_type('public', 'direct_cost_category', 'Direct-cost categories are explicit');

select has_function('app_private', 'initialize_order_profitability', array['uuid', 'uuid'], 'Projection initialization is controlled');
select has_function('app_private', 'capture_actual_profitability_for_delivery', array['uuid', 'uuid'], 'Actual delivery evidence is captured');
select has_function('app_private', 'record_profitability_direct_cost', array['uuid', 'profitability_basis', 'direct_cost_category', 'numeric', 'uuid', 'uuid', 'uuid', 'uuid', 'uuid', 'text', 'timestamp with time zone', 'uuid'], 'Direct costs use a command');
select has_function('app_private', 'finalize_order_profitability', array['uuid', 'text', 'uuid'], 'Profitability can be finalized explicitly');
select has_function('app_private', 'reopen_order_profitability', array['uuid', 'text', 'uuid'], 'Finalized profitability can be reopened explicitly');
select has_function(
  'app_private', 'record_profitability_revenue_allocation',
  array['uuid', 'uuid', 'numeric', 'text', 'uuid'],
  'Service revenue attribution uses a controlled command'
);

select has_view('public', 'profitability_order_summary', 'Order margin view exists');
select has_view('public', 'profitability_direct_cost_waterfall', 'Direct-cost waterfall exists');
select has_view('public', 'profitability_dimension_summary', 'Dimension drill-down exists');
select has_view('public', 'profitability_command_center', 'Owner and Finance command center exists');
select has_trigger('public', 'delivery_readiness_events', 'zz_delivery_completed_capture_profitability', 'Delivery completion captures profitability after finance');
select has_trigger('public', 'profitability_cost_entries', 'profitability_cost_entries_immutable', 'Direct-cost history is immutable');
select has_trigger('public', 'profitability_lifecycle_events', 'profitability_lifecycle_events_immutable', 'Lifecycle history is immutable');

select ok(
  not has_table_privilege('authenticated', 'public.order_profitability', 'INSERT')
    and not has_table_privilege('authenticated', 'public.order_profitability', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.profitability_cost_entries', 'INSERT')
    and not has_table_privilege('authenticated', 'public.profitability_cost_entries', 'UPDATE'),
  'Browser clients cannot mutate profitability directly'
);
select ok(
  has_table_privilege('authenticated', 'public.order_profitability', 'SELECT')
    and has_table_privilege('authenticated', 'public.profitability_command_center', 'SELECT'),
  'Authenticated margin reads are available behind RLS'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('DRIVER', 'OPERATOR_WORKER')
      and permission.code = 'profitability.manage'$$,
  $$values (0::bigint)$$,
  'Workers receive no profitability mutation permission'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('OWNER_ADMIN', 'FINANCE')
      and permission.code in ('margin.read', 'profitability.manage')$$,
  $$values (4::bigint)$$,
  'Owner and Finance receive margin and profitability permissions'
);
select results_eq(
  $$select count(*)::bigint from unnest(enum_range(null::public.direct_cost_category)) category
    where category::text ilike '%overhead%' or category::text ilike '%general%'$$,
  $$values (0::bigint)$$,
  'General overhead cannot be faked into direct-cost categories'
);
select ok(
  (select count(*) > 0 from public.profitability_command_center)
    and (
      select count(*) = count(distinct currency)
      from public.profitability_command_center
    ),
  'Command center exposes one consolidated row per currency'
);

select * from finish(true);
rollback;
