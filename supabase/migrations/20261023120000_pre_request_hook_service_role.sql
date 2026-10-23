begin;

-- Hotfix 23/10: the Data API pre-request hook (20261012054843) evaluated
--   current_user='authenticated' and not private.auth_actor_active()
-- for every request. Postgres resolves and permission-checks every function in an expression when it prepares it, even
-- when the left side is false, so service-role and anonymous requests failed with "permission denied for schema private" /
-- "permission denied for function auth_actor_active" (HTTP 403). Every server-side finalize of a portal or internal
-- evidence file (worker photos when loading / delivering) has been refused since then.
-- The restricted reader is now only prepared for authenticated callers. No grant changes; owner and ACL are kept.
create or replace function public.require_active_api_actor() returns void
language plpgsql set search_path='' as $request$
begin
 if current_user = 'authenticated' then
  if not private.auth_actor_active() then
   raise exception 'account_inactive' using errcode='42501';
  end if;
 end if;
end $request$;

commit;
