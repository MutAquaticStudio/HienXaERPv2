begin;
create or replace function public.reverse_customer_credit_offset(target_offset_operation_id uuid,reversal_reason text,operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $body$
declare c public.customer_credits%rowtype; settlement_row public.customer_credit_settlements%rowtype; allocation_row public.payment_allocations%rowtype;
 receipt public.command_receipts%rowtype; original_receipt public.command_receipts%rowtype; hash text; allocation_id uuid;
begin
 select * into original_receipt from public.command_receipts where command_receipts.operation_id=target_offset_operation_id and command_name='offset_customer_credit';
 select * into c from public.customer_credits where id=original_receipt.result_entity_id;
 if c.id is null or not private.has_permission(c.branch_id,'finance.payment.reverse') then raise exception 'forbidden_or_customer_credit_not_found' using errcode='42501';end if;
 hash:=private.command_payload_hash(jsonb_build_object('offset_operation_id',target_offset_operation_id,'reason',trim(reversal_reason)));
 perform private.lock_saved_command_intent(operation_id,'reverse_customer_credit_offset');
 select * into c from public.customer_credits where id=c.id for update;
 select * into receipt from public.command_receipts where command_receipts.operation_id=reverse_customer_credit_offset.operation_id;
 if found then if receipt.command_name<>'reverse_customer_credit_offset' or receipt.payload_hash<>hash then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;end if;
 if coalesce(length(trim(reversal_reason)),0) not between 3 and 500 then raise exception 'reversal_reason_required' using errcode='22023';end if;
 perform 1 from public.payments p where p.id in(select source_payment_id from public.customer_credit_funds where credit_id=c.id) order by p.id for update;
 perform 1 from public.receivable_obligations o where o.id in(select a.receivable_obligation_id from public.customer_credit_settlements s
  join public.payment_allocations a on a.id=s.payment_allocation_id where s.source_operation_id=target_offset_operation_id) order by o.id for update;
 for settlement_row in select * from public.customer_credit_settlements where source_operation_id=target_offset_operation_id and amount_delta_vnd>0 order by id loop
  if exists(select 1 from public.customer_credit_settlements r where r.reversal_of_settlement_id=settlement_row.id)
  then raise exception 'customer_credit_offset_already_reversed' using errcode='55000';end if;
  if exists(select 1 from public.payment_allocations r where r.reversal_of_allocation_id=settlement_row.payment_allocation_id)
  then raise exception 'customer_credit_offset_has_downstream_credit' using errcode='55000';end if;
  select * into allocation_row from public.payment_allocations where id=settlement_row.payment_allocation_id;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by)
   values(allocation_row.payment_id,allocation_row.receivable_obligation_id,-allocation_row.amount_delta_vnd,allocation_row.id,(select auth.uid())) returning id into allocation_id;
  insert into public.customer_credit_settlements(credit_fund_id,settlement_kind,amount_delta_vnd,payment_allocation_id,reversal_of_settlement_id,source_operation_id,recorded_by)
   values(settlement_row.credit_fund_id,'OFFSET',-settlement_row.amount_delta_vnd,allocation_id,settlement_row.id,operation_id,(select auth.uid()));
 end loop;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),c.branch_id,'customer.credit_offset_reversed','customer_credit',c.id,operation_id,array['settlement_reversal','receivable_allocation'],trim(reversal_reason));
 insert into public.command_receipts values(operation_id,(select auth.uid()),'reverse_customer_credit_offset',hash,'customer_credit',c.id,now());
 return c.id;
end $body$;
notify pgrst,'reload schema';
commit;
