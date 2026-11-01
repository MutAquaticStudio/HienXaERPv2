-- Security advisor: the Supabase "auto-enable RLS" event-trigger function must not be callable through the API.
-- Where it exists (Production), nobody but the owner/service may execute it; elsewhere the migration is a no-op.
do $test$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    assert not has_function_privilege('anon', 'public.rls_auto_enable()', 'execute'), 'anon cannot execute rls_auto_enable';
    assert not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute'), 'authenticated cannot execute rls_auto_enable';
  end if;
end
$test$;

-- The same revoke on a stand-in event-trigger function: the event trigger still fires for a role without EXECUTE.
create function public.hx_test_rls_auto_enable() returns event_trigger language plpgsql security definer as $fn$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands() where command_tag = 'CREATE TABLE' and schema_name = 'public' loop
    execute format('alter table if exists %s enable row level security', cmd.object_identity);
  end loop;
end
$fn$;
create event trigger hx_test_ensure_rls on ddl_command_end when tag in ('CREATE TABLE') execute function public.hx_test_rls_auto_enable();
revoke all on function public.hx_test_rls_auto_enable() from public, anon, authenticated;
create role hx_test_ddl_317 nologin;
grant usage, create on schema public to hx_test_ddl_317;

do $test$
begin
  assert not has_function_privilege('hx_test_ddl_317', 'public.hx_test_rls_auto_enable()', 'execute'), 'stand-in revoked for the table creator';
  set local role hx_test_ddl_317;
  create table public.hx_test_auto_rls(id int);
  reset role;
  assert (select relrowsecurity from pg_class where oid = 'public.hx_test_auto_rls'::regclass), 'event trigger still enables RLS after the revoke';
end
$test$;
