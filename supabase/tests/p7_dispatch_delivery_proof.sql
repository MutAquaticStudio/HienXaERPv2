begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

select has_table('public', 'deliveries', 'Delivery aggregate exists');
select has_table('public', 'delivery_lines', 'DeliveryLine exists');
select has_table('public', 'delivery_assignments', 'Assignment exists');
select has_table('public', 'delivery_proofs', 'Proof exists');
select has_table('public', 'delivery_actuals', 'DeliveryActual exists');
select has_table('public', 'delivery_variances', 'DeliveryVariance exists');
select has_table('public', 'delivery_state_transitions', 'Delivery transition ledger exists');
select has_table('public', 'delivery_readiness_events', 'P10 readiness outbox exists');

select has_function('app_private', 'assign_delivery', array['uuid', 'uuid', 'uuid', 'uuid'], 'Assignment is database-serialized');
select has_function('app_private', 'transition_delivery', array['uuid', 'delivery_status', 'text', 'uuid'], 'State transition is database-serialized');
select has_function(
  'app_private', 'record_delivery_proof',
  array['uuid', 'delivery_proof_type', 'uuid', 'numeric', 'numeric', 'text', 'jsonb', 'uuid'],
  'Proof capture is database-controlled'
);
select has_function('app_private', 'confirm_delivery', array['uuid', 'jsonb', 'text', 'uuid'], 'Confirmation is database-serialized');

select results_eq(
  $$select enumlabel::text collate "C" from pg_enum
    join pg_type on pg_type.oid = pg_enum.enumtypid
    where pg_type.typname = 'delivery_status' order by enumsortorder$$,
  $$values ('PLANNED'::text collate "C"), ('ASSIGNED'::text collate "C"),
    ('DISPATCHED'::text collate "C"), ('ARRIVED'::text collate "C"),
    ('DELIVERED'::text collate "C"), ('CONFIRMED'::text collate "C"),
    ('PARTIAL'::text collate "C"), ('FAILED'::text collate "C"),
    ('CANCELLED'::text collate "C")$$,
  'Delivery state machine contains the required states'
);

select has_trigger('public', 'deliveries', 'deliveries_guard_update', 'Delivery snapshots are guarded');
select has_trigger('public', 'delivery_actuals', 'delivery_actuals_no_update_or_delete', 'Actuals are immutable');
select has_trigger('public', 'delivery_proofs', 'delivery_proofs_no_update_or_delete', 'Proof records are immutable');
select has_trigger('public', 'delivery_readiness_events', 'delivery_readiness_no_update_or_delete', 'Readiness events are immutable');

select ok(
  not has_table_privilege('authenticated', 'public.deliveries', 'INSERT')
    and not has_table_privilege('authenticated', 'public.deliveries', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.delivery_actuals', 'INSERT'),
  'Browser clients cannot mutate delivery truth'
);
select ok(
  has_table_privilege('authenticated', 'public.deliveries', 'SELECT')
    and has_table_privilege('authenticated', 'public.delivery_proofs', 'SELECT'),
  'Authenticated reads are available behind RLS'
);
select results_eq(
  $$select permission.code collate "C" from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code = 'DRIVER' and permission.code like 'delivery.%'
    order by permission.code$$,
  $$values ('delivery.dispatch'::text collate "C"), ('delivery.proof.create'::text collate "C"),
    ('delivery.update_assigned'::text collate "C")$$,
  'Driver receives only assigned workflow and proof permissions'
);

select * from finish(true);
rollback;
