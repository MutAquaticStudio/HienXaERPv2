-- Hotfix 23/10: the Data API pre-request hook must let service-role and anonymous requests through. Before the fix it
-- prepared private.auth_actor_active() for every caller, so a server-side finalize of a worker's photo (service role)
-- failed with "permission denied for function auth_actor_active" (HTTP 403). A disabled signed-in account is still stopped.
insert into auth.users(id, banned_until) values ('10000000-0000-4000-8000-000000000270', now() + interval '1 day');

do $test$
declare failed text;
begin
  perform set_config('role', 'service_role', true);
  begin
    perform public.require_active_api_actor();
  exception when others then failed := sqlerrm;
  end;
  perform pg_temp.act_as_admin();
  assert failed is null, format('service-role requests pass the hook, got %s', failed);

  perform set_config('role', 'anon', true);
  begin
    perform public.require_active_api_actor();
  exception when others then failed := sqlerrm;
  end;
  perform pg_temp.act_as_admin();
  assert failed is null, format('anonymous requests pass the hook, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.require_active_api_actor();
  perform pg_temp.act_as_admin();

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000270');
  begin
    perform public.require_active_api_actor();
  exception when others then failed := sqlerrm;
  end;
  perform pg_temp.act_as_admin();
  assert failed = 'account_inactive', format('a banned signed-in account is stopped, got %s', failed);
end
$test$;
