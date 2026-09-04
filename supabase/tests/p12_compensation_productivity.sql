begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(45);

select has_type('public', 'compensation_plan_scope', 'Compensation plan scope is explicit');
select has_type('public', 'compensation_rule_type', 'Compensation rule types are explicit');
select has_type('public', 'earning_event_source', 'Earning source is explicit');
select has_type('public', 'earning_event_status', 'Earning lifecycle is explicit');
select has_type('public', 'payroll_period_status', 'Payroll period lifecycle is explicit');

select has_table('public', 'compensation_profiles', 'Versioned employee compensation profiles exist');
select has_table('public', 'compensation_plan_versions', 'Effective-dated plan versions exist');
select has_table('public', 'compensation_rules', 'Compensation rules exist');
select has_table('public', 'earning_events', 'Earning entitlement events exist');
select has_table('public', 'earning_allocations', 'Multi-worker earning allocations exist');
select has_table('public', 'earning_adjustments', 'Earning adjustments are historical records');
select has_table('public', 'compensation_direct_labor_entries', 'Attributable variable labor exists');
select has_table('public', 'payroll_periods', 'Payroll periods exist');
select has_table('public', 'payroll_lines', 'Payroll employee lines exist');
select has_table('public', 'payroll_line_earnings', 'Payroll snapshots source allocations');
select has_table('public', 'payroll_payment_links', 'P8 payment linkage exists');

select has_function('app_private', 'create_compensation_profile', array['uuid', 'date', 'text', 'uuid'], 'Profile version command exists');
select has_function('app_private', 'create_compensation_plan_version', array['text', 'text', 'integer', 'compensation_plan_scope', 'text', 'uuid', 'date', 'date', 'text', 'text', 'uuid'], 'Effective plan version command exists');
select has_function('app_private', 'create_compensation_rule', array['uuid', 'compensation_rule_type', 'numeric', 'text', 'text', 'text', 'uuid'], 'Rule command exists');
select has_function('app_private', 'resolve_compensation_rule', array['uuid', 'compensation_rule_type', 'text', 'text', 'date'], 'Employee-role-company resolver exists');
select has_function('app_private', 'create_verified_work_earning', array['uuid', 'compensation_rule_type', 'jsonb', 'text', 'uuid'], 'Verified-work earning command exists');
select has_function('app_private', 'create_bonus_earning', array['uuid', 'date', 'text', 'uuid'], 'Bonus entitlement command exists');
select has_function('app_private', 'approve_earning_event', array['uuid', 'text', 'uuid'], 'Earning approval command exists');
select has_function('app_private', 'adjust_earning_allocation', array['uuid', 'numeric', 'text', 'uuid'], 'Adjustment command exists');
select has_function('app_private', 'reverse_earning_event', array['uuid', 'text', 'uuid'], 'Reversal command exists');
select has_function('app_private', 'create_payroll_period', array['text', 'date', 'date', 'text', 'text', 'uuid'], 'Payroll period command exists');
select has_function('app_private', 'generate_monthly_earnings', array['uuid', 'uuid'], 'Fixed monthly generator exists');
select has_function('app_private', 'close_payroll_period', array['uuid', 'text', 'uuid'], 'Payroll close command exists');
select has_function('app_private', 'link_payroll_payment', array['uuid', 'uuid', 'numeric', 'text', 'uuid'], 'P8 payment link command exists');

select has_view('public', 'compensation_profile_view', 'Office profile read model exists');
select has_view('public', 'compensation_plan_rule_view', 'Office plan read model exists');
select has_view('public', 'earning_event_summary_view', 'Office earning event read model exists');
select has_view('public', 'earning_allocation_view', 'Office allocation read model exists');
select has_view('public', 'verified_work_compensation_view', 'Verified work selector exists');
select has_view('public', 'payroll_period_summary_view', 'Payroll period summary exists');
select has_view('public', 'payroll_line_summary_view', 'Payroll line summary exists');
select has_view('public', 'compensation_payment_option_view', 'Posted P8 payment selector exists');
select has_view('public', 'my_earning_view', 'Worker earning read model exists');
select has_view('public', 'worker_productivity_view', 'Worker productivity summary exists');

select has_trigger('public', 'compensation_plan_versions', 'compensation_plans_immutable', 'Plan history is immutable');
select has_trigger('public', 'earning_events', 'earning_events_update_guard', 'Earning mutation requires a command');
select has_trigger('public', 'work_items', 'work_item_earning_reversal', 'Cancelled verified work reverses entitlement');

select ok(
  not has_table_privilege('authenticated', 'public.earning_events', 'INSERT')
    and not has_table_privilege('authenticated', 'public.earning_events', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.earning_allocations', 'INSERT')
    and not has_table_privilege('authenticated', 'public.payroll_lines', 'INSERT'),
  'Browser clients cannot create or mutate payable earnings'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code = 'OPERATOR_WORKER'
      and permission.code = 'earning.read_self'$$,
  $$values (1::bigint)$$,
  'Worker receives self earnings read only'
);
select results_eq(
  $$select count(*)::bigint from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code = 'OWNER_ADMIN'
      and permission.code in ('compensation.read', 'compensation.manage', 'earning.read_self', 'earning.approve', 'earning.adjust', 'payroll.close')$$,
  $$values (6::bigint)$$,
  'Owner receives every P12 permission'
);

select * from finish(true);
rollback;
