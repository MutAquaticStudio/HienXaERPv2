begin;
create function private.guard_customer_credit_settlement() returns trigger language plpgsql security definer set search_path='' as $body$
declare f public.customer_credit_funds%rowtype; c public.customer_credits%rowtype; p public.payments%rowtype;
 a public.payment_allocations%rowtype; o public.receivable_obligations%rowtype; original public.customer_credit_settlements%rowtype;
begin
 select * into f from public.customer_credit_funds where id=new.credit_fund_id;
 select * into c from public.customer_credits where id=f.credit_id;
 if f.id is null or c.id is null then raise exception 'customer_credit_settlement_source_invalid' using errcode='23514';end if;
 if new.amount_delta_vnd>0 then
  if new.amount_delta_vnd>private.customer_credit_fund_remaining(f.id) or new.amount_delta_vnd>private.customer_credit_remaining(c.id)
  then raise exception 'customer_credit_settlement_exceeds_remaining' using errcode='23514';end if;
  if new.settlement_kind='REFUND' then
   select * into p from public.payments where id=new.payment_id;
   if p.id is null or p.direction<>'DISBURSEMENT' or p.customer_id is distinct from c.customer_id or p.branch_id<>c.branch_id
    or p.customer_credit_refund_id is distinct from c.id or p.reversal_of_payment_id is not null
    or exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id)
    or new.amount_delta_vnd+coalesce((select sum(s.amount_delta_vnd) from public.customer_credit_settlements s where s.payment_id=p.id),0)>p.amount_vnd
   then raise exception 'customer_credit_refund_payment_invalid' using errcode='23514';end if;
  else
   select * into a from public.payment_allocations where id=new.payment_allocation_id;
   select * into o from public.receivable_obligations where id=a.receivable_obligation_id;
   if a.id is null or a.payment_id<>f.source_payment_id or a.amount_delta_vnd<>new.amount_delta_vnd or a.reversal_of_allocation_id is not null
    or o.id is null or o.branch_id<>c.branch_id or o.customer_id is distinct from c.customer_id
   then raise exception 'customer_credit_offset_allocation_invalid' using errcode='23514';end if;
  end if;
 else
  select * into original from public.customer_credit_settlements where id=new.reversal_of_settlement_id;
  if original.id is null or original.amount_delta_vnd<=0 or new.credit_fund_id<>original.credit_fund_id
   or new.settlement_kind<>original.settlement_kind or new.amount_delta_vnd<>-original.amount_delta_vnd
  then raise exception 'customer_credit_reversal_source_invalid' using errcode='23514';end if;
  if new.settlement_kind='REFUND' then
   select * into p from public.payments where id=new.source_reversal_payment_id;
   if new.payment_id is distinct from original.payment_id or p.reversal_of_payment_id is distinct from original.payment_id
   then raise exception 'customer_credit_refund_reversal_invalid' using errcode='23514';end if;
  else
   select * into a from public.payment_allocations where id=new.payment_allocation_id;
   if a.id is null or a.reversal_of_allocation_id is distinct from original.payment_allocation_id
    or a.amount_delta_vnd<>new.amount_delta_vnd or new.source_reversal_payment_id is not null
   then raise exception 'customer_credit_offset_reversal_invalid' using errcode='23514';end if;
  end if;
 end if;
 return new;
end $body$;
revoke all on function private.guard_customer_credit_settlement() from public,anon,authenticated,service_role;
create trigger customer_credit_settlement_source before insert on public.customer_credit_settlements
 for each row execute function private.guard_customer_credit_settlement();

create function public.refund_customer_credit(target_credit_id uuid,target_account_id uuid,refund_amount_vnd bigint,
 refunded_at timestamptz,refund_method text,refund_reference text,operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $body$
declare c public.customer_credits%rowtype; f public.customer_credit_funds%rowtype; receipt public.command_receipts%rowtype;
 hash text; payment_id uuid; left_to_refund bigint; part bigint;
begin
 select * into c from public.customer_credits where id=target_credit_id;
 if c.id is null or not private.has_permission(c.branch_id,'finance.payment.post') then raise exception 'forbidden_or_customer_credit_not_found' using errcode='42501';end if;
 hash:=private.command_payload_hash(jsonb_build_object('credit_id',target_credit_id,'account_id',target_account_id,'amount',refund_amount_vnd,
  'at',refunded_at,'method',refund_method,'reference',nullif(trim(refund_reference),'')));
 perform private.lock_saved_command_intent(operation_id,'refund_customer_credit');
 select * into c from public.customer_credits where id=target_credit_id for update;
 select * into receipt from public.command_receipts where command_receipts.operation_id=refund_customer_credit.operation_id;
 if found then if receipt.command_name<>'refund_customer_credit' or receipt.payload_hash<>hash then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;end if;
 if refund_amount_vnd is null or refund_amount_vnd<=0 or refunded_at is null or not isfinite(refunded_at)
  or refund_method is null or refund_method not in('CASH','BANK_TRANSFER','CARD','OTHER') or length(coalesce(refund_reference,''))>160
  or not exists(select 1 from public.finance_accounts a where a.id=target_account_id and a.branch_id=c.branch_id and a.active)
 then raise exception 'invalid_customer_credit_refund' using errcode='22023';end if;
 if refund_amount_vnd>private.customer_credit_remaining(c.id) then raise exception 'customer_credit_settlement_exceeds_remaining' using errcode='23514';end if;
 perform 1 from public.payments p where p.id in(select source_payment_id from public.customer_credit_funds where credit_id=c.id) order by p.id for update;
 insert into public.payments(branch_id,payment_number,direction,customer_id,account_id,amount_vnd,method,external_reference,effective_at,posted_by,customer_credit_refund_id)
  values(c.branch_id,'REF-'||to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.finance_payment_number_seq')::text,6,'0'),
   'DISBURSEMENT',c.customer_id,target_account_id,refund_amount_vnd,refund_method,nullif(trim(refund_reference),''),refunded_at,(select auth.uid()),c.id) returning id into payment_id;
 left_to_refund:=refund_amount_vnd;
 for f in select * from public.customer_credit_funds where credit_id=c.id order by source_payment_id,id loop
  exit when left_to_refund=0;part:=least(left_to_refund,private.customer_credit_fund_remaining(f.id));if part<=0 then continue;end if;
  insert into public.customer_credit_settlements(credit_fund_id,settlement_kind,amount_delta_vnd,payment_id,source_operation_id,recorded_by)
   values(f.id,'REFUND',part,payment_id,operation_id,(select auth.uid()));left_to_refund:=left_to_refund-part;
 end loop;
 if left_to_refund<>0 then raise exception 'customer_credit_funding_incomplete' using errcode='23514';end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),c.branch_id,'customer.credit_refunded','payment',payment_id,operation_id,array['source_credit','settlement','cash'],coalesce(nullif(trim(refund_reference),''),'Hoàn tiền khoản có theo nguồn đã duyệt'));
 insert into public.command_receipts values(operation_id,(select auth.uid()),'refund_customer_credit',hash,'payment',payment_id,now());
 return payment_id;
end $body$;

create function public.offset_customer_credit(target_credit_id uuid,target_obligation_id uuid,offset_amount_vnd bigint,operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $body$
declare c public.customer_credits%rowtype; f public.customer_credit_funds%rowtype; o public.receivable_obligations%rowtype;
 receipt public.command_receipts%rowtype; hash text; left_to_offset bigint; part bigint; allocation_id uuid;
begin
 select * into c from public.customer_credits where id=target_credit_id;
 if c.id is null or not private.has_permission(c.branch_id,'finance.payment.post') then raise exception 'forbidden_or_customer_credit_not_found' using errcode='42501';end if;
 hash:=private.command_payload_hash(jsonb_build_object('credit_id',target_credit_id,'obligation_id',target_obligation_id,'amount',offset_amount_vnd));
 perform private.lock_saved_command_intent(operation_id,'offset_customer_credit');
 select * into c from public.customer_credits where id=target_credit_id for update;
 select * into receipt from public.command_receipts where command_receipts.operation_id=offset_customer_credit.operation_id;
 if found then if receipt.command_name<>'offset_customer_credit' or receipt.payload_hash<>hash then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;end if;
 if offset_amount_vnd is null or offset_amount_vnd<=0 then raise exception 'invalid_customer_credit_offset' using errcode='22023';end if;
 if offset_amount_vnd>private.customer_credit_remaining(c.id) then raise exception 'customer_credit_settlement_exceeds_remaining' using errcode='23514';end if;
 perform 1 from public.payments p where p.id in(select source_payment_id from public.customer_credit_funds where credit_id=c.id) order by p.id for update;
 select * into o from public.receivable_obligations where id=target_obligation_id for update;
 if o.id is null or o.branch_id<>c.branch_id or o.customer_id is distinct from c.customer_id then raise exception 'customer_credit_offset_scope_mismatch' using errcode='42501';end if;
 if offset_amount_vnd>private.current_receivable_outstanding(o.id) then raise exception 'allocation_exceeds_outstanding' using errcode='23514';end if;
 left_to_offset:=offset_amount_vnd;
 for f in select * from public.customer_credit_funds where credit_id=c.id order by source_payment_id,id loop
  exit when left_to_offset=0;part:=least(left_to_offset,private.customer_credit_fund_remaining(f.id));if part<=0 then continue;end if;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,allocated_by)
   values(f.source_payment_id,o.id,part,(select auth.uid())) returning id into allocation_id;
  insert into public.customer_credit_settlements(credit_fund_id,settlement_kind,amount_delta_vnd,payment_allocation_id,source_operation_id,recorded_by)
   values(f.id,'OFFSET',part,allocation_id,operation_id,(select auth.uid()));left_to_offset:=left_to_offset-part;
 end loop;
 if left_to_offset<>0 then raise exception 'customer_credit_funding_incomplete' using errcode='23514';end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values((select auth.uid()),c.branch_id,'customer.credit_offset','customer_credit',c.id,operation_id,array['source_credit','settlement','receivable_allocation']);
 insert into public.command_receipts values(operation_id,(select auth.uid()),'offset_customer_credit',hash,'customer_credit',c.id,now());
 return c.id;
end $body$;

create function public.reverse_customer_credit_offset(target_offset_operation_id uuid,reversal_reason text,operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $body$
declare c public.customer_credits%rowtype; s public.customer_credit_settlements%rowtype; a public.payment_allocations%rowtype;
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
 for s in select * from public.customer_credit_settlements where source_operation_id=target_offset_operation_id and amount_delta_vnd>0 order by id loop
  if exists(select 1 from public.customer_credit_settlements r where r.reversal_of_settlement_id=s.id)
  then raise exception 'customer_credit_offset_already_reversed' using errcode='55000';end if;
  if exists(select 1 from public.payment_allocations r where r.reversal_of_allocation_id=s.payment_allocation_id)
  then raise exception 'customer_credit_offset_has_downstream_credit' using errcode='55000';end if;
  select * into a from public.payment_allocations where id=s.payment_allocation_id;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by)
   values(a.payment_id,a.receivable_obligation_id,-a.amount_delta_vnd,a.id,(select auth.uid())) returning id into allocation_id;
  insert into public.customer_credit_settlements(credit_fund_id,settlement_kind,amount_delta_vnd,payment_allocation_id,reversal_of_settlement_id,source_operation_id,recorded_by)
   values(s.credit_fund_id,'OFFSET',-s.amount_delta_vnd,allocation_id,s.id,operation_id,(select auth.uid()));
 end loop;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),c.branch_id,'customer.credit_offset_reversed','customer_credit',c.id,operation_id,array['settlement_reversal','receivable_allocation'],trim(reversal_reason));
 insert into public.command_receipts values(operation_id,(select auth.uid()),'reverse_customer_credit_offset',hash,'customer_credit',c.id,now());
 return c.id;
end $body$;
revoke all on function public.refund_customer_credit(uuid,uuid,bigint,timestamptz,text,text,uuid),
 public.offset_customer_credit(uuid,uuid,bigint,uuid),public.reverse_customer_credit_offset(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.refund_customer_credit(uuid,uuid,bigint,timestamptz,text,text,uuid),
 public.offset_customer_credit(uuid,uuid,bigint,uuid),public.reverse_customer_credit_offset(uuid,text,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.reverse_payment(target_payment_id uuid, reversal_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare original public.payments%rowtype; payload_hash text; receipt public.command_receipts%rowtype; reversal_id uuid;
begin
  select * into original from public.payments where id=target_payment_id;
  if original.id is null or not private.has_permission(original.branch_id,'finance.payment.reverse') then raise exception 'forbidden_or_payment_not_found' using errcode='42501'; end if;
  if char_length(trim(reversal_reason)) not between 3 and 500 then raise exception 'reversal_reason_required' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('payment_id',target_payment_id,'reason',trim(reversal_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id=reverse_payment.operation_id;
  if found then if receipt.command_name<>'reverse_payment' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  if original.customer_credit_refund_id is not null then perform 1 from public.customer_credits where id=original.customer_credit_refund_id for update;end if;
  select * into original from public.payments where id=target_payment_id for update;
  if exists(select 1 from public.customer_credit_funds f where f.source_payment_id=original.id) then raise exception 'payment_funds_customer_credit_use_source_workflow' using errcode='55000';end if;
  if original.reversal_of_payment_id is not null or exists(select 1 from public.payments where reversal_of_payment_id=original.id) then raise exception 'payment_already_reversed_or_is_reversal' using errcode='55000'; end if;
  insert into public.payments(branch_id,payment_number,direction,customer_id,supplier_id,employee_id,account_id,amount_vnd,method,external_reference,effective_at,reversal_of_payment_id,reversal_reason,posted_by) values(original.branch_id,'REV-'||to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.finance_payment_number_seq')::text,6,'0'),case when original.direction='RECEIPT' then 'DISBURSEMENT' else 'RECEIPT' end,original.customer_id,original.supplier_id,original.employee_id,original.account_id,original.amount_vnd,original.method,original.external_reference,now(),original.id,trim(reversal_reason),(select auth.uid())) returning id into reversal_id;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,payable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by) select reversal_id,receivable_obligation_id,payable_obligation_id,-amount_delta_vnd,id,(select auth.uid()) from public.payment_allocations where payment_id=original.id and reversal_of_allocation_id is null;
  insert into public.advance_allocations(branch_id,advance_id,amount_delta_vnd,reversal_of_advance_allocation_id,source_reversal_payment_id,recorded_by)
  select branch_id,advance_id,-amount_delta_vnd,id,reversal_id,(select auth.uid()) from public.advance_allocations
  where advance_id in(select id from public.advances where payment_id=original.id and reversal_of_advance_id is null)
   and amount_delta_vnd>0;
  insert into public.advances(branch_id,payment_id,advance_side,customer_id,supplier_id,amount_delta_vnd,reversal_of_advance_id,recorded_by) select branch_id,reversal_id,advance_side,customer_id,supplier_id,-amount_delta_vnd,id,(select auth.uid()) from public.advances where payment_id=original.id and reversal_of_advance_id is null;
  if original.customer_credit_refund_id is not null then
    insert into public.customer_credit_settlements(credit_fund_id,settlement_kind,amount_delta_vnd,payment_id,
      reversal_of_settlement_id,source_reversal_payment_id,source_operation_id,recorded_by)
    select credit_fund_id,'REFUND',-amount_delta_vnd,payment_id,id,reversal_id,operation_id,(select auth.uid())
      from public.customer_credit_settlements where payment_id=original.id and amount_delta_vnd>0;
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'reverse_payment',payload_hash,'payment',reversal_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values((select auth.uid()),original.branch_id,'payment.reversed','payment',original.id,operation_id,array['reversal'],trim(reversal_reason));
  return reversal_id;
end $function$
;
notify pgrst,'reload schema';
commit;
