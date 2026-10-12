-- G15: drafts restore one user's exact unresolved intent; not an economic ledger or job engine.
begin;
create table private.command_drafts(
 operation_id uuid primary key,
 actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
 branch_id uuid not null references public.branches(id) on delete restrict,
 command_name text not null check(command_name in('post_payment','receive_purchase_order','verify_supplier_fulfillment')),
 form_entries jsonb not null check(jsonb_typeof(form_entries)='array'),
 payload_hash text not null,
 created_at timestamptz not null default now()
);
alter table private.command_drafts enable row level security;
revoke all on private.command_drafts from public,anon,authenticated,service_role;
create function public.save_command_draft(target_operation_id uuid,target_command text,target_branch_id uuid,target_entries jsonb)
 returns uuid language plpgsql security definer set search_path='' as $draft$
declare d private.command_drafts%rowtype; h text; permission text; entry jsonb;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment')
 or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)>200 or octet_length(target_entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 for entry in select value from jsonb_array_elements(target_entries) loop
  if jsonb_typeof(entry) is distinct from 'array' or jsonb_array_length(entry)<>2
  or jsonb_typeof(entry->0)<>'string' or jsonb_typeof(entry->1)<>'string'
  or entry->>0 ~* '(password|token|secret)' or left(entry->>0,1)='$'
  then raise exception 'invalid_command_draft_field' using errcode='22023';end if;
 end loop;
 h:=private.command_payload_hash(target_entries);
 insert into private.command_drafts(operation_id,actor_auth_user_id,branch_id,command_name,form_entries,payload_hash)
 values(target_operation_id,(select auth.uid()),target_branch_id,target_command,target_entries,h)
 on conflict(operation_id) do nothing;
 select * into d from private.command_drafts where operation_id=target_operation_id for update;
 if d.actor_auth_user_id is distinct from(select auth.uid()) or d.branch_id is distinct from target_branch_id
 or d.command_name is distinct from target_command or d.payload_hash is distinct from h
 then raise exception 'operation_payload_conflict' using errcode='23505';end if;
 return d.operation_id;
end $draft$;
create function public.get_command_draft(target_operation_id uuid,target_command text,target_branch_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $get$
declare d private.command_drafts%rowtype; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 select * into d from private.command_drafts where operation_id=target_operation_id and actor_auth_user_id=(select auth.uid())
 and branch_id=target_branch_id and command_name=target_command;
 if d.operation_id is null then return null;end if;
 return jsonb_build_object('operation_id',d.operation_id,'entries',d.form_entries);
end $get$;
revoke all on function public.save_command_draft(uuid,text,uuid,jsonb),public.get_command_draft(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.save_command_draft(uuid,text,uuid,jsonb),public.get_command_draft(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
