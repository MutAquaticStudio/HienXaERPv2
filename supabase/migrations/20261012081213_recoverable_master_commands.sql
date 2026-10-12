begin;
-- Preserve the effective business validators. Only public command/recovery boundaries change.
do $capture$
declare n text; original text; copied text; signature text;
begin
 foreach n in array array['save_catalog_record','save_customer_site_profile','save_branch_config','save_command_draft','get_command_draft','lookup_command_outcome'] loop
  select pg_get_functiondef(p.oid),pg_get_function_identity_arguments(p.oid) into original,signature
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=n;
  if original is null then raise exception 'required_master_contract_missing:%',n;end if;
  copied:=replace(original,'FUNCTION public.'||n||'(', 'FUNCTION private.canonical_'||n||'(');
  if copied=original then raise exception 'master_contract_capture_failed:%',n;end if;
  if n='save_customer_site_profile' then
   copied:=replace(copied,'perform public.save_catalog_record(', 'perform private.canonical_save_catalog_record(');
  end if;
  execute copied;
  execute format('revoke all on function private.%I(%s) from public,anon,authenticated,service_role','canonical_'||n,signature);
 end loop;
end $capture$;

create table private.master_command_contexts(
 operation_id uuid primary key references public.command_receipts(operation_id) on delete restrict,
 actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
 source_branch_id uuid not null references public.branches(id) on delete restrict,
 command_name text not null check(command_name in('save_catalog_record','save_customer_site_profile','save_branch_config')),
 catalog_kind text not null,
 result_entity_id uuid not null,
 recorded_at timestamptz not null default now()
);
alter table private.master_command_contexts enable row level security;
revoke all on private.master_command_contexts from public,anon,authenticated,service_role;

create function private.master_command_allowed(command text,kind text,branch uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and case
 when command='save_branch_config' then (kind is null or kind='branches') and private.has_permission(branch,'roles.manage')
 when command='save_customer_site_profile' then (kind is null or kind in('customers','sites')) and private.has_permission(branch,'customers.manage')
 when command='save_catalog_record' then case
  when kind in('materials','units','groups','conversions') then private.has_permission(branch,'catalog.manage')
  when kind in('warehouses','vehicles','machines') then private.has_permission(branch,'roles.manage')
  when kind='suppliers' then private.has_permission(branch,'suppliers.manage')
  when kind in('customers','sites') then private.has_permission(branch,'customers.manage')
  when kind is null then private.has_permission(branch,'catalog.manage') or private.has_permission(branch,'roles.manage') or private.has_permission(branch,'suppliers.manage') or private.has_permission(branch,'customers.manage')
  else false end
 else false end
$$;
revoke all on function private.master_command_allowed(text,text,uuid) from public,anon,authenticated,service_role;

create function private.execute_master_command(command text,kind text,target_id uuid,branch uuid,values_json jsonb,expected_json jsonb,reason text,intent uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare h text; r public.command_receipts%rowtype; c private.master_command_contexts%rowtype; result uuid;
begin
 if not private.master_command_allowed(command,kind,branch) then raise exception 'forbidden' using errcode='42501';end if;
 if intent is null or target_id is null then raise exception 'invalid_master_intent' using errcode='22023';end if;
 h:=private.command_payload_hash(jsonb_build_object('command',command,'kind',kind,'target',target_id,'branch',branch,'values',values_json,'expected',expected_json,'reason',reason));
 perform pg_advisory_xact_lock(hashtextextended(intent::text,0));
 select * into r from public.command_receipts where operation_id=intent;
 if r.operation_id is not null then
  select * into c from private.master_command_contexts where operation_id=intent;
  if r.actor_auth_user_id is distinct from auth.uid() or r.command_name<>command or r.payload_hash<>h
   or c.actor_auth_user_id is distinct from auth.uid() or c.source_branch_id is distinct from branch
   or c.catalog_kind is distinct from kind then raise exception 'operation_payload_conflict' using errcode='23505';end if;
  return r.result_entity_id;
 end if;
 -- Old success has no durable payload hash. Keep it for explicit review, never fabricate a receipt.
 if exists(select 1 from public.audit_events where trace_id=intent) then raise exception 'legacy_master_intent_requires_review' using errcode='PT409';end if;
 if command='save_branch_config' then result:=private.canonical_save_branch_config(target_id,branch,values_json,expected_json,reason,intent);
 elsif command='save_customer_site_profile' then result:=private.canonical_save_customer_site_profile(kind,target_id,branch,values_json,expected_json,reason,intent);
 else result:=private.canonical_save_catalog_record(kind,target_id,branch,values_json,expected_json,reason,intent);end if;
 insert into public.command_receipts values(intent,auth.uid(),command,h,'catalog_command',result,now());
 insert into private.master_command_contexts(operation_id,actor_auth_user_id,source_branch_id,command_name,catalog_kind,result_entity_id)
 values(intent,auth.uid(),branch,command,kind,result);
 return result;
end $$;
revoke all on function private.execute_master_command(text,text,uuid,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.save_catalog_record(kind text,target_id uuid,target_branch_id uuid,values_json jsonb,expected_json jsonb,change_reason text,operation_id uuid)
returns uuid language sql security definer set search_path='' as $$
 select private.execute_master_command('save_catalog_record',kind,target_id,target_branch_id,values_json,expected_json,change_reason,operation_id)
$$;
create or replace function public.save_customer_site_profile(kind text,target_id uuid,target_branch_id uuid,values_json jsonb,expected_json jsonb,change_reason text,operation_id uuid)
returns uuid language sql security definer set search_path='' as $$
 select private.execute_master_command('save_customer_site_profile',kind,target_id,target_branch_id,values_json,expected_json,change_reason,operation_id)
$$;
create or replace function public.save_branch_config(target_id uuid,source_branch_id uuid,values_json jsonb,expected_json jsonb,change_reason text,operation_id uuid)
returns uuid language sql security definer set search_path='' as $$
 select private.execute_master_command('save_branch_config','branches',target_id,source_branch_id,values_json,expected_json,change_reason,operation_id)
$$;

create function private.master_kind(entries jsonb) returns text language plpgsql immutable set search_path='' as $$
declare n integer;k text;entry jsonb;
begin
 if entries is null or jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries)>200 or octet_length(entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(entries) loop
  if jsonb_typeof(entry) is distinct from 'array' or jsonb_array_length(entry)<>2 or jsonb_typeof(entry->0)<>'string' or jsonb_typeof(entry->1)<>'string'
   or entry->>0 ~* '(password|token|secret)' or left(entry->>0,1)='$' then raise exception 'invalid_command_draft_field' using errcode='22023';end if;
 end loop;
 select count(*),max(e->>1) into n,k from jsonb_array_elements(entries) e where e->>0='kind';
 if n<>1 then raise exception 'invalid_master_kind' using errcode='22023';end if;
 return k;
end $$;
revoke all on function private.master_kind(jsonb) from public,anon,authenticated,service_role;

create or replace function public.save_command_draft(target_operation_id uuid,target_command text,target_branch_id uuid,target_entries jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare d private.command_drafts%rowtype;h text;k text;
begin
 if target_command is null or target_command not in('save_catalog_record','save_customer_site_profile','save_branch_config') then
  return private.canonical_save_command_draft(target_operation_id,target_command,target_branch_id,target_entries);
 end if;
 k:=private.master_kind(target_entries);
 if not private.master_command_allowed(target_command,k,target_branch_id) then raise exception 'forbidden' using errcode='42501';end if;
 if target_operation_id is null then raise exception 'invalid_command_draft' using errcode='22023';end if;
 h:=private.command_payload_hash(target_entries);
 insert into private.command_drafts(operation_id,actor_auth_user_id,branch_id,command_name,form_entries,payload_hash)
 values(target_operation_id,auth.uid(),target_branch_id,target_command,target_entries,h) on conflict(operation_id) do nothing;
 select * into d from private.command_drafts where operation_id=target_operation_id for update;
 if d.actor_auth_user_id is distinct from auth.uid() or d.branch_id is distinct from target_branch_id or d.command_name is distinct from target_command or d.payload_hash is distinct from h
 then raise exception 'operation_payload_conflict' using errcode='23505';end if;
 return d.operation_id;
end $$;

create or replace function public.get_command_draft(target_operation_id uuid,target_command text,target_branch_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.command_drafts%rowtype;k text;
begin
 if target_command is null or target_command not in('save_catalog_record','save_customer_site_profile','save_branch_config') then
  return private.canonical_get_command_draft(target_operation_id,target_command,target_branch_id);
 end if;
 select * into d from private.command_drafts where operation_id=target_operation_id and actor_auth_user_id=auth.uid() and branch_id=target_branch_id and command_name=target_command;
 if d.operation_id is not null then k:=private.master_kind(d.form_entries);end if;
 if not private.master_command_allowed(target_command,k,target_branch_id) then raise exception 'forbidden' using errcode='42501';end if;
 if d.operation_id is null then return null;end if;
 return jsonb_build_object('operation_id',d.operation_id,'entries',d.form_entries);
end $$;

create or replace function public.lookup_command_outcome(target_operation_id uuid,target_command text,target_branch_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.master_command_contexts%rowtype;d private.command_drafts%rowtype;r public.command_receipts%rowtype;k text;
begin
 if target_command is null or target_command not in('save_catalog_record','save_customer_site_profile','save_branch_config') then
  return private.canonical_lookup_command_outcome(target_operation_id,target_command,target_branch_id);
 end if;
 select * into c from private.master_command_contexts where operation_id=target_operation_id and actor_auth_user_id=auth.uid() and source_branch_id=target_branch_id and command_name=target_command;
 if c.operation_id is not null then k:=c.catalog_kind;else
  select * into d from private.command_drafts where operation_id=target_operation_id and actor_auth_user_id=auth.uid() and branch_id=target_branch_id and command_name=target_command;
  if d.operation_id is not null then k:=private.master_kind(d.form_entries);end if;
 end if;
 if not private.master_command_allowed(target_command,k,target_branch_id) then raise exception 'forbidden' using errcode='42501';end if;
 if c.operation_id is null then return jsonb_build_object('status','UNKNOWN');end if;
 select * into r from public.command_receipts where operation_id=c.operation_id and actor_auth_user_id=auth.uid() and command_name=target_command and result_entity_id=c.result_entity_id;
 if r.operation_id is null then return jsonb_build_object('status','UNKNOWN');end if;
 return jsonb_build_object('status','COMMITTED','result_id',r.result_entity_id);
end $$;
notify pgrst,'reload schema';
commit;
