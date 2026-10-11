begin;
alter table public.payment_allocations add column source_customer_credit_id uuid references public.customer_credits(id) on delete restrict;
alter table public.payment_allocations add column credit_offset_fund_id uuid references public.customer_credit_funds(id) on delete restrict;
alter table public.payment_allocations add constraint payment_credit_source_shape check(
 (source_customer_credit_id is null or(amount_delta_vnd<0 and reversal_of_allocation_id is not null and receivable_obligation_id is not null))
 and(credit_offset_fund_id is null or(amount_delta_vnd>0 and reversal_of_allocation_id is null and receivable_obligation_id is not null)));
create function private.guard_credit_allocation_provenance() returns trigger language plpgsql security definer set search_path='' as $body$
declare credit_row public.customer_credits%rowtype; fund_row public.customer_credit_funds%rowtype;
 payment_row public.payments%rowtype; obligation_row public.receivable_obligations%rowtype;
begin
 if new.source_customer_credit_id is null and new.credit_offset_fund_id is null then return new;end if;
 select * into payment_row from public.payments where id=new.payment_id;
 if new.source_customer_credit_id is not null then
  select * into credit_row from public.customer_credits where id=new.source_customer_credit_id;
  if credit_row.id is null or credit_row.obligation_id is distinct from new.receivable_obligation_id
   or credit_row.approved_by is distinct from new.allocated_by or credit_row.customer_id is distinct from payment_row.customer_id
   or credit_row.branch_id is distinct from payment_row.branch_id or payment_row.direction<>'RECEIPT'
   or -new.amount_delta_vnd+coalesce((select -sum(a.amount_delta_vnd) from public.payment_allocations a where a.source_customer_credit_id=credit_row.id),0)>credit_row.amount_vnd
  then raise exception 'credit_allocation_source_invalid' using errcode='23514';end if;
 else
  select * into fund_row from public.customer_credit_funds where id=new.credit_offset_fund_id;
  select * into credit_row from public.customer_credits where id=fund_row.credit_id;
  select * into obligation_row from public.receivable_obligations where id=new.receivable_obligation_id;
  if fund_row.id is null or fund_row.source_payment_id is distinct from new.payment_id
   or obligation_row.customer_id is distinct from credit_row.customer_id or obligation_row.branch_id is distinct from credit_row.branch_id
   or new.amount_delta_vnd>private.customer_credit_fund_remaining(fund_row.id)
  then raise exception 'credit_offset_allocation_source_invalid' using errcode='23514';end if;
 end if;
 return new;
end $body$;
revoke all on function private.guard_credit_allocation_provenance() from public,anon,authenticated,service_role;
create trigger credit_allocation_provenance before insert on public.payment_allocations for each row execute function private.guard_credit_allocation_provenance();

alter table public.earning_events drop constraint earning_events_reverses_earning_event_id_key;
create index earning_reversal_source_idx on public.earning_events(reverses_earning_event_id) where reverses_earning_event_id is not null;
create table public.commission_reconciliation_cases(
 id uuid primary key default gen_random_uuid(),branch_id uuid not null references public.branches(id) on delete restrict,
 employee_id uuid not null references public.employees(id) on delete restrict,
 original_earning_event_id uuid not null references public.earning_events(id) on delete restrict,
 source_payment_allocation_id uuid not null unique references public.payment_allocations(id) on delete restrict,
 reduction_amount_vnd bigint not null check(reduction_amount_vnd>0),
 reason text not null,recorded_by uuid not null references auth.users(id) on delete restrict,recorded_at timestamptz not null default now()
);
alter table public.commission_reconciliation_cases enable row level security;
revoke all on public.commission_reconciliation_cases from public,anon,authenticated;
grant select on public.commission_reconciliation_cases to authenticated;
create policy commission_reconciliation_cases_read on public.commission_reconciliation_cases for select to authenticated using(private.has_permission(branch_id,'compensation.read'));
create trigger commission_reconciliation_cases_immutable before update or delete on public.commission_reconciliation_cases
 for each row execute function private.reject_r6_posted_mutation();

create or replace function public.adjust_return_receivable(target_return_case_id uuid,credit_amount_vnd bigint,adjustment_reason text,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $body$
declare case_row public.return_cases%rowtype; vl public.delivery_verification_lines%rowtype; l public.delivery_lines%rowtype;
 obligation public.receivable_obligations%rowtype; receipt public.command_receipts%rowtype; hash text;
 payment_ids uuid[]; credit_id uuid:=gen_random_uuid(); adjustment_id uuid; source record; release_id uuid;
 outstanding bigint; owed bigint; left_to_fund bigint; available bigint; part bigint; source_max bigint; prior_credits bigint; customer_id uuid;
begin
 perform private.lock_saved_command_intent(operation_id,'adjust_return_receivable');
 select * into case_row from public.return_cases where id=target_return_case_id for update;
 select * into vl from public.delivery_verification_lines where id=case_row.delivery_verification_line_id;
 select * into l from public.delivery_lines where id=vl.delivery_line_id;
 select o.customer_id into customer_id from public.sales_orders o join public.deliveries d on d.sales_order_id=o.id where d.id=l.delivery_id;
 select * into obligation from public.receivable_obligations where delivery_verification_id=vl.delivery_verification_id;
 if case_row.id is null or case_row.case_kind<>'CUSTOMER_RETURN' or case_row.state<>'RETURNED'
  or not private.has_permission(case_row.branch_id,'finance.ar.adjust') then raise exception 'return_not_adjustable' using errcode='42501';end if;
 hash:=private.command_payload_hash(jsonb_build_object('return_case_id',target_return_case_id,'amount',credit_amount_vnd,'reason',trim(adjustment_reason)));
 select * into receipt from public.command_receipts where command_receipts.operation_id=adjust_return_receivable.operation_id;
 if found then if receipt.command_name<>'adjust_return_receivable' or receipt.payload_hash<>hash then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;end if;
 if credit_amount_vnd is null or credit_amount_vnd<0 or coalesce(length(trim(adjustment_reason)),0) not between 3 and 500
 then raise exception 'invalid_return_credit' using errcode='22023';end if;
 if exists(select 1 from public.customer_credits c where c.return_case_id=case_row.id)
 then raise exception 'return_credit_already_decided' using errcode='55000';end if;
 if exists(select 1 from public.receivable_adjustments a where a.return_case_id=case_row.id)
 then raise exception 'legacy_return_credit_requires_reconciliation' using errcode='55000';end if;
 -- Lock the receipts first, then the debt. A new payment appearing in that interval requires a clean retry.
 select coalesce(array_agg(distinct a.payment_id),array[]::uuid[]) into payment_ids from public.payment_allocations a
  where a.receivable_obligation_id=obligation.id and a.amount_delta_vnd>0;
 perform 1 from public.payments p where p.id=any(payment_ids) order by p.id for update;
 perform 1 from public.receivable_obligations o where o.id=obligation.id for update;
 if exists(select 1 from public.payment_allocations a where a.receivable_obligation_id=obligation.id
   and a.amount_delta_vnd>0 and not(a.payment_id=any(payment_ids)))
 then raise exception 'return_payment_sources_changed_retry' using errcode='PT409';end if;
 source_max:=least(vl.receivable_amount_vnd,round(case_row.base_quantity*l.unit_price_vnd*l.conversion_denominator/l.conversion_numerator)::bigint);
 select coalesce(sum(c.approved_credit_vnd),0)::bigint into prior_credits from public.customer_credits c
  join public.return_cases r on r.id=c.return_case_id where r.delivery_verification_line_id=vl.id;
 if credit_amount_vnd>source_max or prior_credits+credit_amount_vnd>vl.receivable_amount_vnd
 then raise exception 'return_credit_exceeds_source' using errcode='23514';end if;
 outstanding:=case when obligation.id is null then 0 else private.current_receivable_outstanding(obligation.id) end;
 if outstanding<0 then raise exception 'legacy_negative_receivable_requires_reconciliation' using errcode='55000';end if;
 owed:=greatest(0,credit_amount_vnd-outstanding);left_to_fund:=owed;
 if credit_amount_vnd>0 then
  insert into public.receivable_adjustments(obligation_id,amount_delta_vnd,reason,recorded_by,return_case_id)
   values(obligation.id,-credit_amount_vnd,trim(adjustment_reason),(select auth.uid()),case_row.id) returning id into adjustment_id;
 end if;
 insert into public.customer_credits(id,branch_id,customer_id,return_case_id,obligation_id,receivable_adjustment_id,approved_credit_vnd,amount_vnd,reason,approved_by)
 values(credit_id,case_row.branch_id,customer_id,case_row.id,obligation.id,adjustment_id,credit_amount_vnd,owed,trim(adjustment_reason),(select auth.uid()));
 for source in select a.* from public.payment_allocations a join public.payments p on p.id=a.payment_id
  where a.receivable_obligation_id=obligation.id and a.amount_delta_vnd>0 and p.direction='RECEIPT'
  and p.reversal_of_payment_id is null and not exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id)
  order by a.payment_id,a.id loop
  exit when left_to_fund=0;
  select(source.amount_delta_vnd+coalesce(sum(a.amount_delta_vnd),0))::bigint into available from public.payment_allocations a where a.reversal_of_allocation_id=source.id;
  part:=least(left_to_fund,available);if part<=0 then continue;end if;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by,source_customer_credit_id)
   values(source.payment_id,obligation.id,-part,source.id,(select auth.uid()),credit_id) returning id into release_id;
  insert into public.customer_credit_funds(credit_id,source_payment_id,released_allocation_id,amount_vnd) values(credit_id,source.payment_id,release_id,part);
  left_to_fund:=left_to_fund-part;
 end loop;
 if left_to_fund<>0 then raise exception 'return_credit_payment_source_missing' using errcode='23514';end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),case_row.branch_id,'customer.credit_approved','customer_credit',credit_id,operation_id,
   array['source_return','receivable_adjustment','released_allocations','credit_funds'],trim(adjustment_reason));
 insert into public.command_receipts values(operation_id,(select auth.uid()),'adjust_return_receivable',hash,
  case when adjustment_id is null then 'customer_credit' else 'receivable_adjustment' end,coalesce(adjustment_id,credit_id),now());
 return coalesce(adjustment_id,credit_id);
end $body$;
create or replace function public.offset_customer_credit(target_credit_id uuid,target_obligation_id uuid,offset_amount_vnd bigint,operation_id uuid) returns uuid
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
  insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,allocated_by,credit_offset_fund_id)
   values(f.source_payment_id,o.id,part,(select auth.uid()),f.id) returning id into allocation_id;
  insert into public.customer_credit_settlements(credit_fund_id,settlement_kind,amount_delta_vnd,payment_allocation_id,source_operation_id,recorded_by)
   values(f.id,'OFFSET',part,allocation_id,operation_id,(select auth.uid()));left_to_offset:=left_to_offset-part;
 end loop;
 if left_to_offset<>0 then raise exception 'customer_credit_funding_incomplete' using errcode='23514';end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values((select auth.uid()),c.branch_id,'customer.credit_offset','customer_credit',c.id,operation_id,array['source_credit','settlement','receivable_allocation']);
 insert into public.command_receipts values(operation_id,(select auth.uid()),'offset_customer_credit',hash,'customer_credit',c.id,now());
 return c.id;
end $body$;
create or replace function private.recognize_ar_allocation() returns trigger
language plpgsql security definer set search_path='' as $function$
declare payment public.payments%rowtype; original public.earning_events%rowtype;
  source record; policy record; amount bigint; original_allocation public.payment_allocations%rowtype; released_basis bigint; desired_cumulative bigint; prior_reductions bigint;
begin
  if new.receivable_obligation_id is null then return new; end if;
  select * into payment from public.payments where id=new.payment_id;
  if new.allocated_by<>(select auth.uid()) then raise exception 'invalid_allocation_actor' using errcode='42501'; end if;
  if new.reversal_of_allocation_id is not null then
    select * into original from public.earning_events where payment_allocation_id=new.reversal_of_allocation_id;
    if original.id is null then return new;end if;
    select * into original_allocation from public.payment_allocations where id=new.reversal_of_allocation_id;
    if not exists(select 1 from public.payments p where p.id=original_allocation.payment_id and p.direction='RECEIPT'
      and p.customer_id=payment.customer_id and p.branch_id=payment.branch_id and original.branch_id=p.branch_id
      and original_allocation.receivable_obligation_id=new.receivable_obligation_id)
    then raise exception 'invalid_commission_reversal_source' using errcode='23514';end if;
    if payment.reversal_of_payment_id=original_allocation.payment_id then
      if not private.has_permission(payment.branch_id,'finance.payment.reverse') then raise exception 'forbidden' using errcode='42501';end if;
    elsif payment.id=original_allocation.payment_id and new.source_customer_credit_id is not null then
      if not private.has_permission(payment.branch_id,'finance.ar.adjust') then raise exception 'forbidden' using errcode='42501';end if;
    elsif payment.id=original_allocation.payment_id and original_allocation.credit_offset_fund_id is not null then
      if not private.has_permission(payment.branch_id,'finance.payment.reverse') then raise exception 'forbidden' using errcode='42501';end if;
    else raise exception 'invalid_commission_reversal_source' using errcode='23514';end if;
    select coalesce(-sum(a.amount_delta_vnd),0)::bigint into released_basis from public.payment_allocations a where a.reversal_of_allocation_id=original_allocation.id;
    desired_cumulative:=least(original.approved_amount_vnd,round(released_basis::numeric*original.approved_amount_vnd/original_allocation.amount_delta_vnd)::bigint);
    select(coalesce((select -sum(e.approved_amount_vnd) from public.earning_events e where e.reverses_earning_event_id=original.id),0)
      +coalesce((select sum(c.reduction_amount_vnd) from public.commission_reconciliation_cases c where c.original_earning_event_id=original.id),0))::bigint into prior_reductions;
    amount:=desired_cumulative-prior_reductions;
    if amount<=0 then return new;end if;
    perform 1 from public.payable_obligations where id=original.payable_obligation_id for update;
    if original.payable_obligation_id is not null and private.current_payable_outstanding(original.payable_obligation_id)>=amount then
      perform private.post_recognized_earning(original.rule_id,'AR_PAYMENT_ALLOCATION:'||new.id::text,null,
        original.sales_order_id,new.id,new.amount_delta_vnd,-amount,new.allocated_by,original.id);
    else
      insert into public.commission_reconciliation_cases(branch_id,employee_id,original_earning_event_id,source_payment_allocation_id,
        reduction_amount_vnd,reason,recorded_by) values(original.branch_id,original.employee_id,original.id,new.id,amount,
          'Hoa hồng đã trả hoặc không còn đủ nghĩa vụ chưa thanh toán; cần quyết định đối chiếu nguồn, không đảo toàn thu nhập',new.allocated_by);
      insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
        values(new.allocated_by,original.branch_id,'commission.reconciliation_required','earning_event',original.id,new.id,array['source_allocation','derived_reduction']);
    end if;
    return new;
  end if;
  if payment.direction<>'RECEIPT' or payment.reversal_of_payment_id is not null or new.amount_delta_vnd<=0 then return new; end if;
  select o.id sales_order_id,o.sales_owner_employee_id employee_id,o.branch_id,ro.customer_id into source
    from public.receivable_obligations ro join public.delivery_verifications v on v.id=ro.delivery_verification_id
    join public.deliveries d on d.id=v.delivery_id join public.sales_orders o on o.id=d.sales_order_id
    where ro.id=new.receivable_obligation_id and ro.branch_id=payment.branch_id and d.branch_id=ro.branch_id
      and o.branch_id=ro.branch_id and ro.customer_id=payment.customer_id and o.customer_id=ro.customer_id;
  if source.employee_id is null then return new; end if;
  select p.*,r.rate_bps into policy from public.compensation_recognition_policies p
    join public.compensation_rules r on r.id=p.rule_id
    where p.branch_id=source.branch_id and p.employee_id=source.employee_id and p.recognition_kind='AR_PAYMENT_ALLOCATION'
      and new.allocated_at>=p.effective_at and payment.effective_at>=p.effective_at
      and (new.allocated_at at time zone 'Asia/Ho_Chi_Minh')::date>=r.effective_from
      and (r.effective_to is null or (new.allocated_at at time zone 'Asia/Ho_Chi_Minh')::date<=r.effective_to);
  if policy.rule_id is null then return new; end if;
  if not private.has_permission(payment.branch_id,'finance.payment.post') then raise exception 'forbidden' using errcode='42501'; end if;
  amount:=round(new.amount_delta_vnd::numeric*policy.rate_bps/10000)::bigint;
  if amount<>0 then
    perform private.post_recognized_earning(policy.rule_id,'AR_PAYMENT_ALLOCATION:'||new.id::text,null,
      source.sales_order_id,new.id,new.amount_delta_vnd,amount,new.allocated_by);
  end if;
  return new;
end $function$;
notify pgrst,'reload schema';
commit;
