begin;
create table public.customer_credits(
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id) on delete restrict,
 customer_id uuid not null references public.customers(id) on delete restrict,
 return_case_id uuid not null unique references public.return_cases(id) on delete restrict,
 obligation_id uuid references public.receivable_obligations(id) on delete restrict,
 receivable_adjustment_id uuid unique references public.receivable_adjustments(id) on delete restrict,
 approved_credit_vnd bigint not null check(approved_credit_vnd>=0),
 amount_vnd bigint not null check(amount_vnd>=0 and amount_vnd<=approved_credit_vnd),
 reason text not null check(length(trim(reason)) between 3 and 500),
 approved_by uuid not null references auth.users(id) on delete restrict,
 approved_at timestamptz not null default now(),
 check((approved_credit_vnd=0 and receivable_adjustment_id is null) or(approved_credit_vnd>0 and receivable_adjustment_id is not null and obligation_id is not null))
);
create table public.customer_credit_funds(
 id uuid primary key default gen_random_uuid(),
 credit_id uuid not null references public.customer_credits(id) on delete restrict,
 source_payment_id uuid not null references public.payments(id) on delete restrict,
 released_allocation_id uuid not null unique references public.payment_allocations(id) on delete restrict,
 amount_vnd bigint not null check(amount_vnd>0),
 recorded_at timestamptz not null default now()
);
alter table public.payments add column customer_credit_refund_id uuid references public.customer_credits(id) on delete restrict;
create table public.customer_credit_settlements(
 id uuid primary key default gen_random_uuid(),
 credit_fund_id uuid not null references public.customer_credit_funds(id) on delete restrict,
 settlement_kind text not null check(settlement_kind in('REFUND','OFFSET')),
 amount_delta_vnd bigint not null check(amount_delta_vnd<>0),
 payment_id uuid references public.payments(id) on delete restrict,
 payment_allocation_id uuid unique references public.payment_allocations(id) on delete restrict,
 reversal_of_settlement_id uuid unique references public.customer_credit_settlements(id) on delete restrict,
 source_reversal_payment_id uuid references public.payments(id) on delete restrict,
 source_operation_id uuid not null,
 recorded_by uuid not null references auth.users(id) on delete restrict,
 recorded_at timestamptz not null default now(),
 check((amount_delta_vnd>0 and reversal_of_settlement_id is null and source_reversal_payment_id is null)
   or(amount_delta_vnd<0 and reversal_of_settlement_id is not null)),
 check((settlement_kind='REFUND' and payment_id is not null and payment_allocation_id is null)
   or(settlement_kind='OFFSET' and payment_id is null and payment_allocation_id is not null))
);
create index customer_credits_party_idx on public.customer_credits(branch_id,customer_id,approved_at);
create index customer_credit_funds_payment_idx on public.customer_credit_funds(source_payment_id);
create index customer_credit_settlements_fund_idx on public.customer_credit_settlements(credit_fund_id);
create index customer_credit_settlements_operation_idx on public.customer_credit_settlements(source_operation_id);
alter table public.customer_credits enable row level security;
alter table public.customer_credit_funds enable row level security;
alter table public.customer_credit_settlements enable row level security;
revoke all on public.customer_credits,public.customer_credit_funds,public.customer_credit_settlements from public,anon,authenticated;
grant select on public.customer_credits,public.customer_credit_funds,public.customer_credit_settlements to authenticated;
create policy customer_credits_read on public.customer_credits for select to authenticated using(private.has_permission(branch_id,'finance.ar.read'));
create policy customer_credit_funds_read on public.customer_credit_funds for select to authenticated using(exists(
 select 1 from public.customer_credits c where c.id=credit_id and private.has_permission(c.branch_id,'finance.ar.read')));
create policy customer_credit_settlements_read on public.customer_credit_settlements for select to authenticated using(exists(
 select 1 from public.customer_credit_funds f join public.customer_credits c on c.id=f.credit_id
 where f.id=credit_fund_id and private.has_permission(c.branch_id,'finance.ar.read')));
create trigger customer_credits_immutable before update or delete on public.customer_credits for each row execute function private.reject_r6_posted_mutation();
create trigger customer_credit_funds_immutable before update or delete on public.customer_credit_funds for each row execute function private.reject_r6_posted_mutation();
create trigger customer_credit_settlements_immutable before update or delete on public.customer_credit_settlements for each row execute function private.reject_r6_posted_mutation();

alter table public.payment_allocations drop constraint payment_allocations_reversal_of_allocation_id_key;
create index payment_allocation_reversal_source_idx on public.payment_allocations(reversal_of_allocation_id) where reversal_of_allocation_id is not null;
create function private.guard_partial_allocation_reversal() returns trigger language plpgsql security definer set search_path='' as $body$
declare original public.payment_allocations%rowtype; p public.payments%rowtype;
begin
 if new.reversal_of_allocation_id is null then return new;end if;
 select * into original from public.payment_allocations where id=new.reversal_of_allocation_id for update;
 select * into p from public.payments where id=new.payment_id;
 if original.id is null or original.amount_delta_vnd<=0 or new.amount_delta_vnd>=0
  or new.receivable_obligation_id is distinct from original.receivable_obligation_id
  or new.payable_obligation_id is distinct from original.payable_obligation_id
  or p.id is null or(new.payment_id<>original.payment_id and p.reversal_of_payment_id is distinct from original.payment_id)
  or -new.amount_delta_vnd>original.amount_delta_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.reversal_of_allocation_id=original.id),0)
 then raise exception 'allocation_reversal_exceeds_source' using errcode='23514';end if;
 return new;
end $body$;
revoke all on function private.guard_partial_allocation_reversal() from public,anon,authenticated,service_role;
create trigger partial_allocation_reversal_source before insert on public.payment_allocations for each row execute function private.guard_partial_allocation_reversal();

create function private.customer_credit_remaining(target_credit_id uuid) returns bigint language sql stable security definer set search_path='' as $body$
 select(c.amount_vnd-coalesce((select sum(s.amount_delta_vnd) from public.customer_credit_settlements s
  join public.customer_credit_funds f on f.id=s.credit_fund_id where f.credit_id=c.id),0))::bigint from public.customer_credits c where c.id=target_credit_id
$body$;
create function private.customer_credit_fund_remaining(target_fund_id uuid) returns bigint language sql stable security definer set search_path='' as $body$
 select(f.amount_vnd-coalesce((select sum(s.amount_delta_vnd) from public.customer_credit_settlements s where s.credit_fund_id=f.id),0))::bigint
 from public.customer_credit_funds f where f.id=target_fund_id
$body$;
revoke all on function private.customer_credit_remaining(uuid),private.customer_credit_fund_remaining(uuid) from public,anon,authenticated,service_role;
create or replace function private.payment_available(target_payment_id uuid) returns bigint
language sql stable security definer set search_path='' as $body$
 select case when p.customer_credit_refund_id is not null or p.reversal_of_payment_id is not null
  or exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id) then 0 else
  (p.amount_vnd-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payment_id=p.id),0)
   -coalesce((select sum(f.amount_vnd-coalesce((select sum(s.amount_delta_vnd) from public.customer_credit_settlements s
     where s.credit_fund_id=f.id and s.settlement_kind='OFFSET'),0)) from public.customer_credit_funds f where f.source_payment_id=p.id),0))::bigint end
 from public.payments p where p.id=target_payment_id
$body$;

create function private.guard_customer_credit_funding() returns trigger language plpgsql security definer set search_path='' as $body$
declare c public.customer_credits%rowtype; a public.payment_allocations%rowtype; p public.payments%rowtype;
begin
 select * into c from public.customer_credits where id=new.credit_id for update;
 select * into a from public.payment_allocations where id=new.released_allocation_id;
 select * into p from public.payments where id=new.source_payment_id;
 if c.id is null or a.id is null or a.amount_delta_vnd<>-new.amount_vnd or a.reversal_of_allocation_id is null
  or a.payment_id<>p.id or a.receivable_obligation_id is distinct from c.obligation_id
  or p.direction<>'RECEIPT' or p.reversal_of_payment_id is not null or p.customer_id is distinct from c.customer_id or p.branch_id<>c.branch_id
  or exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id)
  or new.amount_vnd+coalesce((select sum(f.amount_vnd) from public.customer_credit_funds f where f.credit_id=c.id),0)>c.amount_vnd
 then raise exception 'customer_credit_funding_source_invalid' using errcode='23514';end if;
 return new;
end $body$;
create function private.check_customer_credit_funded() returns trigger language plpgsql security definer set search_path='' as $body$
begin
 if new.amount_vnd<>coalesce((select sum(f.amount_vnd) from public.customer_credit_funds f where f.credit_id=new.id),0)
 then raise exception 'customer_credit_funding_incomplete' using errcode='23514';end if;
 return new;
end $body$;
revoke all on function private.guard_customer_credit_funding(),private.check_customer_credit_funded() from public,anon,authenticated,service_role;
create trigger customer_credit_funding_source before insert on public.customer_credit_funds for each row execute function private.guard_customer_credit_funding();
create constraint trigger customer_credit_funding_complete after insert on public.customer_credits
 deferrable initially deferred for each row execute function private.check_customer_credit_funded();

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
  insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by)
   values(source.payment_id,obligation.id,-part,source.id,(select auth.uid())) returning id into release_id;
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
notify pgrst,'reload schema';
commit;
