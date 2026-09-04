begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

select has_table('public', 'customer_portal_memberships', 'CP1 creates server-owned customer membership');
select has_column('public', 'customer_portal_memberships', 'auth_user_id', 'Membership binds an auth user');
select has_column('public', 'customer_portal_memberships', 'customer_id', 'Membership binds exactly one customer');
select has_column('public', 'customer_portal_memberships', 'portal_role', 'Membership retains the portal role');
select has_table('public', 'customer_portal_quote_acceptances', 'Quote consent is a support record');
select has_table('public', 'customer_quote_requests', 'Quote requests are separate support records');
select has_table('public', 'customer_delivery_acknowledgements', 'Delivery acknowledgement is separate from P7 actuals');
select has_table('public', 'customer_delivery_issues', 'Delivery issue is a support record');
select has_table('public', 'customer_payment_notices', 'Payment notice is separate from P8 payments');

select has_function('app_private', 'customer_portal_accept_quotation', array['uuid', 'text', 'uuid'], 'Exact quote revision accepts through a private command');
select has_function('app_private', 'customer_portal_request_quote', array['text', 'uuid', 'uuid', 'numeric', 'uuid', 'text', 'uuid', 'uuid', 'text', 'uuid'], 'Quote request uses a private command');
select has_function('app_private', 'customer_portal_acknowledge_delivery', array['uuid', 'uuid'], 'Acknowledgement uses a private command');
select has_function('app_private', 'customer_portal_report_delivery_issue', array['uuid', 'text', 'text', 'text', 'uuid'], 'Delivery issue uses a private command');
select has_function('app_private', 'customer_portal_submit_payment_notice', array['numeric', 'date', 'text', 'text', 'text', 'text', 'uuid'], 'Payment notice uses a private command');

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.customer_portal_memberships'::regclass,
    'public.customer_portal_quote_acceptances'::regclass,
    'public.customer_quote_requests'::regclass,
    'public.customer_delivery_acknowledgements'::regclass,
    'public.customer_delivery_issues'::regclass,
    'public.customer_payment_notices'::regclass
  )),
  'All CP1 public support records have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.customer_portal_memberships', 'INSERT')
  and not has_table_privilege('authenticated', 'public.customer_portal_quote_acceptances', 'INSERT')
  and not has_table_privilege('authenticated', 'public.customer_quote_requests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.customer_delivery_acknowledgements', 'INSERT')
  and not has_table_privilege('authenticated', 'public.customer_delivery_issues', 'INSERT')
  and not has_table_privilege('authenticated', 'public.customer_payment_notices', 'INSERT'),
  'Browser clients cannot write CP1 support records directly'
);
select ok(
  has_table_privilege('authenticated', 'public.customer_portal_memberships', 'SELECT'),
  'Authenticated membership reads remain available behind RLS'
);
select ok(
  not exists (
    select 1 from pg_constraint constraint_row
    join pg_class source on source.oid = constraint_row.conrelid
    join pg_class target on target.oid = constraint_row.confrelid
    where source.relname = 'customer_payment_notices' and target.relname = 'payments'
  ),
  'Payment notices do not point to P8 Payment'
);
select ok(
  exists (select 1 from storage.buckets where id = 'customer-evidence' and public = false),
  'Customer evidence uses a dedicated private bucket'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'customer_evidence_objects_insert_own_folder'),
  'Customer uploads are constrained to their own active-membership folder'
);
select ok(
  not exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname like 'customer_portal_%'
      and procedure.prosecdef
  ),
  'Customer portal command functions run as security invoker'
);

select * from finish(true);
rollback;
