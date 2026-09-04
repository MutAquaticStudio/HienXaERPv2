begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(39);

select has_type('public', 'service_rate_type', 'Service rate model is explicit');
select has_type('public', 'service_job_status', 'Service job lifecycle is explicit');
select has_type('public', 'service_machine_status', 'Machine availability is explicit');
select has_type('public', 'service_assignment_status', 'Operator assignment lifecycle is explicit');
select has_type('public', 'service_work_log_type', 'Field log events are explicit');
select has_type('public', 'service_billing_status', 'Billing event lifecycle is explicit');
select has_type('public', 'service_cost_category', 'Job direct-cost categories are explicit');

select has_table('public', 'service_types', 'Service catalog exists');
select has_table('public', 'service_machines', 'Service machine master exists');
select has_table('public', 'service_jobs', 'Service jobs exist');
select has_table('public', 'service_job_assignments', 'Operator assignments exist');
select has_table('public', 'service_work_logs', 'Immutable field logs exist');
select has_table('public', 'service_customer_confirmations', 'Customer confirmations exist');
select has_table('public', 'service_billing_events', 'Service billing events exist');
select has_table('public', 'service_job_cost_entries', 'Direct service costs exist');
select has_table('public', 'service_job_state_events', 'Service lifecycle audit exists');

select has_function('app_private', 'create_service_type', array['text', 'text', 'service_rate_type', 'numeric', 'numeric', 'uuid'], 'Service type mutation is controlled');
select has_function('app_private', 'create_service_machine', array['text', 'text', 'text', 'text', 'uuid', 'numeric', 'uuid'], 'Machine mutation is controlled');
select has_function('app_private', 'create_service_job', array['uuid', 'uuid', 'uuid', 'uuid', 'timestamp with time zone', 'timestamp with time zone', 'service_rate_type', 'numeric', 'text', 'text', 'uuid'], 'Service creation command exists');
select has_function('app_private', 'assign_service_job', array['uuid', 'uuid', 'uuid'], 'Service assignment creates coordination work');
select has_function('app_private', 'record_service_work_log', array['uuid', 'service_work_log_type', 'timestamp with time zone', 'text', 'numeric', 'numeric', 'uuid', 'uuid'], 'Field log command exists');
select has_function('app_private', 'approve_service_job_billing', array['uuid', 'numeric', 'numeric', 'text', 'uuid'], 'Billable time approval is explicit');
select has_function('app_private', 'record_service_job_cost', array['uuid', 'service_cost_category', 'numeric', 'text', 'timestamp with time zone', 'uuid'], 'Direct cost command exists');
select has_function('app_private', 'confirm_service_job_customer', array['uuid', 'text', 'text', 'uuid', 'uuid'], 'Customer confirmation creates finance atomically');
select has_function('app_private', 'cancel_service_job', array['uuid', 'text', 'uuid'], 'Pre-start cancellation command exists');

select has_view('public', 'service_job_operational_view', 'Office profitability read model exists');
select has_view('public', 'service_job_log_view', 'Field log read model exists');
select has_view('public', 'service_job_worker_view', 'Assigned worker read model exists');

select has_trigger('public', 'service_jobs', 'service_jobs_command_update', 'Service job updates require commands');
select has_trigger('public', 'service_work_logs', 'service_work_logs_immutable', 'Field logs are immutable');
select has_trigger('public', 'service_customer_confirmations', 'service_confirmations_immutable', 'Customer confirmation is immutable');

select ok(
  not has_table_privilege('authenticated', 'public.service_jobs', 'INSERT')
    and not has_table_privilege('authenticated', 'public.service_jobs', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.service_work_logs', 'INSERT')
    and not has_table_privilege('authenticated', 'public.service_billing_events', 'INSERT'),
  'Browser clients cannot mutate service execution or billing directly'
);
select ok(
  has_table_privilege('authenticated', 'public.service_job_operational_view', 'SELECT')
    and has_table_privilege('authenticated', 'public.service_job_worker_view', 'SELECT'),
  'Authenticated reads are available only behind RLS-backed views'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code = 'OPERATOR_WORKER'
      and permission.code = 'service_job.update_assigned'$$,
  $$values (1::bigint)$$,
  'Operator receives only the assigned service update command'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code = 'OWNER_ADMIN' and permission.code like 'service_job.%'$$,
  $$values (7::bigint)$$,
  'Owner receives every P11 service permission'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'service_assignments_one_active_job')
    and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'receivables_service_job_unique')
    and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'receivables_service_billing_event_unique'),
  'Assignment and finance consumers are exactly-once'
);
select has_column('public', 'service_jobs', 'actual_hours', 'Actual elapsed hours are persisted separately');
select has_column('public', 'service_jobs', 'approved_billable_hours', 'Approved billable hours are explicit');
select has_column('public', 'service_jobs', 'approved_billable_quantity', 'Approved billing quantity is explicit');

select * from finish(true);
rollback;
