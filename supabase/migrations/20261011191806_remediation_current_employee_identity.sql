begin;
create function public.current_employee_identity() returns jsonb
language sql stable security definer set search_path='' as $f$
  select jsonb_build_object('id',e.id,'display_name',e.display_name,'active',e.active)
  from public.employees e where e.auth_user_id=(select auth.uid()) and e.active;
$f$;
revoke all on function public.current_employee_identity() from public,anon;
grant execute on function public.current_employee_identity() to authenticated;
commit;
