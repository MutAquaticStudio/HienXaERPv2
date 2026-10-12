-- G03/G08: a partial prior approval does not increase the source value of a later return case.
begin;
create function private.return_credit_source_limit(target_case uuid) returns bigint
 language sql stable security definer set search_path='' as $limit$
 select greatest(0,least(v.receivable_amount_vnd-coalesce(prior.amount,0),
  round((coalesce(prior.quantity,0)+r.base_quantity)*l.unit_price_vnd*l.conversion_denominator/l.conversion_numerator)::bigint
   -round(coalesce(prior.quantity,0)*l.unit_price_vnd*l.conversion_denominator/l.conversion_numerator)::bigint))::bigint
 from public.return_cases r join public.delivery_verification_lines v on v.id=r.delivery_verification_line_id
  join public.delivery_lines l on l.id=v.delivery_line_id
  left join lateral(select sum(c.approved_credit_vnd)::bigint amount,sum(rc.base_quantity) quantity
   from public.customer_credits c join public.return_cases rc on rc.id=c.return_case_id
   where rc.delivery_verification_line_id=v.id and rc.id<>r.id) prior on true
 where r.id=target_case
 $limit$;
revoke all on function private.return_credit_source_limit(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.adjust_return_receivable(target_return_case_id uuid, credit_amount_vnd bigint, adjustment_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare case_row public.return_cases%rowtype; vl public.delivery_verification_lines%rowtype; l public.delivery_lines%rowtype;
 obligation public.receivable_obligations%rowtype; receipt public.command_receipts%rowtype; hash text;
 payment_ids uuid[]; credit_id uuid:=gen_random_uuid(); adjustment_id uuid; source record; release_id uuid;
 outstanding bigint; owed bigint; left_to_fund bigint; available bigint; part bigint; source_max bigint; prior_credits bigint; prior_return_quantity numeric; customer_id uuid;
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
 then return private.reconcile_legacy_return_credit(target_return_case_id,credit_amount_vnd,adjustment_reason,operation_id);end if;
 -- Lock the receipts first, then the debt. A new payment appearing in that interval requires a clean retry.
 select coalesce(array_agg(distinct a.payment_id),array[]::uuid[]) into payment_ids from public.payment_allocations a
  where a.receivable_obligation_id=obligation.id and a.amount_delta_vnd>0;
 perform 1 from public.payments p where p.id=any(payment_ids) order by p.id for update;
 perform 1 from public.receivable_obligations o where o.id=obligation.id for update;
 if exists(select 1 from public.payment_allocations a where a.receivable_obligation_id=obligation.id
   and a.amount_delta_vnd>0 and not(a.payment_id=any(payment_ids)))
 then raise exception 'return_payment_sources_changed_retry' using errcode='PT409';end if;
 select coalesce(sum(c.approved_credit_vnd),0)::bigint,coalesce(sum(r.base_quantity),0) into prior_credits,prior_return_quantity
  from public.customer_credits c join public.return_cases r on r.id=c.return_case_id where r.delivery_verification_line_id=vl.id;
 source_max:=private.return_credit_source_limit(case_row.id);
 if credit_amount_vnd>source_max or prior_credits+credit_amount_vnd>vl.receivable_amount_vnd
 then raise exception 'return_credit_exceeds_source' using errcode='23514';end if;
 outstanding:=case when obligation.id is null then 0 else private.current_receivable_outstanding(obligation.id) end;
 if outstanding<0 then raise exception 'legacy_negative_receivable_requires_reconciliation' using errcode='55000';end if;
 owed:=greatest(0,credit_amount_vnd-outstanding);left_to_fund:=owed;
 if credit_amount_vnd>0 then
  insert into public.receivable_adjustments(obligation_id,amount_delta_vnd,reason,recorded_by,return_case_id,adjustment_kind)
   values(obligation.id,-credit_amount_vnd,trim(adjustment_reason),(select auth.uid()),case_row.id,'RETURN') returning id into adjustment_id;
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
end $function$
;
create or replace view public.customer_return_finance_read with(security_barrier=true) as
 select r.id,r.branch_id,o.customer_id,d.id delivery_id,d.delivery_number,o.order_number,
  r.base_quantity::text base_quantity,sl.material_name_snapshot,r.reason,
  private.return_credit_source_limit(r.id)::text maximum_credit_vnd,
  exists(select 1 from public.receivable_adjustments a where a.return_case_id=r.id) legacy_adjustment_exists,
  (select (-sum(a.amount_delta_vnd))::text from public.receivable_adjustments a where a.return_case_id=r.id) legacy_credit_amount_vnd
 from public.return_cases r join public.delivery_verification_lines v on v.id=r.delivery_verification_line_id
 join public.delivery_lines l on l.id=r.delivery_line_id join public.deliveries d on d.id=l.delivery_id
 join public.sales_order_lines sl on sl.id=l.sales_order_line_id
 join public.sales_orders o on o.id=d.sales_order_id
 where r.case_kind='CUSTOMER_RETURN' and r.state='RETURNED' and private.has_permission(r.branch_id,'finance.ar.read')
  and not exists(select 1 from public.customer_credits c where c.return_case_id=r.id);
notify pgrst,'reload schema';
commit;
