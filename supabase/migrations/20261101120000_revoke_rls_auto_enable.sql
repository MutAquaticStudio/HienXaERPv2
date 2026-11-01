-- Security advisor (anon_security_definer_function_executable): public.rls_auto_enable is the event-trigger function that
-- Supabase creates for "automatically enable RLS on new tables" (Production only, not created by our migrations).
-- It is SECURITY DEFINER and executable by PUBLIC/anon/authenticated through the API schema. An event trigger does not
-- need EXECUTE for the calling role, so revoking it keeps the automatic RLS working while closing the API surface.
-- Idempotent: does nothing where the function does not exist (local, CI, QA).
do $migration$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$migration$;
