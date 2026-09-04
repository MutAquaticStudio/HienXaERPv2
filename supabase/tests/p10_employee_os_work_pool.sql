begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

select has_type('public', 'work_item_status', 'Work status lifecycle is explicit');
select has_type('public', 'work_claim_status', 'Claim lifecycle is explicit');
select has_type('public', 'work_assignment_mode', 'Direct and pool assignments are explicit');
select has_type('public', 'work_supervisor_action', 'Supervisor decisions are explicit');
select has_table('public', 'work_requirements', 'Work requirements exist');
select has_table('public', 'work_items', 'Work items exist');
select has_table('public', 'work_claims', 'Work claims exist');
select has_table('public', 'work_assignments', 'Work assignments exist');
select has_table('public', 'work_heartbeats', 'Heartbeat history exists');
select has_table('public', 'work_verifications', 'Verification evidence exists');
select has_table('public', 'work_item_state_events', 'Work state history exists');
select has_table('public', 'work_notifications', 'Actionable notifications exist');
select has_table('public', 'work_active_limits', 'Role capacity policy exists');

select has_function('app_private', 'worker_is_eligible_for_work', array['uuid', 'uuid', 'boolean'], 'Eligibility is centralized');
select has_function('app_private', 'claim_work_item', array['uuid', 'uuid', 'text'], 'Atomic claim command exists');
select has_function('app_private', 'start_work_item', array['uuid', 'uuid'], 'Start command exists');
select has_function('app_private', 'record_work_heartbeat', array['uuid', 'uuid', 'text'], 'Heartbeat command exists');
select has_function('app_private', 'block_work_item', array['uuid', 'uuid', 'text'], 'Worker can report a block');
select has_function('app_private', 'complete_work_item', array['uuid', 'uuid'], 'Completion command exists');
select has_function('app_private', 'verify_work_item', array['uuid', 'text', 'uuid'], 'Verification command exists');
select has_function('app_private', 'resolve_work_item', array['uuid', 'work_supervisor_action', 'uuid', 'text', 'uuid'], 'Supervisor resolution exists');
select has_function('app_private', 'sweep_work_item_timeouts', array['uuid', 'timestamp with time zone'], 'Lease and heartbeat sweep exists');

select has_view('public', 'work_item_operational_view', 'RLS-backed operational read model exists');
select has_view('public', 'work_notification_view', 'RLS-backed notification read model exists');
select has_view('public', 'workforce_worker_view', 'Supervisor worker roster exists');
select has_trigger('public', 'delivery_readiness_events', 'delivery_readiness_create_work_item', 'P7 readiness creates P10 coordination work');
select has_trigger('public', 'work_heartbeats', 'work_heartbeats_immutable', 'Heartbeat history is immutable');
select has_trigger('public', 'work_verifications', 'work_verifications_immutable', 'Verification evidence is immutable');
select has_trigger('public', 'work_item_state_events', 'work_item_state_events_immutable', 'State history is immutable');

select ok(
  not has_table_privilege('authenticated', 'public.work_items', 'INSERT')
    and not has_table_privilege('authenticated', 'public.work_items', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.work_claims', 'INSERT')
    and not has_table_privilege('authenticated', 'public.work_heartbeats', 'INSERT'),
  'Browser clients cannot mutate work state directly'
);
select ok(
  has_table_privilege('authenticated', 'public.work_item_operational_view', 'SELECT')
    and has_table_privilege('authenticated', 'public.work_notification_view', 'SELECT'),
  'Authenticated reads are available behind RLS'
);
select results_eq(
  $$select max_in_progress::integer, max_claimed::integer, allow_claim_with_in_progress
    from public.work_active_limits where role_code = 'DRIVER' and work_type = 'DELIVERY'$$,
  $$values (1, 1, true)$$,
  'Driver may hold one in-progress and one future claimed job'
);
select results_eq(
  $$select max_in_progress::integer, max_claimed::integer, allow_claim_with_in_progress
    from public.work_active_limits where role_code = 'OPERATOR_WORKER' and work_type = 'OPERATION'$$,
  $$values (1, 1, false)$$,
  'Operator cannot claim another job while one is in progress'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('DRIVER', 'OPERATOR_WORKER')
      and permission.code in ('work_item.claim', 'work_item.update_self', 'work_item.heartbeat')$$,
  $$values (6::bigint)$$,
  'Worker roles receive only their work commands'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('DRIVER', 'OPERATOR_WORKER')
      and permission.code in ('work_item.verify', 'work_item.supervise')$$,
  $$values (0::bigint)$$,
  'Worker roles cannot verify or supervise'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('SUPERVISOR', 'DISPATCHER')
      and permission.code in ('work_item.verify', 'work_item.supervise')$$,
  $$values (4::bigint)$$,
  'Supervisor and dispatcher can resolve operational exceptions'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'work_claims_one_active_item' and indexdef ilike '%where (status = %active%')
  and exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'work_assignments_one_active_item' and indexdef ilike '%where (status = %active%'),
  'Only one active claim and assignment can exist per work item'
);

select * from finish(true);
rollback;
