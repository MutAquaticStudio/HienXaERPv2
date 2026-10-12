begin;
-- A persisted draft must not preserve access to a private field after its read
-- permission is revoked. Deny recovery of the whole immutable payload; never
-- redact it and then replay a different intent. Re-granting access can recover it.
create function private.master_draft_fields_readable(branch uuid,kind text,entries jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare entry jsonb;original jsonb;
begin
 if kind is distinct from 'customers' or private.has_permission(branch,'finance.ar.read')
  or private.has_permission(branch,'finance.ar.adjust') then return true;end if;
 for entry in select value from jsonb_array_elements(entries) loop
  if entry->>0='credit_limit_vnd' and nullif(entry->>1,'') is not null then return false;end if;
  if entry->>0='original' then
   begin original:=(entry->>1)::jsonb;
   exception when invalid_text_representation then raise exception 'invalid_command_draft_field' using errcode='22023';end;
   if original->'credit_limit_vnd' is not null and original->'credit_limit_vnd'<>'null'::jsonb then return false;end if;
  end if;
 end loop;
 return true;
end $$;
revoke all on function private.master_draft_fields_readable(uuid,text,jsonb) from public,anon,authenticated,service_role;

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
 if not private.master_draft_fields_readable(target_branch_id,k,d.form_entries) then
  raise exception 'draft_private_field_access_revoked' using errcode='42501';
 end if;
 return jsonb_build_object('operation_id',d.operation_id,'entries',d.form_entries);
end $$;
notify pgrst,'reload schema';
commit;
