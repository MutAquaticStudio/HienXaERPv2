begin;

-- Auth state is trusted server data. No JWT user_metadata participates in this decision.
-- to_jsonb also supports the explicitly limited id-only native Auth fixture schema.
create function private.auth_identity_active(target_auth_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $identity$
 select exists(select 1 from auth.users u where u.id=target_auth_user_id
  and nullif(to_jsonb(u)->>'deleted_at','') is null
  and (nullif(to_jsonb(u)->>'banned_until','') is null
    or (to_jsonb(u)->>'banned_until')::timestamptz<=current_timestamp))
$identity$;
revoke all on function private.auth_identity_active(uuid) from public,anon,authenticated,service_role;

create function private.auth_actor_active() returns boolean
language sql stable security definer set search_path='' as $actor$
 select private.auth_identity_active((select auth.uid()))
$actor$;
revoke all on function private.auth_actor_active() from public,anon,authenticated,service_role;
grant execute on function private.auth_actor_active() to authenticated;

-- Preserve existing argument/default/owner/ACL contracts and every prior scope predicate.
-- Only these shared SQL authorization readers acquire the additional identity condition.
do $readers$
declare f record; body text; ddl text; is_boolean boolean;
begin
 for f in select p.oid,p.proname,p.prosrc,l.lanname,p.prorettype
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='private' and p.proname in
   ('current_employee_id','has_permission','has_customer_membership','portal_customer_role','can_access_conversation','sales_order_reader_scope')
 loop
  if f.lanname<>'sql' then raise exception 'auth_reader_contract_requires_review:%',f.proname;end if;
  body:=regexp_replace(trim(f.prosrc),';\s*$','');
  is_boolean:=f.prorettype='boolean'::regtype;
  if is_boolean then body:='select private.auth_actor_active() and ('||body||')';
  else body:='select guarded.* from ('||body||') guarded where private.auth_actor_active()';end if;
  ddl:=replace(pg_get_functiondef(f.oid),f.prosrc,E'\n'||body||E'\n');
  execute ddl;
 end loop;
end $readers$;

-- Storage and Realtime evaluate RLS without the Data API pre-request hook.
-- Keep all existing USING/WITH CHECK, command, role and permissiveness settings.
do $policies$
declare p record; qualified text; sql text; guard text:=
 '(case when current_user=''authenticated'' then private.auth_actor_active() else true end)';
begin
 for p in select pol.*,n.nspname,c.relname,
   pg_get_expr(pol.polqual,pol.polrelid) old_using,pg_get_expr(pol.polwithcheck,pol.polrelid) old_check
  from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','storage')
   and (0=any(pol.polroles) or (select oid from pg_roles where rolname='authenticated')=any(pol.polroles))
 loop
  qualified:=format('%I.%I',p.nspname,p.relname);
  sql:=format('alter policy %I on %s',p.polname,qualified);
  if p.polcmd in('r','w','d','*') then
   sql:=sql||' using (('||coalesce(p.old_using,'true')||') and '||guard||')';
  end if;
  if p.polcmd in('a','w','*') then
   sql:=sql||' with check (('||coalesce(p.old_check,p.old_using,'true')||') and '||guard||')';
  end if;
  execute sql;
 end loop;
end $policies$;

-- Read-only definer views can contain a raw self-ownership alternative to the shared readers.
-- Preserve columns, options and grants; do not silently change a writable view's contract.
do $views$
declare v record; body text; options text;
begin
 for v in select c.oid,n.nspname,c.relname,c.reloptions,pg_get_viewdef(c.oid,true) definition
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v'
   and pg_get_viewdef(c.oid,true) ~ 'auth\.uid\('
 loop
  if has_table_privilege('authenticated',v.oid,'INSERT,UPDATE,DELETE') then
   raise exception 'auth_writable_view_requires_review:%',v.relname;
  end if;
  body:=regexp_replace(trim(v.definition),';\s*$','');
  options:=case when v.reloptions is null then '' else ' with ('||array_to_string(v.reloptions,',')||')' end;
  execute format('create or replace view %I.%I%s as select guarded.* from (%s) guarded where private.auth_actor_active()',
   v.nspname,v.relname,options,body);
 end loop;
end $views$;

-- The pre-request hook protects cache-first RPC replay and every REST reader before execution.
-- It is invoker-rights and returns no identity data. Non-authenticated service/anon roles
-- retain their existing authorization; service credentials never become browser credentials.
create function public.require_active_api_actor() returns void
language plpgsql set search_path='' as $request$
begin
 if current_user='authenticated' and not private.auth_actor_active() then
  raise exception 'account_inactive' using errcode='42501';
 end if;
end $request$;
revoke all on function public.require_active_api_actor() from public,anon,authenticated,service_role;
grant execute on function public.require_active_api_actor() to anon,authenticated,service_role;

-- Never overwrite a different existing pre-request control. Rehearsal must resolve it first.
do $configuration$
declare previous text;
begin
 if exists(select 1 from pg_roles where rolname='authenticator') then
  select substring(value from length('pgrst.db_pre_request=')+1) into previous
   from pg_db_role_setting s join pg_roles r on r.oid=s.setrole
   cross join lateral unnest(s.setconfig) value
   where r.rolname='authenticator' and s.setdatabase=0 and value like 'pgrst.db_pre_request=%';
  if previous is not null and previous<>'' and previous<>'public.require_active_api_actor' then
   raise exception 'existing_api_pre_request_requires_review:%',previous;
  end if;
  alter role authenticator set pgrst.db_pre_request='public.require_active_api_actor';
 end if;
end $configuration$;

notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
