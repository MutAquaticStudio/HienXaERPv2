-- D97 (G-1, G-2): the anonymous role executes only the Data API pre-request hook in the public schema; signed-in users and
-- the service role keep what they had; functions made later do not get anon's EXECUTE by default; the "http" extension is gone.
do $test$
declare
  fn text;
  leftover text;
begin
  assert has_function_privilege('anon', 'public.require_active_api_actor()', 'EXECUTE'), 'anon runs the pre-request hook';
  assert has_function_privilege('authenticated', 'public.require_active_api_actor()', 'EXECUTE'), 'authenticated runs the pre-request hook';
  assert has_function_privilege('service_role', 'public.require_active_api_actor()', 'EXECUTE'), 'service_role runs the pre-request hook';

  select string_agg(p.oid::regprocedure::text, ', ') into leftover from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.oid <> 'public.require_active_api_actor()'::regprocedure
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
  assert leftover is null, format('anon can still execute: %s', leftover);

  -- A sample of business RPCs: never anon, still for signed-in users.
  foreach fn in array array['public.save_push_subscription(text, text, text, text)', 'public.grant_customer_portal_access(uuid, uuid, text, uuid)',
    'public.register_portal_customer(text, text, text, uuid)', 'public.customer_portal_accounts(uuid)', 'public.save_automation_rule(uuid, uuid, jsonb, integer, uuid)',
    'public.authorize_portal_password_reset(uuid, uuid)'] loop
    assert not has_function_privilege('anon', fn, 'EXECUTE'), format('anon cannot execute %s', fn);
    assert has_function_privilege('authenticated', fn, 'EXECUTE'), format('authenticated still executes %s', fn);
  end loop;
  assert not has_function_privilege('anon', 'public.hit_rate_limit(text, text, integer, integer)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.hit_rate_limit(text, text, integer, integer)', 'EXECUTE'), 'service-only RPC unchanged';

  -- Functions made later by the migration role: no EXECUTE for anon by default.
  assert not exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
    cross join aclexplode(d.defaclacl) a
    where n.nspname = 'public' and d.defaclobjtype = 'f' and a.grantee = (select oid from pg_roles where rolname = 'anon')), 'no default EXECUTE for anon';

  assert not exists (select 1 from pg_extension where extname = 'http'), 'the http extension is dropped';
end
$test$;

-- A login without a session is refused by a business RPC at the privilege level.
do $test$
declare failed text;
begin
  perform set_config('role', 'anon', true);
  begin perform public.customer_portal_accounts('76000000-0000-4000-8000-000000000386');
  exception when insufficient_privilege then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed like 'permission denied for function%', format('anon is stopped before the function body, got %s', failed);
end
$test$;
