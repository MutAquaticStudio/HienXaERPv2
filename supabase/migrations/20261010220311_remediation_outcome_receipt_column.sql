-- Forward correction against the actual command_receipts result_type column.
begin;
create or replace function public.lookup_command_outcome(target_operation_id uuid,target_command text,target_branch_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $outcome$
declare r public.command_receipts%rowtype; b uuid; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 select * into r from public.command_receipts where operation_id=target_operation_id;
 if r.operation_id is null or r.actor_auth_user_id is distinct from(select auth.uid()) or r.command_name<>target_command
 then return jsonb_build_object('status','UNKNOWN');end if;
 if target_command='post_payment' and r.result_type='payment' then
  select branch_id into b from public.payments where id=r.result_entity_id;
 elsif target_command='receive_purchase_order' and r.result_type='purchase_receipt' then
  select branch_id into b from public.purchase_receipts where id=r.result_entity_id;
 elsif target_command='verify_supplier_fulfillment' and r.result_type='supplier_fulfillment' then
  select branch_id into b from public.supplier_fulfillments where id=r.result_entity_id;
 end if;
 if b is null or b is distinct from target_branch_id then return jsonb_build_object('status','UNKNOWN');end if;
 return jsonb_build_object('status','COMMITTED','result_id',r.result_entity_id);
end $outcome$;
commit;
