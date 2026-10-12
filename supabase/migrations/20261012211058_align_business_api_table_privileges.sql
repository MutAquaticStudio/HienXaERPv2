-- Supabase's default table ACL can retain DDL/maintenance rights after a
-- migration revokes row writes. Browser API roles only need canonical row
-- privileges; TRUNCATE would bypass RLS and immutable-row guards.
begin;

do $before$
declare acl jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('table',n.nspname||'.'||c.relname,'role',r.role,
  'select',has_table_privilege(r.role,c.oid,'SELECT'),
  'insert',has_table_privilege(r.role,c.oid,'INSERT'),
  'update',has_table_privilege(r.role,c.oid,'UPDATE'),
  'delete',has_table_privilege(r.role,c.oid,'DELETE')) order by c.relname,r.role),'[]'::jsonb)
 into acl from pg_class c join pg_namespace n on n.oid=c.relnamespace
 cross join (values('anon'),('authenticated')) r(role)
 where n.nspname='public' and c.relkind in ('r','p','v','m','f');
 perform set_config('hx.api_row_acl_before',acl::text,true);
end $before$;

revoke truncate, references, trigger, maintain on all tables in schema public
 from anon, authenticated;
alter default privileges for role postgres in schema public
 revoke truncate, references, trigger, maintain on tables from anon, authenticated;

do $after$
declare acl jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('table',n.nspname||'.'||c.relname,'role',r.role,
  'select',has_table_privilege(r.role,c.oid,'SELECT'),
  'insert',has_table_privilege(r.role,c.oid,'INSERT'),
  'update',has_table_privilege(r.role,c.oid,'UPDATE'),
  'delete',has_table_privilege(r.role,c.oid,'DELETE')) order by c.relname,r.role),'[]'::jsonb)
 into acl from pg_class c join pg_namespace n on n.oid=c.relnamespace
 cross join (values('anon'),('authenticated')) r(role)
 where n.nspname='public' and c.relkind in ('r','p','v','m','f');
 if acl is distinct from current_setting('hx.api_row_acl_before')::jsonb
 then raise exception 'business_row_privileges_changed';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join (values('anon'),('authenticated')) r(role)
  where n.nspname='public' and c.relkind in ('r','p','v','m','f')
  and (has_table_privilege(r.role,c.oid,'TRUNCATE')
    or has_table_privilege(r.role,c.oid,'REFERENCES')
    or has_table_privilege(r.role,c.oid,'TRIGGER')
    or has_table_privilege(r.role,c.oid,'MAINTAIN')))
 then raise exception 'api_ddl_privilege_remains';end if;
end $after$;

notify pgrst,'reload schema';
commit;
