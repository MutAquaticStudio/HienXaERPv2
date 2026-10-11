begin;
alter table private.command_drafts drop constraint command_drafts_command_name_check;
alter table private.command_drafts add constraint command_drafts_command_name_check check(command_name in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment'));
CREATE OR REPLACE FUNCTION public.allocate_payment(target_payment_id uuid, allocation_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payment public.payments%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into payment from public.payments where id = target_payment_id;
  if payment.id is null or not private.has_permission(payment.branch_id, 'finance.payment.post') then raise exception 'forbidden_or_payment_not_found' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('payment_id', target_payment_id, 'allocations', allocation_lines));
  perform private.lock_saved_command_intent(allocate_payment.operation_id,'allocate_payment');
  select * into payment from public.payments where id=target_payment_id for update;
  select * into receipt from public.command_receipts where command_receipts.operation_id = allocate_payment.operation_id;
  if found then
    if receipt.command_name <> 'allocate_payment' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into payment from public.payments where id = target_payment_id for update;
  if payment.reversal_of_payment_id is not null or exists (select 1 from public.payments where reversal_of_payment_id = payment.id) then
    raise exception 'payment_not_allocatable' using errcode = '55000';
  end if;
  if jsonb_typeof(allocation_lines) is distinct from 'array' or jsonb_array_length(allocation_lines) not between 1 and 50
   then raise exception 'invalid_allocations' using errcode='22023';end if;
  perform private.allocate_payment_lines(payment.id, allocation_lines, (select auth.uid()));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'allocate_payment', payload_hash, 'payment', payment.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), payment.branch_id, 'payment.allocated', 'payment', payment.id, operation_id, array['allocations']);
  return payment.id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.get_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 select * into d from private.command_drafts where operation_id=target_operation_id and actor_auth_user_id=(select auth.uid())
 and branch_id=target_branch_id and command_name=target_command;
 if d.operation_id is null then return null;end if;
 return jsonb_build_object('operation_id',d.operation_id,'entries',d.form_entries);
end $function$
;
CREATE OR REPLACE FUNCTION public.lookup_command_outcome(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.command_receipts%rowtype; b uuid; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 select * into r from public.command_receipts where operation_id=target_operation_id;
 if r.operation_id is null or r.actor_auth_user_id is distinct from(select auth.uid()) or r.command_name<>target_command
 then return jsonb_build_object('status','UNKNOWN');end if;
 if target_command in('post_payment','allocate_payment') and r.result_type='payment' then
  select branch_id into b from public.payments where id=r.result_entity_id;
 elsif target_command='receive_purchase_order' and r.result_type='purchase_receipt' then
  select branch_id into b from public.purchase_receipts where id=r.result_entity_id;
 elsif target_command='verify_supplier_fulfillment' and r.result_type='supplier_fulfillment' then
  select branch_id into b from public.supplier_fulfillments where id=r.result_entity_id;
 end if;
 if b is null or b is distinct from target_branch_id then return jsonb_build_object('status','UNKNOWN');end if;
 return jsonb_build_object('status','COMMITTED','result_id',r.result_entity_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.save_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid, target_entries jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; h text; permission text; entry jsonb;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment')
 or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)>200 or octet_length(target_entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' else 'inventory.receive' end;
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
end $function$
;
notify pgrst,'reload schema';
commit;
