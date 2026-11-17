-- D97 (security review G-1, defence in depth): the anonymous role (no sign-in) may execute only what it truly needs in the
-- public schema. Until now a function only revoked "from public" stayed executable by anon, because Supabase grants EXECUTE to
-- anon explicitly by default. Every such function already checks auth.uid() / has_permission first, so nothing was open;
-- this removes the reliance on that.
-- What anon needs, checked against the app: the Data API pre-request hook public.require_active_api_actor() (PostgREST runs it
-- as the request role, anon included). The pages that work before signing in (sign-in, registration, recovery, the company
-- logo) read only company_profile columns, which needs no function. Nothing else is granted back.
-- * Each public function owned by the migration role (extension members left alone) that anon can execute loses anon's
--   EXECUTE; when it came from PUBLIC, PUBLIC's EXECUTE is revoked too, after granting it explicitly to authenticated and
--   service_role where they had it — their access is unchanged.
-- * Functions created later in public by the migration role no longer get anon's EXECUTE by default (Supabase's
--   "alter default privileges … grant execute … to anon"). PostgreSQL's own default EXECUTE for PUBLIC cannot be removed per
--   schema, so new migrations keep the usual "revoke all on function … from public, anon".
begin;

do $anon$
declare
  f record;
  routine text;
begin
  for f in
    select p.oid, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proowner = (select oid from pg_roles where rolname = current_user)
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    routine := f.oid::regprocedure::text;
    if f.proacl is null or exists (select 1 from aclexplode(f.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      if has_function_privilege('authenticated', f.oid, 'EXECUTE') then execute format('grant execute on routine %s to authenticated', routine); end if;
      if has_function_privilege('service_role', f.oid, 'EXECUTE') then execute format('grant execute on routine %s to service_role', routine); end if;
      execute format('revoke execute on routine %s from public', routine);
    end if;
    execute format('revoke execute on routine %s from anon', routine);
  end loop;
end
$anon$;

grant execute on function public.require_active_api_actor() to anon;

alter default privileges in schema public revoke execute on functions from anon, public;

notify pgrst, 'reload schema';
commit;
