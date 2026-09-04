begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

select has_table('public', 'customer_portal_memberships', 'A1 has customer membership as the customer boundary');
select has_table('public', 'route_plans', 'A1 has RoutePlan as a support object');
select has_table('public', 'current_vehicle_locations', 'A1 has GPS telemetry as a support object');
select has_table('public', 'conversations', 'A1 has conversation as a support object');
select has_table('public', 'earning_events', 'A1 retains P12 earning truth');

select has_function('app_private', 'accept_quotation', array['uuid', 'uuid'], 'P4 owns the canonical quotation acceptance transition');
select has_function('app_private', 'apply_route_plan', array['uuid', 'text', 'uuid'], 'RO1 applies through a guarded command');
select has_function('app_private', 'record_active_delivery_location', array['numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'timestamp with time zone', 'uuid'], 'GPS1 records telemetry through a guarded command');
select has_function('app_private', 'send_operational_message', array['uuid', 'text', 'uuid', 'text', 'uuid'], 'CHAT1 persists messages through a guarded command');
select has_function('app_private', 'create_verified_work_earning', array['uuid', 'compensation_rule_type', 'jsonb', 'text', 'uuid'], 'P12 creates earnings from verified work only');

select ok(
  not (select prosecdef from pg_proc where oid = 'app_private.accept_quotation(uuid, uuid)'::regprocedure),
  'Canonical P4 acceptance remains security invoker'
);
select ok(
  position('app_private.accept_quotation' in lower(pg_get_functiondef('app_private.customer_portal_accept_quotation(uuid, text, uuid)'::regprocedure))) > 0
  and position('update public.quotation_revisions' in lower(pg_get_functiondef('app_private.customer_portal_accept_quotation(uuid, text, uuid)'::regprocedure))) = 0
  and position('update public.quotations' in lower(pg_get_functiondef('app_private.customer_portal_accept_quotation(uuid, text, uuid)'::regprocedure))) = 0,
  'CP1 authorizes and audits quotation acceptance without owning P4 state'
);
select ok(
  position('app_private.assign_delivery' in lower(pg_get_functiondef('app_private.apply_route_plan(uuid, text, uuid)'::regprocedure))) > 0
  and position('pool_claim_requires_explicit_workflow' in lower(pg_get_functiondef('app_private.apply_route_plan(uuid, text, uuid)'::regprocedure))) > 0
  and position('update public.deliveries' in lower(pg_get_functiondef('app_private.apply_route_plan(uuid, text, uuid)'::regprocedure))) = 0,
  'RO1 uses P7 assignment and never mutates Delivery state directly'
);
select ok(
  position('gps_active_delivery_required' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamptz, uuid)'::regprocedure))) > 0
  and position('update public.deliveries' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamptz, uuid)'::regprocedure))) = 0
  and position('confirm_delivery' in lower(pg_get_functiondef('app_private.record_active_delivery_location(numeric, numeric, numeric, numeric, numeric, timestamptz, uuid)'::regprocedure))) = 0,
  'GPS telemetry cannot change Delivery truth'
);
select ok(
  position('update public.receivables' in lower(pg_get_functiondef('app_private.customer_portal_submit_payment_notice(numeric, date, text, text, text, text, uuid)'::regprocedure))) = 0
  and position('insert into public.payments' in lower(pg_get_functiondef('app_private.customer_portal_submit_payment_notice(numeric, date, text, text, text, text, uuid)'::regprocedure))) = 0,
  'Customer payment notice cannot post P8 payment or change debt'
);
select ok(
  position('update public.deliveries' in lower(pg_get_functiondef('app_private.report_portal_issue(text, uuid, text, text, text, uuid)'::regprocedure))) = 0
  and position('update public.service_jobs' in lower(pg_get_functiondef('app_private.report_portal_issue(text, uuid, text, text, text, uuid)'::regprocedure))) = 0,
  'PortalIssue cannot silently change its source transaction'
);
select ok(
  position('update public.deliveries' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) = 0
  and position('update public.payments' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) = 0,
  'CHAT1 message cannot change Delivery or Payment truth'
);
select ok(
  position('item.status <> ''verified''' in lower(pg_get_functiondef('app_private.create_verified_work_earning(uuid, compensation_rule_type, jsonb, text, uuid)'::regprocedure))) > 0
  and position('work_verification_required' in lower(pg_get_functiondef('app_private.create_verified_work_earning(uuid, compensation_rule_type, jsonb, text, uuid)'::regprocedure))) > 0,
  'P12 earning remains after verified work and verification evidence'
);
select ok(
  not has_table_privilege('authenticated', 'public.route_plans', 'INSERT')
  and not has_table_privilege('authenticated', 'public.current_vehicle_locations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.conversation_messages', 'INSERT'),
  'Browser roles cannot directly write RoutePlan, GPS, or Message records'
);
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.customer_portal_memberships'::regclass,
    'public.route_plans'::regclass,
    'public.current_vehicle_locations'::regclass,
    'public.conversations'::regclass,
    'public.conversation_messages'::regclass
  )),
  'All final add-on aggregates keep RLS enabled'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_messages'
    and policyname = 'conversation_messages_read_participant'
    and qual like '%authenticated_chat_context_authorized%'),
  'Chat read requires active participant plus current authorized context'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicle_location_pings'
    and policyname = 'vehicle_location_pings_read_authorized'
    and qual like '%gps.location.read_fleet%'),
  'Exact GPS remains worker-self or fleet-authorized only'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.route_plans'::regclass and conname = 'route_plan_approval_shape')
  and exists (select 1 from pg_constraint where conrelid = 'public.conversations'::regclass and conname = 'conversations_context_once'),
  'Route and conversation histories keep explicit lifecycle invariants'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.earning_events'::regclass
    and tgname = 'earning_events_update_guard' and not tgisinternal),
  'Earning history remains command-guarded after verification'
);

select * from finish(true);
rollback;
