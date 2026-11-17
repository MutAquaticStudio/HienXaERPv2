-- D97 (T-4): a login still on its temporary password is held at the Data API pre-request hook: only the sign-in check's GET
-- reads of its own employee / membership / access / grant rows pass. Once the flag is cleared (changeOwnPasswordAction sets
-- it to false and refreshes the session), everything passes again. Service role and anonymous requests are unchanged.
create function pg_temp.hook(flag text, method text, path text) returns text language plpgsql as $$
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform set_config('request.jwt.claims', case when flag is null then '{}' else
    jsonb_build_object('sub', '10000000-0000-4000-8000-000000000001', 'app_metadata', jsonb_build_object('hx_must_change_password', flag::jsonb))::text end, true);
  perform set_config('request.method', method, true);
  perform set_config('request.path', path, true);
  begin
    perform public.require_active_api_actor();
  exception when others then
    perform pg_temp.act_as_admin();
    return sqlerrm;
  end;
  perform pg_temp.act_as_admin();
  return 'ok';
end $$;

do $test$
declare path text;
begin
  -- Temporary password: the sign-in check's reads pass…
  foreach path in array array['/employees', '/customer_portal_memberships', '/employee_branch_access', '/employee_permission_grants',
    '/rest/v1/employees'] loop
    assert pg_temp.hook('true', 'GET', path) = 'ok', format('GET %s passes', path);
  end loop;
  assert pg_temp.hook('true', 'HEAD', '/customer_portal_memberships') = 'ok', 'HEAD passes';
  -- …everything else is refused.
  assert pg_temp.hook('true', 'POST', '/rpc/customer_portal_snapshot') = 'password_change_required', 'an RPC is refused';
  assert pg_temp.hook('true', 'GET', '/sales_orders') = 'password_change_required', 'another table is refused';
  assert pg_temp.hook('true', 'POST', '/employees') = 'password_change_required', 'a write to an allowed table is refused';
  assert pg_temp.hook('true', 'GET', '/employees_x') = 'password_change_required', 'only the exact paths pass';
  assert pg_temp.hook('true', 'GET', '/rpc/employees') = 'password_change_required', 'not an RPC of the same name';
  assert pg_temp.hook('"true"', 'POST', '/rpc/x') = 'password_change_required', 'the flag as a string counts too';
  -- Flag cleared, absent or false: as before.
  assert pg_temp.hook('false', 'POST', '/rpc/customer_portal_snapshot') = 'ok', 'cleared flag passes';
  assert pg_temp.hook(null, 'POST', '/rpc/customer_portal_snapshot') = 'ok', 'no flag passes';

  -- Service role and anonymous requests carrying the claim are not affected.
  perform set_config('request.jwt.claims', '{"app_metadata":{"hx_must_change_password":true}}', true);
  perform set_config('request.method', 'POST', true);
  perform set_config('request.path', '/rpc/ingest_sepay_webhook', true);
  perform set_config('role', 'service_role', true);
  perform public.require_active_api_actor();
  perform set_config('role', 'anon', true);
  perform public.require_active_api_actor();
  perform pg_temp.act_as_admin();
end
$test$;
