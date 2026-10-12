-- Extend the existing validated command set without replacing or weakening old entries.
begin;
do $constraint$
declare expression text;
begin
 select pg_get_expr(conbin,conrelid) into expression from pg_constraint
 where conrelid='private.command_drafts'::regclass and conname='command_drafts_command_name_check';
 if expression is null then raise exception 'command_draft_constraint_missing';end if;
 alter table private.command_drafts drop constraint command_drafts_command_name_check;
 execute format('alter table private.command_drafts add constraint command_drafts_command_name_check check ((%s) or command_name in (''save_catalog_record'',''save_customer_site_profile'',''save_branch_config''))',expression);
end $constraint$;
notify pgrst,'reload schema';
commit;
