begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select has_table('public', 'portal_issues', 'Worker PortalIssue support record exists');
select has_column('public', 'portal_issues', 'source_type', 'Issue retains the source type');
select has_column('public', 'portal_issues', 'source_id', 'Issue retains the source identifier');
select has_column('public', 'portal_issues', 'reported_by', 'Issue retains the reporting worker');
select has_column('public', 'portal_issues', 'client_idempotency_key', 'Issue retries are deduplicated');
select has_function(
  'app_private',
  'report_portal_issue',
  array['text', 'uuid', 'text', 'text', 'text', 'uuid'],
  'Portal issue is created through a private command'
);
select ok(
  not has_table_privilege('authenticated', 'public.portal_issues', 'INSERT')
    and not has_table_privilege('authenticated', 'public.portal_issues', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.portal_issues', 'DELETE'),
  'Browser clients cannot rewrite issue history directly'
);
select ok(
  has_table_privilege('authenticated', 'public.portal_issues', 'SELECT'),
  'Authenticated reads remain available behind RLS'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'portal_issues_source_idempotency_unique'
  ),
  'One client retry maps to one source-linked portal issue'
);

select * from finish(true);
rollback;
