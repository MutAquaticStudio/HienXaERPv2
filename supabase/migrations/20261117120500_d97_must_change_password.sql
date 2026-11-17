-- D97 (security review T-4): a login still on its temporary password (app_metadata.hx_must_change_password = true, set
-- when the store creates or resets a customer login) is held at the Data API too, not only by the app's page redirect:
-- every PostgREST request of that login is refused (password_change_required) until the password is changed.
-- What stays open, precisely: the sign-in check of the app (FB9 "which tab is this account's"), which reads with GET only the
-- caller's own rows of employees, customer_portal_memberships, employee_branch_access and employee_permission_grants (RLS
-- limits each to the caller). Changing the password goes through Supabase Auth (GoTrue), never through this hook, and
-- clears the flag (changeOwnPasswordAction), after which the refreshed session works as usual.
-- Storage and Realtime do not run this hook (unchanged). Latest definition replaced: 20261023120000_pre_request_hook_service_role.sql.
begin;

create or replace function public.require_active_api_actor() returns void
language plpgsql set search_path='' as $request$
begin
 if current_user = 'authenticated' then
  if not private.auth_actor_active() then
   raise exception 'account_inactive' using errcode='42501';
  end if;
  if coalesce(auth.jwt()->'app_metadata'->>'hx_must_change_password', '') = 'true'
    and not (coalesce(current_setting('request.method', true), '') in ('GET', 'HEAD')
      and coalesce(current_setting('request.path', true), '')
        ~ '^(/rest/v1)?/(employees|customer_portal_memberships|employee_branch_access|employee_permission_grants)/?$') then
   raise exception 'password_change_required' using errcode='42501';
  end if;
 end if;
end $request$;

commit;
