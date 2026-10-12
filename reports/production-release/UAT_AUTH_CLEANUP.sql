-- Owner-authorized UAT cleanup; reserved test domains, already banned,
-- no employee/customer mapping. Preserve real users and every other application row.
do $cleanup$
declare ids uuid[]; refs record; tbl record; n integer; facts jsonb;
 kept_before jsonb:='{}'; kept_after jsonb:='{}'; users_before text; users_after text;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','60s',true);
 perform pg_advisory_xact_lock(hashtextextended('hienxa-authorized-uat-auth-cleanup-20261013',0));
 if current_user<>'postgres' then raise exception 'maintenance_actor_required';end if;
 lock table auth.users,auth.identities,auth.sessions,auth.refresh_tokens in share row exclusive mode;
 for tbl in select schemaname,tablename from pg_tables where schemaname in ('public','private') order by 1,2 loop
  execute format('lock table %I.%I in share row exclusive mode',tbl.schemaname,tbl.tablename);
 end loop;
 select array_agg(u.id order by u.id) into ids from auth.users u
 where u.banned_until>now() and u.email ~* '@(example\.(com|invalid)|.*\.test|qa\.local)$'
 and not exists(select 1 from public.employees e where e.auth_user_id=u.id)
 and not exists(select 1 from public.customer_portal_memberships c where c.auth_user_id=u.id);
 if cardinality(ids)<>8 then raise exception 'reviewed_eight_banned_uat_accounts_required';end if;
 for refs in select ns.nspname s,c.relname t,a.attname col
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace ns on ns.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1]
  where k.contype='f' and k.confrelid='auth.users'::regclass and array_length(k.conkey,1)=1
   and ns.nspname in ('public','private') and c.relname<>'audit_events' loop
  execute format('select count(*) from %I.%I where %I=any($1)',refs.s,refs.t,refs.col) into n using ids;
  if n<>0 then raise exception 'uat_account_has_operational_reference';end if;
 end loop;
 select md5(coalesce(string_agg(md5(to_jsonb(u)::text),',' order by u.id),'')) into users_before
  from auth.users u where not(id=any(ids));
 for tbl in select schemaname,tablename from pg_tables where schemaname in ('public','private') order by 1,2 loop
  execute format('select jsonb_build_object(''n'',count(*),''hash'',md5(coalesce(string_agg(md5(to_jsonb(x)::text),'','' order by to_jsonb(x)::text),''''))) from %I.%I x%s',
   tbl.schemaname,tbl.tablename,case when tbl.schemaname='public' and tbl.tablename='audit_events'
    then format(' where not coalesce(actor_auth_user_id=any(%L::uuid[]),false)',ids) else '' end) into facts;
  kept_before:=kept_before||jsonb_build_object(tbl.schemaname||'.'||tbl.tablename,facts);
 end loop;
 delete from auth.sessions where user_id=any(ids);
 delete from auth.refresh_tokens where user_id=any(select unnest(ids)::text);
 delete from public.audit_events where actor_auth_user_id=any(ids);
 get diagnostics n=row_count; if n<>53 then raise exception 'reviewed_uat_audit_count_changed';end if;
 delete from auth.users where id=any(ids);
 get diagnostics n=row_count; if n<>8 then raise exception 'reviewed_uat_auth_count_changed';end if;
 if exists(select 1 from auth.identities where user_id=any(ids))
  or exists(select 1 from auth.sessions where user_id=any(ids))
 then raise exception 'uat_credentials_or_sessions_remain';end if;
 select md5(coalesce(string_agg(md5(to_jsonb(u)::text),',' order by u.id),'')) into users_after from auth.users u;
 for tbl in select schemaname,tablename from pg_tables where schemaname in ('public','private') order by 1,2 loop
  execute format('select jsonb_build_object(''n'',count(*),''hash'',md5(coalesce(string_agg(md5(to_jsonb(x)::text),'','' order by to_jsonb(x)::text),''''))) from %I.%I x',tbl.schemaname,tbl.tablename) into facts;
  kept_after:=kept_after||jsonb_build_object(tbl.schemaname||'.'||tbl.tablename,facts);
 end loop;
 if users_before is distinct from users_after or kept_before is distinct from kept_after
 then raise exception 'real_user_or_application_data_changed';end if;
end $cleanup$;
