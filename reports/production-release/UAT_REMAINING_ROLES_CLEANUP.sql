-- Explicit LIVE-UAT labels; no employee/branch assignment. Ordinary FK cascade.
do $cleanup$
declare ids uuid[]; n integer; kept_roles text; kept_permissions text; actual text;
begin
 perform set_config('lock_timeout','5s',true);
 lock table public.roles,public.role_permissions,public.employee_branch_access in share row exclusive mode;
 select array_agg(id order by id) into ids from public.roles where code in
 ('live_uat_finance','live_uat_proof_setup_b','live_uat_purchasing','live_uat_warehouse');
 if cardinality(ids)<>4 or exists(select 1 from public.employee_branch_access where role_id=any(ids))
 then raise exception 'reviewed_unassigned_live_uat_roles_required';end if;
 select count(*) into n from public.role_permissions where role_id=any(ids);
 if n<>39 then raise exception 'reviewed_live_uat_permissions_changed';end if;
 select md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) into kept_roles from public.roles x where not(id=any(ids));
 select md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) into kept_permissions from public.role_permissions x where not(role_id=any(ids));
 delete from public.roles where id=any(ids);
 get diagnostics n=row_count;if n<>4 then raise exception 'live_uat_role_delete_count_changed';end if;
 select md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) into actual from public.roles x;
 if actual is distinct from kept_roles then raise exception 'real_roles_changed';end if;
 select md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) into actual from public.role_permissions x;
 if actual is distinct from kept_permissions then raise exception 'real_permissions_changed';end if;
end $cleanup$;
