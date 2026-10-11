begin;
-- Classify previously collected advances through their actual allocations; never post cash again.
create table public.advance_allocations(
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id) on delete restrict,
 advance_id uuid not null references public.advances(id) on delete restrict,
 payment_allocation_id uuid unique references public.payment_allocations(id) on delete restrict,
 amount_delta_vnd bigint not null check(amount_delta_vnd<>0),
 reversal_of_advance_allocation_id uuid unique references public.advance_allocations(id) on delete restrict,
 source_reversal_payment_id uuid references public.payments(id) on delete restrict,
 recorded_by uuid not null references auth.users(id) on delete restrict,
 recorded_at timestamptz not null default now(),
 check((amount_delta_vnd>0 and payment_allocation_id is not null and reversal_of_advance_allocation_id is null and source_reversal_payment_id is null)
  or(amount_delta_vnd<0 and payment_allocation_id is null and reversal_of_advance_allocation_id is not null and source_reversal_payment_id is not null))
);
create index advance_allocations_source_idx on public.advance_allocations(advance_id,recorded_at);
alter table public.advance_allocations enable row level security;
revoke all on public.advance_allocations from public,anon,authenticated;
grant select on public.advance_allocations to authenticated;
create policy advance_allocations_read on public.advance_allocations for select to authenticated
 using(private.has_permission(branch_id,'finance.ar.read') or private.has_permission(branch_id,'finance.ap.read') or private.has_permission(branch_id,'finance.payment.post'));
create trigger advance_allocations_immutable before update or delete on public.advance_allocations
 for each row execute function private.reject_r6_posted_mutation();

create function private.advance_remaining(target_advance_id uuid) returns bigint
language sql stable security definer set search_path='' as $body$
 select (a.amount_delta_vnd+coalesce((select sum(r.amount_delta_vnd) from public.advances r where r.reversal_of_advance_id=a.id),0)
 -coalesce((select sum(c.amount_delta_vnd) from public.advance_allocations c where c.advance_id=a.id),0))::bigint
 from public.advances a where a.id=target_advance_id and a.reversal_of_advance_id is null
$body$;
revoke all on function private.advance_remaining(uuid) from public,anon,authenticated,service_role;

create function private.guard_advance_allocation_source() returns trigger language plpgsql security definer set search_path='' as $body$
declare a public.advances%rowtype; allocation public.payment_allocations%rowtype; original public.advance_allocations%rowtype;
begin
 select * into a from public.advances where id=new.advance_id;
 if a.id is null or a.reversal_of_advance_id is not null or a.branch_id<>new.branch_id then raise exception 'advance_source_invalid' using errcode='23514';end if;
 if new.amount_delta_vnd>0 then
  select * into allocation from public.payment_allocations where id=new.payment_allocation_id;
  if allocation.id is null or allocation.payment_id<>a.payment_id or allocation.amount_delta_vnd<new.amount_delta_vnd
   or new.amount_delta_vnd>private.advance_remaining(a.id) then raise exception 'advance_allocation_exceeds_source' using errcode='23514';end if;
 else
  select * into original from public.advance_allocations where id=new.reversal_of_advance_allocation_id;
  if original.id is null or original.advance_id<>new.advance_id or original.amount_delta_vnd<=0 or new.amount_delta_vnd<>-original.amount_delta_vnd
   or not exists(select 1 from public.payments p where p.id=new.source_reversal_payment_id and p.reversal_of_payment_id=a.payment_id)
   then raise exception 'advance_allocation_reversal_source_invalid' using errcode='23514';end if;
 end if;
 return new;
end $body$;
revoke all on function private.guard_advance_allocation_source() from public,anon,authenticated,service_role;
create trigger advance_allocation_source before insert on public.advance_allocations for each row execute function private.guard_advance_allocation_source();

-- Repeated partial allocations to the same obligation are distinct valid intentions.
-- The payment lock and command receipt, not a payment/obligation pair, enforce single use.
drop index public.payment_receivable_allocation_unique;
drop index public.payment_payable_allocation_unique;
create index payment_receivable_allocation_lookup on public.payment_allocations(payment_id,receivable_obligation_id) where receivable_obligation_id is not null;
create index payment_payable_allocation_lookup on public.payment_allocations(payment_id,payable_obligation_id) where payable_obligation_id is not null;

create or replace function private.payment_available(target_payment_id uuid) returns bigint
language sql stable security definer set search_path='' as $body$
 select case when p.reversal_of_payment_id is not null or exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id)
 then 0 else (p.amount_vnd-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payment_id=p.id),0))::bigint end
 from public.payments p where p.id=target_payment_id
$body$;
CREATE OR REPLACE FUNCTION private.allocate_payment_lines(target_payment_id uuid, allocation_lines jsonb, actor_auth_user_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payment public.payments%rowtype; item jsonb; obligation_id uuid; allocation_amount bigint; allocated_total bigint:=0; target_branch uuid; target_supplier uuid; target_employee uuid; outstanding bigint; available_before bigint; advance public.advances%rowtype; advance_left bigint:=0; unclassified_before bigint; consumed_part bigint; new_allocation_id uuid;
begin
  select * into payment from public.payments where id=target_payment_id for update;
  if payment.id is null then raise exception 'payment_not_found' using errcode='23503'; end if;
  available_before:=private.payment_available(payment.id);
  select * into advance from public.advances where payment_id=payment.id and reversal_of_advance_id is null for update;
  if advance.id is not null then advance_left:=private.advance_remaining(advance.id);end if;
  unclassified_before:=greatest(0,available_before-advance_left);
  if jsonb_typeof(allocation_lines) is distinct from 'array' or jsonb_array_length(allocation_lines)>50 then raise exception 'invalid_allocations' using errcode='22023'; end if;
  if jsonb_array_length(allocation_lines)<>(select count(distinct value->>'obligation_id') from jsonb_array_elements(allocation_lines)) then raise exception 'duplicate_allocation_target' using errcode='23505'; end if;
  if payment.direction='RECEIPT' then
   perform 1 from public.receivable_obligations where id in(select (value->>'obligation_id')::uuid from jsonb_array_elements(allocation_lines)) order by id for update;
  else
   perform 1 from public.payable_obligations where id in(select (value->>'obligation_id')::uuid from jsonb_array_elements(allocation_lines)) order by id for update;
  end if;
  for item in select value from jsonb_array_elements(allocation_lines) loop
    begin obligation_id:=(item->>'obligation_id')::uuid; allocation_amount:=(item->>'amount_vnd')::bigint; exception when others then raise exception 'invalid_allocation_line' using errcode='22023'; end;
    if allocation_amount<=0 then raise exception 'invalid_allocation_amount' using errcode='22023'; end if;
    if payment.direction='RECEIPT' then
      select branch_id,customer_id into target_branch,target_supplier from public.receivable_obligations where id=obligation_id for update;
      if not found or target_branch<>payment.branch_id or target_supplier<>payment.customer_id then raise exception 'allocation_scope_mismatch' using errcode='42501'; end if;
      outstanding:=private.current_receivable_outstanding(obligation_id);
      if allocation_amount>outstanding then raise exception 'allocation_exceeds_outstanding' using errcode='23514'; end if;
      insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,allocated_by) values(payment.id,obligation_id,allocation_amount,actor_auth_user_id) returning id into new_allocation_id;
    else
      select branch_id,supplier_id,employee_id into target_branch,target_supplier,target_employee from public.payable_obligations where id=obligation_id for update;
      if not found or target_branch<>payment.branch_id or target_supplier is distinct from payment.supplier_id or target_employee is distinct from payment.employee_id then raise exception 'allocation_scope_mismatch' using errcode='42501'; end if;
      outstanding:=private.current_payable_outstanding(obligation_id);
      if allocation_amount>outstanding then raise exception 'allocation_exceeds_outstanding' using errcode='23514'; end if;
      insert into public.payment_allocations(payment_id,payable_obligation_id,amount_delta_vnd,allocated_by) values(payment.id,obligation_id,allocation_amount,actor_auth_user_id) returning id into new_allocation_id;
    end if;
    consumed_part:=greatest(0,allocated_total+allocation_amount-unclassified_before)-greatest(0,allocated_total-unclassified_before);
    if consumed_part>0 then
     if advance.id is null then raise exception 'allocation_exceeds_payment_available' using errcode='23514';end if;
     insert into public.advance_allocations(branch_id,advance_id,payment_allocation_id,amount_delta_vnd,recorded_by)
     values(payment.branch_id,advance.id,new_allocation_id,consumed_part,actor_auth_user_id);
    end if;
    allocated_total:=allocated_total+allocation_amount;
  end loop;
  if allocated_total>available_before then raise exception 'allocation_exceeds_payment_available' using errcode='23514'; end if;
  return allocated_total;
end $function$
;
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
  select * into payment from public.payments where id = target_payment_id for update;
  if payment.id is null or not private.has_permission(payment.branch_id, 'finance.payment.post') then raise exception 'forbidden_or_payment_not_found' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('payment_id', target_payment_id, 'allocations', allocation_lines));
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
  select * into original from public.payments where id=target_payment_id for update;
  if original.reversal_of_payment_id is not null or exists(select 1 from public.payments where reversal_of_payment_id=original.id) then raise exception 'payment_already_reversed_or_is_reversal' using errcode='55000'; end if;
  insert into public.payments(branch_id,payment_number,direction,customer_id,supplier_id,employee_id,account_id,amount_vnd,method,external_reference,effective_at,reversal_of_payment_id,reversal_reason,posted_by) values(original.branch_id,'REV-'||to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.finance_payment_number_seq')::text,6,'0'),case when original.direction='RECEIPT' then 'DISBURSEMENT' else 'RECEIPT' end,original.customer_id,original.supplier_id,original.employee_id,original.account_id,original.amount_vnd,original.method,original.external_reference,now(),original.id,trim(reversal_reason),(select auth.uid())) returning id into reversal_id;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,payable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by) select reversal_id,receivable_obligation_id,payable_obligation_id,-amount_delta_vnd,id,(select auth.uid()) from public.payment_allocations where payment_id=original.id and reversal_of_allocation_id is null;
  insert into public.advance_allocations(branch_id,advance_id,amount_delta_vnd,reversal_of_advance_allocation_id,source_reversal_payment_id,recorded_by)
  select branch_id,advance_id,-amount_delta_vnd,id,reversal_id,(select auth.uid()) from public.advance_allocations
  where advance_id in(select id from public.advances where payment_id=original.id and reversal_of_advance_id is null)
   and amount_delta_vnd>0;
  insert into public.advances(branch_id,payment_id,advance_side,customer_id,supplier_id,amount_delta_vnd,reversal_of_advance_id,recorded_by) select branch_id,reversal_id,advance_side,customer_id,supplier_id,-amount_delta_vnd,id,(select auth.uid()) from public.advances where payment_id=original.id and reversal_of_advance_id is null;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'reverse_payment',payload_hash,'payment',reversal_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values((select auth.uid()),original.branch_id,'payment.reversed','payment',original.id,operation_id,array['reversal'],trim(reversal_reason));
  return reversal_id;
end $function$
;
create view public.payment_allocation_source_read with(security_barrier=true) as
 select p.id,p.branch_id,p.payment_number,p.direction,p.customer_id,p.supplier_id,p.employee_id,p.posted_at,
  p.amount_vnd::text amount_vnd,private.payment_available(p.id)::text available_amount_vnd,
  coalesce((select sum(private.advance_remaining(a.id)) from public.advances a where a.payment_id=p.id and a.reversal_of_advance_id is null),0)::text advance_remaining_vnd
 from public.payments p where p.reversal_of_payment_id is null and not exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id)
 and (private.has_permission(p.branch_id,'finance.payment.post')
  or (p.direction='RECEIPT' and private.has_permission(p.branch_id,'finance.ar.read'))
  or (p.direction='DISBURSEMENT' and private.has_permission(p.branch_id,'finance.ap.read')));
revoke all on public.payment_allocation_source_read from public,anon,authenticated;
grant select on public.payment_allocation_source_read to authenticated;
notify pgrst,'reload schema';
commit;
