begin;

select plan(7);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'worker-one@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"Lái xe Một"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'worker-two@example.test',
    '',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{"display_name":"Lái xe Hai"}'::jsonb
  );

update public.user_profiles
set status = 'ACTIVE', activated_at = now()
where user_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);

insert into public.user_roles (user_id, role_id)
select user_id, (select id from public.roles where code = 'DRIVER')
from public.user_profiles
where user_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);

insert into public.data_scopes (user_id, scope_kind) values
  ('10000000-0000-4000-8000-000000000001', 'ASSIGNED_ONLY'),
  ('10000000-0000-4000-8000-000000000002', 'ASSIGNED_ONLY');

insert into public.work_items (title, assigned_user_id) values
  ('Việc của lái xe Một', '10000000-0000-4000-8000-000000000001'),
  ('Việc của lái xe Hai', '10000000-0000-4000-8000-000000000002');

insert into public.audit_events (event_type, entity_type, payload)
values ('platform.test', 'security', '{}'::jsonb);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  'select count(*)::bigint from public.work_items',
  'values (1::bigint)',
  'Worker sees exactly their assigned work item'
);

select results_eq(
  $$select count(*)::bigint from public.permissions where code = 'finance.read'$$,
  'values (1::bigint)',
  'Active users may resolve permission definitions'
);

select ok(
  not app_private.has_permission('finance.read'),
  'Driver does not have Finance permission'
);

select ok(
  not app_private.has_permission('margin.read'),
  'Driver does not have Margin permission'
);

select results_eq(
  'select count(*)::bigint from public.audit_events',
  'values (0::bigint)',
  'Driver cannot read audit events'
);

select results_eq(
  'select count(*)::bigint from public.evidence',
  'values (0::bigint)',
  'Evidence is not broadly readable'
);

reset role;
update public.user_profiles
set status = 'DISABLED', disabled_at = now()
where user_id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;

select ok(
  not app_private.is_active_user(
    '10000000-0000-4000-8000-000000000001'::uuid
  ),
  'Disabled account fails protected active-user check immediately'
);

select * from finish();
rollback;
