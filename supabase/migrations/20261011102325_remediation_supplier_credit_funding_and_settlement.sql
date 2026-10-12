-- Paid supplier returns create a funded claim, not a second payable or a full payout reversal.
begin;
create table public.supplier_return_credits(
 id uuid primary key default gen_random_uuid(),branch_id uuid not null references public.branches(id),supplier_id uuid not null references public.suppliers(id),
 acceptance_event_id uuid not null unique references public.supplier_return_events(id),case_id uuid not null references public.supplier_return_cases(id),
 obligation_id uuid not null references public.payable_obligations(id),payable_adjustment_id uuid unique references public.payable_adjustments(id),
 approved_credit_vnd bigint not null check(approved_credit_vnd>=0),amount_vnd bigint not null check(amount_vnd>=0 and amount_vnd<=approved_credit_vnd),
 reason text not null check(char_length(trim(reason)) between 3 and 500),approved_by uuid not null references auth.users(id),approved_at timestamptz not null default now(),
 check((approved_credit_vnd=0 and payable_adjustment_id is null) or(approved_credit_vnd>0 and payable_adjustment_id is not null))
);
alter table public.payment_allocations add column source_supplier_credit_id uuid references public.supplier_return_credits(id);
create table public.supplier_credit_funds(
 id uuid primary key default gen_random_uuid(),credit_id uuid not null references public.supplier_return_credits(id),
 source_payment_id uuid not null references public.payments(id),released_allocation_id uuid not null unique references public.payment_allocations(id),amount_vnd bigint not null check(amount_vnd>0),recorded_at timestamptz not null default now()
);
alter table public.payment_allocations add column supplier_offset_fund_id uuid references public.supplier_credit_funds(id);
alter table public.payment_allocations add constraint supplier_credit_allocation_shape check(
 (source_supplier_credit_id is null or(amount_delta_vnd<0 and reversal_of_allocation_id is not null and payable_obligation_id is not null))
 and(supplier_offset_fund_id is null or(amount_delta_vnd>0 and reversal_of_allocation_id is null and payable_obligation_id is not null))
 and(num_nonnulls(source_supplier_credit_id,supplier_offset_fund_id,source_customer_credit_id,credit_offset_fund_id)<=1));
alter table public.payments add column supplier_credit_refund_id uuid references public.supplier_return_credits(id);
create table public.supplier_credit_settlements(
 id uuid primary key default gen_random_uuid(),credit_fund_id uuid not null references public.supplier_credit_funds(id),
 settlement_kind text not null check(settlement_kind in('REFUND','OFFSET')),amount_vnd bigint not null check(amount_vnd>0),
 payment_id uuid references public.payments(id),payment_allocation_id uuid unique references public.payment_allocations(id),
 source_operation_id uuid not null,recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 check((settlement_kind='REFUND' and payment_id is not null and payment_allocation_id is null) or(settlement_kind='OFFSET' and payment_id is null and payment_allocation_id is not null))
);
create index supplier_credit_fund_payment_idx on public.supplier_credit_funds(source_payment_id);
create index supplier_credit_settlement_fund_idx on public.supplier_credit_settlements(credit_fund_id);
create index supplier_credit_settlement_operation_idx on public.supplier_credit_settlements(source_operation_id);
alter table public.supplier_return_credits enable row level security;alter table public.supplier_credit_funds enable row level security;alter table public.supplier_credit_settlements enable row level security;
revoke all on public.supplier_return_credits,public.supplier_credit_funds,public.supplier_credit_settlements from public,anon,authenticated;
grant select on public.supplier_return_credits,public.supplier_credit_funds,public.supplier_credit_settlements to authenticated;
create policy supplier_credit_read on public.supplier_return_credits for select to authenticated using(private.has_permission(branch_id,'finance.ap.read'));
create policy supplier_credit_fund_read on public.supplier_credit_funds for select to authenticated using(exists(select 1 from public.supplier_return_credits c where c.id=credit_id and private.has_permission(c.branch_id,'finance.ap.read')));
create policy supplier_credit_settlement_read on public.supplier_credit_settlements for select to authenticated using(exists(select 1 from public.supplier_credit_funds f join public.supplier_return_credits c on c.id=f.credit_id where f.id=credit_fund_id and private.has_permission(c.branch_id,'finance.ap.read')));
create trigger supplier_credit_immutable before update or delete on public.supplier_return_credits for each row execute function private.reject_r7_posted_mutation();
create trigger supplier_credit_fund_immutable before update or delete on public.supplier_credit_funds for each row execute function private.reject_r7_posted_mutation();
create trigger supplier_credit_settlement_immutable before update or delete on public.supplier_credit_settlements for each row execute function private.reject_r7_posted_mutation();

create function private.supplier_credit_remaining(target_credit_id uuid) returns bigint language sql stable security definer set search_path='' as $fn$
 select(c.amount_vnd-coalesce((select sum(s.amount_vnd) from public.supplier_credit_settlements s join public.supplier_credit_funds f on f.id=s.credit_fund_id where f.credit_id=c.id),0))::bigint from public.supplier_return_credits c where c.id=target_credit_id
$fn$;
create function private.supplier_credit_fund_remaining(target_fund_id uuid) returns bigint language sql stable security definer set search_path='' as $fn$
 select(f.amount_vnd-coalesce((select sum(s.amount_vnd) from public.supplier_credit_settlements s where s.credit_fund_id=f.id),0))::bigint from public.supplier_credit_funds f where f.id=target_fund_id
$fn$;
revoke all on function private.supplier_credit_remaining(uuid),private.supplier_credit_fund_remaining(uuid) from public,anon,authenticated,service_role;
create or replace function private.payment_available(target_payment_id uuid) returns bigint language sql stable security definer set search_path='' as $fn$
 select case when p.customer_credit_refund_id is not null or p.supplier_credit_refund_id is not null or p.reversal_of_payment_id is not null or exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id) then 0 else
 (p.amount_vnd-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payment_id=p.id),0)
 -coalesce((select sum(f.amount_vnd-coalesce((select sum(s.amount_delta_vnd) from public.customer_credit_settlements s where s.credit_fund_id=f.id and s.settlement_kind='OFFSET'),0)) from public.customer_credit_funds f where f.source_payment_id=p.id),0)
 -coalesce((select sum(f.amount_vnd-coalesce((select sum(s.amount_vnd) from public.supplier_credit_settlements s where s.credit_fund_id=f.id and s.settlement_kind='OFFSET'),0)) from public.supplier_credit_funds f where f.source_payment_id=p.id),0))::bigint end from public.payments p where p.id=target_payment_id
$fn$;

create function private.guard_supplier_credit_allocation() returns trigger language plpgsql security definer set search_path='' as $fn$
declare c public.supplier_return_credits%rowtype;f public.supplier_credit_funds%rowtype;p public.payments%rowtype;o public.payable_obligations%rowtype;
begin
 if new.source_supplier_credit_id is null and new.supplier_offset_fund_id is null then return new;end if;
 select * into p from public.payments where id=new.payment_id;
 if new.source_supplier_credit_id is not null then
  select * into c from public.supplier_return_credits where id=new.source_supplier_credit_id;
  if c.id is null or c.obligation_id is distinct from new.payable_obligation_id or c.supplier_id is distinct from p.supplier_id or c.branch_id is distinct from p.branch_id
   or c.approved_by is distinct from new.allocated_by or p.direction<>'DISBURSEMENT' or p.reversal_of_payment_id is not null
   or -new.amount_delta_vnd+coalesce((select -sum(a.amount_delta_vnd) from public.payment_allocations a where a.source_supplier_credit_id=c.id),0)>c.amount_vnd
  then raise exception 'supplier_credit_allocation_source_invalid' using errcode='23514';end if;
 else
  select * into f from public.supplier_credit_funds where id=new.supplier_offset_fund_id;select * into c from public.supplier_return_credits where id=f.credit_id;
  select * into o from public.payable_obligations where id=new.payable_obligation_id;
  if f.id is null or f.source_payment_id is distinct from new.payment_id or o.id is null or o.supplier_id is distinct from c.supplier_id or o.branch_id is distinct from c.branch_id
   or new.amount_delta_vnd>private.supplier_credit_fund_remaining(f.id) then raise exception 'supplier_credit_offset_source_invalid' using errcode='23514';end if;
 end if;return new;
end $fn$;
create trigger supplier_credit_allocation_source before insert on public.payment_allocations for each row execute function private.guard_supplier_credit_allocation();
create function private.guard_supplier_credit_fund() returns trigger language plpgsql security definer set search_path='' as $fn$
declare c public.supplier_return_credits%rowtype;a public.payment_allocations%rowtype;p public.payments%rowtype;
begin
 select * into c from public.supplier_return_credits where id=new.credit_id;select * into a from public.payment_allocations where id=new.released_allocation_id;select * into p from public.payments where id=new.source_payment_id;
 if c.id is null or a.id is null or a.source_supplier_credit_id is distinct from c.id or a.payment_id is distinct from p.id or a.amount_delta_vnd<>-new.amount_vnd
  or a.payable_obligation_id is distinct from c.obligation_id or p.direction<>'DISBURSEMENT' or p.supplier_id is distinct from c.supplier_id or p.branch_id is distinct from c.branch_id
  or new.amount_vnd+coalesce((select sum(f.amount_vnd) from public.supplier_credit_funds f where f.credit_id=c.id),0)>c.amount_vnd
 then raise exception 'supplier_credit_funding_source_invalid' using errcode='23514';end if;return new;
end $fn$;
create trigger supplier_credit_funding_source before insert on public.supplier_credit_funds for each row execute function private.guard_supplier_credit_fund();
create function private.guard_supplier_credit_settlement() returns trigger language plpgsql security definer set search_path='' as $fn$
declare f public.supplier_credit_funds%rowtype;c public.supplier_return_credits%rowtype;p public.payments%rowtype;a public.payment_allocations%rowtype;o public.payable_obligations%rowtype;
begin
 select * into f from public.supplier_credit_funds where id=new.credit_fund_id;select * into c from public.supplier_return_credits where id=f.credit_id;
 if f.id is null or c.id is null or new.amount_vnd>private.supplier_credit_fund_remaining(f.id) or new.amount_vnd>private.supplier_credit_remaining(c.id) then raise exception 'supplier_credit_settlement_exceeds_remaining' using errcode='23514';end if;
 if new.settlement_kind='REFUND' then
  select * into p from public.payments where id=new.payment_id;
  if p.id is null or p.supplier_credit_refund_id is distinct from c.id or p.supplier_id is distinct from c.supplier_id or p.branch_id is distinct from c.branch_id or p.direction<>'RECEIPT'
   or new.amount_vnd+coalesce((select sum(s.amount_vnd) from public.supplier_credit_settlements s where s.payment_id=p.id),0)>p.amount_vnd
  then raise exception 'supplier_credit_refund_source_invalid' using errcode='23514';end if;
 else
  select * into a from public.payment_allocations where id=new.payment_allocation_id;select * into o from public.payable_obligations where id=a.payable_obligation_id;
  if a.id is null or a.supplier_offset_fund_id is distinct from f.id or a.payment_id is distinct from f.source_payment_id or a.amount_delta_vnd<>new.amount_vnd
   or o.supplier_id is distinct from c.supplier_id or o.branch_id is distinct from c.branch_id then raise exception 'supplier_credit_offset_source_invalid' using errcode='23514';end if;
 end if;return new;
end $fn$;
create trigger supplier_credit_settlement_source before insert on public.supplier_credit_settlements for each row execute function private.guard_supplier_credit_settlement();
revoke all on function private.guard_supplier_credit_allocation(),private.guard_supplier_credit_fund(),private.guard_supplier_credit_settlement() from public,anon,authenticated,service_role;

create function public.approve_supplier_return_credit(target_acceptance_event_id uuid,credit_amount_vnd bigint,approval_reason text,expected_case_version integer,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
declare e public.supplier_return_events%rowtype;c public.supplier_return_cases%rowtype;o public.payable_obligations%rowtype;r public.command_receipts%rowtype;h text;credit_id uuid:=gen_random_uuid();adj_id uuid;release_id uuid;payment_ids uuid[];outstanding bigint;owed bigint;remaining bigint;available bigint;part bigint;source record;
begin
 select * into e from public.supplier_return_events where id=target_acceptance_event_id;select * into c from public.supplier_return_cases where id=e.case_id;
 if e.id is null or e.event_kind<>'SUPPLIER_ACCEPTANCE' or not private.has_permission(c.branch_id,'finance.ap.adjust') then raise exception 'forbidden_or_supplier_acceptance_not_found' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'approve_supplier_return_credit');perform pg_advisory_xact_lock(hashtextextended('supplier_credit:'||operation_id::text,0));
 h:=private.command_payload_hash(jsonb_build_array(target_acceptance_event_id,credit_amount_vnd,trim(approval_reason),expected_case_version));
 select * into r from public.command_receipts where command_receipts.operation_id=approve_supplier_return_credit.operation_id;
 if found then if r.command_name<>'approve_supplier_return_credit' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 select * into c from public.supplier_return_cases where id=e.case_id for update;
 if c.version is distinct from expected_case_version then raise exception 'supplier_return_version_conflict' using errcode='PT409';end if;
 if operation_id is null or credit_amount_vnd is null or credit_amount_vnd<0 or credit_amount_vnd>e.source_value_vnd or approval_reason is null or char_length(trim(approval_reason)) not between 3 and 500 then raise exception 'supplier_credit_exceeds_acceptance_or_invalid' using errcode='23514';end if;
 if exists(select 1 from public.supplier_return_credits x where x.acceptance_event_id=e.id) then raise exception 'supplier_acceptance_credit_already_decided' using errcode='55000';end if;
 select coalesce(array_agg(distinct a.payment_id),array[]::uuid[]) into payment_ids from public.payment_allocations a where a.payable_obligation_id=c.source_payable_id and a.amount_delta_vnd>0;
 perform 1 from public.payments p where p.id=any(payment_ids) order by p.id for update;
 select * into o from public.payable_obligations where id=c.source_payable_id for update;
 if o.supplier_id is distinct from c.supplier_id or o.branch_id is distinct from c.branch_id then raise exception 'supplier_return_payable_scope_mismatch' using errcode='23514';end if;
 if exists(select 1 from public.payment_allocations a where a.payable_obligation_id=o.id and a.amount_delta_vnd>0 and not(a.payment_id=any(payment_ids))) then raise exception 'supplier_return_payment_sources_changed_retry' using errcode='PT409';end if;
 outstanding:=private.current_payable_outstanding(o.id);if outstanding<0 then raise exception 'legacy_negative_payable_requires_reconciliation' using errcode='55000';end if;
 owed:=greatest(0,credit_amount_vnd-outstanding);remaining:=owed;
 if credit_amount_vnd>0 then insert into public.payable_adjustments(obligation_id,amount_delta_vnd,reason,recorded_by) values(o.id,-credit_amount_vnd,trim(approval_reason),auth.uid()) returning id into adj_id;end if;
 insert into public.supplier_return_credits(id,branch_id,supplier_id,acceptance_event_id,case_id,obligation_id,payable_adjustment_id,approved_credit_vnd,amount_vnd,reason,approved_by)
 values(credit_id,c.branch_id,c.supplier_id,e.id,c.id,o.id,adj_id,credit_amount_vnd,owed,trim(approval_reason),auth.uid());
 for source in select a.* from public.payment_allocations a join public.payments p on p.id=a.payment_id where a.payable_obligation_id=o.id and a.amount_delta_vnd>0 and p.direction='DISBURSEMENT'
  and p.reversal_of_payment_id is null and not exists(select 1 from public.payments rev where rev.reversal_of_payment_id=p.id) order by a.payment_id,a.id loop
  exit when remaining=0;
  select(source.amount_delta_vnd+coalesce(sum(a.amount_delta_vnd),0))::bigint into available from public.payment_allocations a where a.reversal_of_allocation_id=source.id;
  part:=least(remaining,available);if part<=0 then continue;end if;
  insert into public.payment_allocations(payment_id,payable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by,source_supplier_credit_id)
   values(source.payment_id,o.id,-part,source.id,auth.uid(),credit_id) returning id into release_id;
  insert into public.supplier_credit_funds(credit_id,source_payment_id,released_allocation_id,amount_vnd) values(credit_id,source.payment_id,release_id,part);remaining:=remaining-part;
 end loop;
 if remaining<>0 then raise exception 'supplier_credit_requires_recorded_payment_sources' using errcode='23514';end if;
 update public.supplier_return_cases set version=version+1 where id=c.id;
 insert into public.command_receipts values(operation_id,auth.uid(),'approve_supplier_return_credit',h,'supplier_return_credit',credit_id,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),c.branch_id,'supplier_return.credit_approved','supplier_return_credit',credit_id,operation_id,array['acceptance_event','payable_adjustment','payment_funding'],trim(approval_reason));
 return credit_id;
end $fn$;

create function public.refund_supplier_credit(target_credit_id uuid,target_account_id uuid,refund_amount_vnd bigint,refunded_at timestamptz,refund_method text,refund_reference text,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
declare c public.supplier_return_credits%rowtype;f public.supplier_credit_funds%rowtype;r public.command_receipts%rowtype;h text;pid uuid;remaining bigint;part bigint;
begin
 select * into c from public.supplier_return_credits where id=target_credit_id;
 if c.id is null or not private.has_permission(c.branch_id,'finance.payment.post') then raise exception 'forbidden_or_supplier_credit_not_found' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'refund_supplier_credit');perform pg_advisory_xact_lock(hashtextextended('supplier_credit:'||operation_id::text,0));
 h:=private.command_payload_hash(jsonb_build_array(target_credit_id,target_account_id,refund_amount_vnd,refunded_at,refund_method,nullif(trim(refund_reference),'')));
 select * into c from public.supplier_return_credits where id=target_credit_id for update;
 select * into r from public.command_receipts where command_receipts.operation_id=refund_supplier_credit.operation_id;
 if found then if r.command_name<>'refund_supplier_credit' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 if operation_id is null or refund_amount_vnd is null or refund_amount_vnd<=0 or refunded_at is null or not isfinite(refunded_at) or refund_method is null or refund_method not in('CASH','BANK_TRANSFER','CARD','OTHER') or length(coalesce(refund_reference,''))>160 then raise exception 'invalid_supplier_credit_refund' using errcode='22023';end if;
 if refund_amount_vnd>private.supplier_credit_remaining(c.id) then raise exception 'supplier_credit_settlement_exceeds_remaining' using errcode='23514';end if;
 perform 1 from public.payments p where p.id in(select source_payment_id from public.supplier_credit_funds where credit_id=c.id) order by p.id for update;
 perform 1 from public.finance_accounts a where a.id=target_account_id and a.branch_id=c.branch_id and a.active for update;if not found then raise exception 'invalid_finance_account' using errcode='23503';end if;
 insert into public.payments(branch_id,payment_number,direction,supplier_id,account_id,amount_vnd,method,external_reference,effective_at,posted_by,supplier_credit_refund_id)
 values(c.branch_id,'VREF-'||lpad(nextval('public.finance_payment_number_seq')::text,8,'0'),'RECEIPT',c.supplier_id,target_account_id,refund_amount_vnd,refund_method,nullif(trim(refund_reference),''),refunded_at,auth.uid(),c.id) returning id into pid;
 remaining:=refund_amount_vnd;
 for f in select * from public.supplier_credit_funds where credit_id=c.id order by source_payment_id,id loop
  exit when remaining=0;part:=least(remaining,private.supplier_credit_fund_remaining(f.id));if part<=0 then continue;end if;
  insert into public.supplier_credit_settlements(credit_fund_id,settlement_kind,amount_vnd,payment_id,source_operation_id,recorded_by) values(f.id,'REFUND',part,pid,operation_id,auth.uid());remaining:=remaining-part;
 end loop;
 if remaining<>0 then raise exception 'supplier_credit_funding_incomplete' using errcode='23514';end if;
 insert into public.command_receipts values(operation_id,auth.uid(),'refund_supplier_credit',h,'payment',pid,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values(auth.uid(),c.branch_id,'supplier_return.refund_received','payment',pid,operation_id,array['source_credit','settlement','cash_receipt']);return pid;
end $fn$;

create function public.offset_supplier_credit(target_credit_id uuid,target_obligation_id uuid,offset_amount_vnd bigint,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
declare c public.supplier_return_credits%rowtype;f public.supplier_credit_funds%rowtype;o public.payable_obligations%rowtype;r public.command_receipts%rowtype;h text;remaining bigint;part bigint;aid uuid;
begin
 select * into c from public.supplier_return_credits where id=target_credit_id;
 if c.id is null or not private.has_permission(c.branch_id,'finance.payment.post') then raise exception 'forbidden_or_supplier_credit_not_found' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'offset_supplier_credit');perform pg_advisory_xact_lock(hashtextextended('supplier_credit:'||operation_id::text,0));
 h:=private.command_payload_hash(jsonb_build_array(target_credit_id,target_obligation_id,offset_amount_vnd));select * into c from public.supplier_return_credits where id=target_credit_id for update;
 select * into r from public.command_receipts where command_receipts.operation_id=offset_supplier_credit.operation_id;
 if found then if r.command_name<>'offset_supplier_credit' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 if operation_id is null or offset_amount_vnd is null or offset_amount_vnd<=0 then raise exception 'invalid_supplier_credit_offset' using errcode='22023';end if;
 if offset_amount_vnd>private.supplier_credit_remaining(c.id) then raise exception 'supplier_credit_settlement_exceeds_remaining' using errcode='23514';end if;
 perform 1 from public.payments p where p.id in(select source_payment_id from public.supplier_credit_funds where credit_id=c.id) order by p.id for update;
 select * into o from public.payable_obligations where id=target_obligation_id for update;
 if o.id is null or o.branch_id is distinct from c.branch_id or o.supplier_id is distinct from c.supplier_id then raise exception 'supplier_credit_offset_scope_mismatch' using errcode='42501';end if;
 if offset_amount_vnd>private.current_payable_outstanding(o.id) then raise exception 'allocation_exceeds_outstanding' using errcode='23514';end if;
 remaining:=offset_amount_vnd;
 for f in select * from public.supplier_credit_funds where credit_id=c.id order by source_payment_id,id loop
  exit when remaining=0;part:=least(remaining,private.supplier_credit_fund_remaining(f.id));if part<=0 then continue;end if;
  insert into public.payment_allocations(payment_id,payable_obligation_id,amount_delta_vnd,allocated_by,supplier_offset_fund_id) values(f.source_payment_id,o.id,part,auth.uid(),f.id) returning id into aid;
  insert into public.supplier_credit_settlements(credit_fund_id,settlement_kind,amount_vnd,payment_allocation_id,source_operation_id,recorded_by) values(f.id,'OFFSET',part,aid,operation_id,auth.uid());remaining:=remaining-part;
 end loop;
 if remaining<>0 then raise exception 'supplier_credit_funding_incomplete' using errcode='23514';end if;
 insert into public.command_receipts values(operation_id,auth.uid(),'offset_supplier_credit',h,'supplier_return_credit',c.id,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values(auth.uid(),c.branch_id,'supplier_return.credit_offset','supplier_return_credit',c.id,operation_id,array['source_credit','settlement','payable_allocation']);return c.id;
end $fn$;
revoke all on function public.approve_supplier_return_credit(uuid,bigint,text,integer,uuid),public.refund_supplier_credit(uuid,uuid,bigint,timestamptz,text,text,uuid),public.offset_supplier_credit(uuid,uuid,bigint,uuid) from public,anon;
grant execute on function public.approve_supplier_return_credit(uuid,bigint,text,integer,uuid),public.refund_supplier_credit(uuid,uuid,bigint,timestamptz,text,text,uuid),public.offset_supplier_credit(uuid,uuid,bigint,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
