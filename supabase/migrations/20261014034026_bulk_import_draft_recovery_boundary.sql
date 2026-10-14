-- Forward-only recovery boundary. No business rows or historical migrations are rewritten.
begin;

do $guard$
declare definition text; needle text := 'receipt.command_name <> ''create_sales_order_draft'' or receipt.payload_hash <> payload_hash then';
begin
 definition := pg_get_functiondef('public.create_sales_order_draft(uuid,uuid,uuid,timestamptz,text,jsonb,uuid)'::regprocedure);
 if position(needle in definition)=0 or position('private.require_quantity_lines' in definition)=0 then
  raise exception 'bulk_recovery_so_definition_precondition_failed';
 end if;
 definition := replace(definition,needle,
  'receipt.command_name <> ''create_sales_order_draft'' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from (select auth.uid()) then');
 execute definition;
end $guard$;

-- Permit only the two existing draft RPC command names; retain every deployed command.
do $constraint$
declare expression text;
begin
 select pg_get_expr(conbin,conrelid) into expression from pg_constraint
 where conrelid='private.command_drafts'::regclass and conname='command_drafts_command_name_check';
 if expression is null then raise exception 'command_draft_constraint_missing';end if;
 alter table private.command_drafts drop constraint command_drafts_command_name_check;
 execute format('alter table private.command_drafts add constraint command_drafts_command_name_check check ((%s) or command_name in (''create_sales_order_draft'',''create_purchase_order_draft''))',expression);
end $constraint$;

-- Preserve the complete deployed master/finance recovery adapters, including their ACLs.
do $capture$
declare name text; signature text; definition text;
begin
 foreach name in array array['save_command_draft','get_command_draft','lookup_command_outcome'] loop
  signature := case when name='save_command_draft' then '(uuid,text,uuid,jsonb)' else '(uuid,text,uuid)' end;
  if to_regprocedure('private.bulk_previous_'||name||signature) is not null then
   raise exception 'bulk_recovery_adapter_already_present';
  end if;
  definition := pg_get_functiondef(('public.'||name||signature)::regprocedure);
  if definition is null then raise exception 'bulk_recovery_adapter_missing';end if;
  execute replace(definition,'FUNCTION public.'||name||'(', 'FUNCTION private.bulk_previous_'||name||'(');
  execute 'revoke all on function private.bulk_previous_'||name||signature||' from public,anon,authenticated,service_role';
 end loop;
end $capture$;

create function private.bulk_commercial_draft_allowed(command text,b uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select case command
  when 'create_sales_order_draft' then private.has_permission(b,'orders.create') and private.has_permission(b,'orders.read')
  when 'create_purchase_order_draft' then private.has_permission(b,'purchasing.create') and private.has_permission(b,'purchasing.read') and private.has_permission(b,'purchasing.price.read')
  else false end
$$;
revoke all on function private.bulk_commercial_draft_allowed(text,uuid) from public,anon,authenticated,service_role;

-- Match the canonical RPC's receipt payload, including timestamp normalization.
create function private.bulk_commercial_draft_payload(command text,p jsonb) returns jsonb
 language plpgsql stable set search_path='' as $payload$
begin
 if command='create_sales_order_draft' then
  return jsonb_build_object('branch_id',(p->>'target_branch_id')::uuid,'customer_id',(p->>'target_customer_id')::uuid,
   'site_id',(p->>'target_site_id')::uuid,'delivery_at',(p->>'requested_delivery_at')::timestamptz,
   'terms',p->>'commercial_terms','lines',p->'order_lines');
 elsif command='create_purchase_order_draft' then
  return jsonb_build_object('branch_id',(p->>'target_branch_id')::uuid,'supplier_id',(p->>'target_supplier_id')::uuid,
   'warehouse_id',(p->>'target_warehouse_id')::uuid,'expected_at',(p->>'expected_at')::timestamptz,
   'terms',p->>'commercial_terms','lines',p->'purchase_lines');
 end if;
 raise exception 'invalid_commercial_draft_command' using errcode='22023';
end $payload$;
revoke all on function private.bulk_commercial_draft_payload(text,jsonb) from public,anon,authenticated,service_role;

-- A saved unresolved intent must be the exact payload accepted by the canonical draft RPC.
-- Manual callers with no saved intent keep the existing canonical RPC contract.
create function private.assert_bulk_commercial_draft_matches(command text,b uuid,op uuid,expected_payload jsonb) returns void
 language plpgsql security definer set search_path='' as $assert_intent$
declare d private.command_drafts%rowtype; stored_payload jsonb;
begin
 select * into d from private.command_drafts where operation_id=op for update;
 if d.operation_id is null then return;end if;
 if d.actor_auth_user_id is distinct from auth.uid() or d.branch_id is distinct from b or d.command_name is distinct from command
 then raise exception 'operation_payload_conflict' using errcode='23505';end if;
 stored_payload := private.bulk_commercial_draft_payload(command,(d.form_entries->0->>1)::jsonb);
 if stored_payload is distinct from expected_payload then raise exception 'operation_payload_conflict' using errcode='23505';end if;
end $assert_intent$;
revoke all on function private.assert_bulk_commercial_draft_matches(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Fail closed if the deployed canonical RPC definition no longer has its expected seam.
do $bind_intents$
declare definition text; needle text;
begin
 definition := pg_get_functiondef('public.create_sales_order_draft(uuid,uuid,uuid,timestamptz,text,jsonb,uuid)'::regprocedure);
 needle := 'payload_hash := private.command_payload_hash(payload);';
 if position(needle in definition)=0 or position('private.assert_bulk_commercial_draft_matches' in definition)>0 then raise exception 'bulk_recovery_so_intent_seam_failed';end if;
 definition := replace(definition,needle,needle||E'\n  perform private.assert_bulk_commercial_draft_matches(''create_sales_order_draft'',target_branch_id,operation_id,payload);');
 execute definition;
 definition := pg_get_functiondef('public.create_purchase_order_draft(uuid,uuid,uuid,timestamptz,text,jsonb,uuid)'::regprocedure);
 needle := 'hash := private.command_payload_hash(payload);';
 if position(needle in definition)=0 or position('private.assert_bulk_commercial_draft_matches' in definition)>0 then raise exception 'bulk_recovery_po_intent_seam_failed';end if;
 definition := replace(definition,needle,needle||E'\n  perform private.assert_bulk_commercial_draft_matches(''create_purchase_order_draft'',target_branch_id,operation_id,payload);');
 execute definition;
end $bind_intents$;

create or replace function public.save_command_draft(target_operation_id uuid,target_command text,target_branch_id uuid,target_entries jsonb)
 returns uuid language plpgsql security definer set search_path='' as $save$
declare d private.command_drafts%rowtype; h text; p jsonb; canonical jsonb; item jsonb;
begin
 if target_command is null or target_command not in ('create_sales_order_draft','create_purchase_order_draft') then
  return private.bulk_previous_save_command_draft(target_operation_id,target_command,target_branch_id,target_entries);
 end if;
 if not private.bulk_commercial_draft_allowed(target_command,target_branch_id) then raise exception 'forbidden' using errcode='42501';end if;
 if target_operation_id is null or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)<>1 or jsonb_typeof(target_entries->0) is distinct from 'array'
 or jsonb_array_length(target_entries->0)<>2 or target_entries->0->>0 is distinct from 'canonicalPayload'
 or jsonb_typeof(target_entries->0->1) is distinct from 'string' or octet_length(target_entries::text)>65536
 then raise exception 'invalid_commercial_draft_intent' using errcode='22023';end if;
 p := (target_entries->0->>1)::jsonb;
 if jsonb_typeof(p) is distinct from 'object' or (p->>'target_branch_id')::uuid is distinct from target_branch_id
 or (p->>'operation_id')::uuid is distinct from target_operation_id
 then raise exception 'invalid_commercial_draft_intent' using errcode='22023';end if;
 canonical := private.bulk_commercial_draft_payload(target_command,p);
 h := private.command_payload_hash(target_entries);
 -- Existing immutable intent is returned before looking at master data or current prices.
 select * into d from private.command_drafts where operation_id=target_operation_id for update;
 if d.operation_id is not null then
  if d.actor_auth_user_id is distinct from auth.uid() or d.branch_id is distinct from target_branch_id
  or d.command_name is distinct from target_command or d.payload_hash is distinct from h
  then raise exception 'operation_payload_conflict' using errcode='23505';end if;
  return d.operation_id;
 end if;
 perform private.require_quantity_lines(canonical->'lines',array['quantity','conversion_numerator','conversion_denominator'],false);
 for item in select value from jsonb_array_elements(canonical->'lines') loop
  if target_command='create_sales_order_draft' then
   perform private.assert_commercial_line(target_branch_id,(p->>'target_customer_id')::uuid,item,auth.uid());
  else
   perform private.assert_purchase_line(target_branch_id,(p->>'target_supplier_id')::uuid,item,auth.uid());
  end if;
 end loop;
 insert into private.command_drafts(operation_id,actor_auth_user_id,branch_id,command_name,form_entries,payload_hash)
 values(target_operation_id,auth.uid(),target_branch_id,target_command,target_entries,h) on conflict(operation_id) do nothing;
 select * into d from private.command_drafts where operation_id=target_operation_id for update;
 if d.actor_auth_user_id is distinct from auth.uid() or d.branch_id is distinct from target_branch_id
 or d.command_name is distinct from target_command or d.payload_hash is distinct from h
 then raise exception 'operation_payload_conflict' using errcode='23505';end if;
 return d.operation_id;
end $save$;

create or replace function public.get_command_draft(target_operation_id uuid,target_command text,target_branch_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $get$
declare d private.command_drafts%rowtype;
begin
 if target_command is null or target_command not in ('create_sales_order_draft','create_purchase_order_draft') then
  return private.bulk_previous_get_command_draft(target_operation_id,target_command,target_branch_id);
 end if;
 if not private.bulk_commercial_draft_allowed(target_command,target_branch_id) then raise exception 'forbidden' using errcode='42501';end if;
 select * into d from private.command_drafts where operation_id=target_operation_id and actor_auth_user_id=auth.uid()
  and branch_id=target_branch_id and command_name=target_command;
 if d.operation_id is null then return null;end if;
 return jsonb_build_object('operation_id',d.operation_id,'entries',d.form_entries);
end $get$;

create or replace function public.lookup_command_outcome(target_operation_id uuid,target_command text,target_branch_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $lookup$
declare r public.command_receipts%rowtype; d private.command_drafts%rowtype; b uuid; payload jsonb;
begin
 if target_command is null or target_command not in ('create_sales_order_draft','create_purchase_order_draft') then
  return private.bulk_previous_lookup_command_outcome(target_operation_id,target_command,target_branch_id);
 end if;
 if not private.bulk_commercial_draft_allowed(target_command,target_branch_id) then raise exception 'forbidden' using errcode='42501';end if;
 select * into r from public.command_receipts where operation_id=target_operation_id and actor_auth_user_id=auth.uid() and command_name=target_command;
 if r.operation_id is null then return jsonb_build_object('status','UNKNOWN');end if;
 if target_command='create_sales_order_draft' and r.result_type='sales_order' then
  select branch_id into b from public.sales_orders where id=r.result_entity_id;
 elsif target_command='create_purchase_order_draft' and r.result_type='purchase_order' then
  select branch_id into b from public.purchase_orders where id=r.result_entity_id;
 end if;
 if b is distinct from target_branch_id then return jsonb_build_object('status','UNKNOWN');end if;
 select * into d from private.command_drafts where operation_id=target_operation_id and actor_auth_user_id=auth.uid() and command_name=target_command;
 if d.operation_id is not null then
  payload := private.bulk_commercial_draft_payload(target_command,(d.form_entries->0->>1)::jsonb);
  if d.branch_id is distinct from b or r.payload_hash is distinct from private.command_payload_hash(payload)
  then raise exception 'operation_payload_conflict' using errcode='23505';end if;
 end if;
 return jsonb_build_object('status','COMMITTED','result_id',r.result_entity_id);
end $lookup$;

commit;
