begin;
create function public.customer_credit_balances(target_credit_id uuid)
 returns table(remaining_vnd bigint,refunded_vnd bigint,offset_vnd bigint)
language plpgsql stable security definer set search_path='' as $body$
declare c public.customer_credits%rowtype;
begin
 select * into c from public.customer_credits where id=target_credit_id;
 if c.id is null or not private.has_permission(c.branch_id,'finance.ar.read') then return;end if;
 return query select private.customer_credit_remaining(c.id),
  coalesce((select sum(s.amount_delta_vnd) from public.customer_credit_settlements s join public.customer_credit_funds f on f.id=s.credit_fund_id
    where f.credit_id=c.id and s.settlement_kind='REFUND'),0)::bigint,
  coalesce((select sum(s.amount_delta_vnd) from public.customer_credit_settlements s join public.customer_credit_funds f on f.id=s.credit_fund_id
    where f.credit_id=c.id and s.settlement_kind='OFFSET'),0)::bigint;
end $body$;
revoke all on function public.customer_credit_balances(uuid) from public,anon,authenticated,service_role;
grant execute on function public.customer_credit_balances(uuid) to authenticated;
create view public.customer_credit_read with(security_barrier=true) as
 select c.id,c.branch_id,c.customer_id,c.return_case_id,c.obligation_id,c.reason,c.approved_at,
  c.approved_credit_vnd::text approved_credit_vnd,c.amount_vnd::text amount_vnd,
  b.remaining_vnd::text remaining_vnd,b.refunded_vnd::text refunded_vnd,b.offset_vnd::text offset_vnd,
  l.delivery_id,o.order_number,d.delivery_number
 from public.customer_credits c cross join lateral public.customer_credit_balances(c.id)b
 join public.return_cases r on r.id=c.return_case_id join public.delivery_lines l on l.id=r.delivery_line_id
 join public.deliveries d on d.id=l.delivery_id join public.sales_orders o on o.id=d.sales_order_id
 where private.has_permission(c.branch_id,'finance.ar.read');
create view public.customer_return_finance_read with(security_barrier=true) as
 select r.id,r.branch_id,o.customer_id,d.id delivery_id,d.delivery_number,o.order_number,
  r.base_quantity::text base_quantity,sl.material_name_snapshot,r.reason,
  least(v.receivable_amount_vnd,round(r.base_quantity*l.unit_price_vnd*l.conversion_denominator/l.conversion_numerator)::bigint)::text maximum_credit_vnd,
  exists(select 1 from public.receivable_adjustments a where a.return_case_id=r.id) legacy_adjustment_exists
 from public.return_cases r join public.delivery_verification_lines v on v.id=r.delivery_verification_line_id
 join public.delivery_lines l on l.id=r.delivery_line_id join public.deliveries d on d.id=l.delivery_id
 join public.sales_order_lines sl on sl.id=l.sales_order_line_id
 join public.sales_orders o on o.id=d.sales_order_id
 where r.case_kind='CUSTOMER_RETURN' and r.state='RETURNED' and private.has_permission(r.branch_id,'finance.ar.read')
  and not exists(select 1 from public.customer_credits c where c.return_case_id=r.id);
revoke all on public.customer_credit_read,public.customer_return_finance_read from public,anon,authenticated;
grant select on public.customer_credit_read,public.customer_return_finance_read to authenticated;
alter table private.command_drafts drop constraint command_drafts_command_name_check;
alter table private.command_drafts add constraint command_drafts_command_name_check check(command_name in(
 'post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable',
 'refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset'));

CREATE OR REPLACE FUNCTION public.get_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' else 'inventory.receive' end;
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
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' else 'inventory.receive' end;
 if not private.has_permission(target_branch_id,permission) then raise exception 'forbidden' using errcode='42501';end if;
 select * into r from public.command_receipts where operation_id=target_operation_id;
 if r.operation_id is null or r.actor_auth_user_id is distinct from(select auth.uid()) or r.command_name<>target_command
 then return jsonb_build_object('status','UNKNOWN');end if;
 if target_command in('post_payment','allocate_payment','refund_customer_credit') and r.result_type='payment' then
  select branch_id into b from public.payments where id=r.result_entity_id;
 elsif target_command='adjust_return_receivable' and r.result_type='receivable_adjustment' then
  select o.branch_id into b from public.receivable_adjustments a join public.receivable_obligations o on o.id=a.obligation_id where a.id=r.result_entity_id;
 elsif target_command in('adjust_return_receivable','offset_customer_credit','reverse_customer_credit_offset') and r.result_type='customer_credit' then
  select branch_id into b from public.customer_credits where id=r.result_entity_id;
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
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset')
 or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)>200 or octet_length(target_entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' else 'inventory.receive' end;
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
