begin;
alter table public.receivable_adjustments add column adjustment_kind text not null default 'OTHER'
 check(adjustment_kind in('RETURN','PRICE','WRITE_OFF','OTHER'));
create table public.revenue_adjustments(
 id uuid primary key default gen_random_uuid(),branch_id uuid not null references public.branches(id) on delete restrict,
 receivable_adjustment_id uuid not null unique references public.receivable_adjustments(id) on delete restrict,
 sales_order_id uuid references public.sales_orders(id) on delete restrict,
 service_verification_id uuid references public.service_verifications(id) on delete restrict,
 adjustment_kind text not null check(adjustment_kind in('RETURN','PRICE')),
 amount_delta_vnd bigint not null check(amount_delta_vnd<>0),
 recorded_by uuid not null references auth.users(id) on delete restrict,recorded_at timestamptz not null default now(),
 check(num_nonnulls(sales_order_id,service_verification_id)=1)
);
alter table public.revenue_adjustments enable row level security;
revoke all on public.revenue_adjustments from public,anon,authenticated;
grant select on public.revenue_adjustments to authenticated;
create policy revenue_adjustments_read on public.revenue_adjustments for select to authenticated using(
 private.has_permission(branch_id,'finance.ar.read') or private.has_permission(branch_id,'finance.profit.read'));
create trigger revenue_adjustments_immutable before update or delete on public.revenue_adjustments
 for each row execute function private.reject_r6_posted_mutation();
create function private.post_typed_revenue_adjustment() returns trigger language plpgsql security definer set search_path='' as $body$
declare obligation_row public.receivable_obligations%rowtype; order_id uuid;
begin
 if new.adjustment_kind not in('RETURN','PRICE') then return new;end if;
 select * into obligation_row from public.receivable_obligations where id=new.obligation_id;
 if new.adjustment_kind='RETURN' and new.return_case_id is null then raise exception 'return_revenue_source_required' using errcode='23514';end if;
 if obligation_row.delivery_verification_id is not null then
  select d.sales_order_id into order_id from public.delivery_verifications v join public.deliveries d on d.id=v.delivery_id where v.id=obligation_row.delivery_verification_id;
 elsif obligation_row.service_verification_id is null then raise exception 'price_adjustment_billing_source_required' using errcode='23514';end if;
 insert into public.revenue_adjustments(branch_id,receivable_adjustment_id,sales_order_id,service_verification_id,adjustment_kind,amount_delta_vnd,recorded_by)
 values(obligation_row.branch_id,new.id,order_id,obligation_row.service_verification_id,new.adjustment_kind,new.amount_delta_vnd,new.recorded_by);
 return new;
end $body$;
revoke all on function private.post_typed_revenue_adjustment() from public,anon,authenticated,service_role;
create trigger typed_receivable_revenue after insert on public.receivable_adjustments for each row execute function private.post_typed_revenue_adjustment();

create function private.sales_order_net_revenue(target_order_id uuid,cutoff timestamptz) returns bigint
language sql stable security definer set search_path='' as $body$
 select(coalesce((select sum(r.amount_vnd) from public.revenue_entries r where r.sales_order_id=target_order_id and r.recorded_at<=cutoff),0)
  +coalesce((select sum(r.amount_delta_vnd) from public.revenue_adjustments r where r.sales_order_id=target_order_id and r.recorded_at<=cutoff),0)
  +coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a
    join public.receivable_obligations o on o.id=a.obligation_id join public.delivery_verifications v on v.id=o.delivery_verification_id
    join public.deliveries d on d.id=v.delivery_id where d.sales_order_id=target_order_id and a.return_case_id is not null
     and a.recorded_at<=cutoff and not exists(select 1 from public.revenue_adjustments r where r.receivable_adjustment_id=a.id)),0))::bigint
$body$;
revoke all on function private.sales_order_net_revenue(uuid,timestamptz) from public,anon,authenticated,service_role;

create function private.delivery_cost_sources_complete(target_verification_id uuid,cutoff timestamptz) returns boolean
language plpgsql stable security definer set search_path='' as $body$
declare verification_line record; confirmed_quantity numeric; required_quantity numeric; confirmed_cost bigint;
begin
 for verification_line in select v.*,l.source_mode,l.sales_order_line_id,l.supply_allocation_id
  from public.delivery_verification_lines v join public.delivery_lines l on l.id=v.delivery_line_id where v.delivery_verification_id=target_verification_id
 loop
  if verification_line.accepted_base_quantity=0 and verification_line.billable_base_quantity=0 then continue;end if;
  if verification_line.source_mode<>'SUPPLIER_DIRECT' then
   if verification_line.inventory_cost_vnd is null or(verification_line.accepted_base_quantity>0 and verification_line.inventory_cost_vnd<=0)
    or(verification_line.accepted_base_quantity>0 and verification_line.inventory_unit_cost_vnd_per_base is null)
   then return false;end if;
  else
   select coalesce(sum(fl.supplier_base_quantity),0),coalesce(sum(fl.payable_amount_vnd),0)::bigint into confirmed_quantity,confirmed_cost
    from public.supply_allocations sa join public.supplier_fulfillment_lines fl on fl.purchase_order_line_id=sa.purchase_order_line_id
     and fl.sales_order_line_id=verification_line.sales_order_line_id
    join public.supplier_fulfillments f on f.id=fl.supplier_fulfillment_id
    where sa.id=verification_line.supply_allocation_id and f.verified_at<=cutoff
     and exists(select 1 from public.direct_cost_entries dc where dc.supplier_fulfillment_id=f.id and dc.recorded_at<=cutoff);
   select coalesce(sum(greatest(v.accepted_base_quantity,v.billable_base_quantity)),0) into required_quantity
    from public.delivery_verification_lines v join public.delivery_verifications dv on dv.id=v.delivery_verification_id
    join public.delivery_lines l on l.id=v.delivery_line_id join public.supply_allocations other_sa on other_sa.id=l.supply_allocation_id
    where l.sales_order_line_id=verification_line.sales_order_line_id and dv.verified_at<=cutoff and l.source_mode='SUPPLIER_DIRECT'
     and other_sa.purchase_order_line_id=(select sa.purchase_order_line_id from public.supply_allocations sa where sa.id=verification_line.supply_allocation_id);
   if confirmed_quantity<required_quantity or confirmed_cost<=0 then return false;end if;
  end if;
 end loop;
 return true;
end $body$;
revoke all on function private.delivery_cost_sources_complete(uuid,timestamptz) from public,anon,authenticated,service_role;

create function public.record_receivable_adjustment_typed(target_obligation_id uuid,amount_delta_vnd bigint,adjustment_kind text,
 reason text,target_evidence_id uuid,operation_id uuid) returns uuid language plpgsql security definer set search_path='' as $body$
declare obligation_row public.receivable_obligations%rowtype; receipt_row public.command_receipts%rowtype; hash text; adjustment_id uuid;
begin
 select * into obligation_row from public.receivable_obligations where id=target_obligation_id;
 if obligation_row.id is null or not private.has_permission(obligation_row.branch_id,'finance.ar.adjust') then raise exception 'forbidden_or_obligation_not_found' using errcode='42501';end if;
 hash:=private.command_payload_hash(jsonb_build_object('obligation_id',target_obligation_id,'delta',amount_delta_vnd,'kind',adjustment_kind,'reason',trim(reason),'evidence_id',target_evidence_id));
 select * into receipt_row from public.command_receipts where command_receipts.operation_id=record_receivable_adjustment_typed.operation_id;
 if found then if receipt_row.command_name<>'record_receivable_adjustment_typed' or receipt_row.payload_hash<>hash then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt_row.result_entity_id;end if;
 if adjustment_kind is null or adjustment_kind not in('PRICE','WRITE_OFF','OTHER') or amount_delta_vnd is null or amount_delta_vnd=0
  or coalesce(length(trim(reason)),0) not between 3 and 500 then raise exception 'invalid_adjustment' using errcode='22023';end if;
 if target_evidence_id is not null then perform private.assert_verified_evidence(target_evidence_id,obligation_row.branch_id);end if;
 perform 1 from public.receivable_obligations where id=target_obligation_id for update;
 if private.current_receivable_outstanding(target_obligation_id)+amount_delta_vnd<0 then raise exception 'adjustment_exceeds_outstanding' using errcode='23514';end if;
 if adjustment_kind='PRICE' and obligation_row.delivery_verification_id is null and obligation_row.service_verification_id is null
 then raise exception 'price_adjustment_billing_source_required' using errcode='23514';end if;
 insert into public.receivable_adjustments(obligation_id,amount_delta_vnd,adjustment_kind,reason,evidence_object_id,recorded_by)
 values(obligation_row.id,amount_delta_vnd,adjustment_kind,trim(reason),target_evidence_id,(select auth.uid())) returning id into adjustment_id;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values((select auth.uid()),obligation_row.branch_id,'receivable.adjusted','receivable_adjustment',adjustment_id,operation_id,array['adjustment_kind','amount_delta_vnd','billing_source'],trim(reason));
 insert into public.command_receipts values(operation_id,(select auth.uid()),'record_receivable_adjustment_typed',hash,'receivable_adjustment',adjustment_id,now());
 return adjustment_id;
end $body$;
revoke all on function public.record_receivable_adjustment_typed(uuid,bigint,text,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_receivable_adjustment_typed(uuid,bigint,text,text,uuid,uuid) to authenticated;

create or replace function public.adjust_return_receivable(target_return_case_id uuid,credit_amount_vnd bigint,adjustment_reason text,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $body$
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
 select coalesce(sum(c.approved_credit_vnd),0)::bigint,coalesce(sum(r.base_quantity),0) into prior_credits,prior_return_quantity
  from public.customer_credits c join public.return_cases r on r.id=c.return_case_id where r.delivery_verification_line_id=vl.id;
 source_max:=least(source_max,greatest(0,round((prior_return_quantity+case_row.base_quantity)*l.unit_price_vnd*l.conversion_denominator/l.conversion_numerator)::bigint-prior_credits));
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
end $body$;
CREATE OR REPLACE FUNCTION public.finance_dashboard_snapshot(target_branch_id uuid, from_inclusive timestamp with time zone, to_exclusive timestamp with time zone, knowledge_cutoff timestamp with time zone, target_customer_id uuid DEFAULT NULL::uuid, target_site_id uuid DEFAULT NULL::uuid, target_sales_employee_id uuid DEFAULT NULL::uuid, target_activity_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare effective_to timestamptz:=least(to_exclusive,now()); effective_cutoff timestamptz:=least(knowledge_cutoff,now()); can_profit boolean; can_expense boolean; can_ar boolean; can_ap boolean; can_comp boolean; revenue_total bigint:=0; direct_cost_total bigint:=0; opex_total bigint:=0; ar_total bigint:=0; ap_total bigint:=0; salary_total bigint:=0; commission_total bigint:=0; cost_incomplete boolean:=false; opex_not_applicable boolean:=false; unsupported_activity boolean:=target_activity_kind is not null and target_activity_kind not in ('DELIVERY','SERVICE','SALES','OPERATIONS','ADMIN');
begin
  if not private.has_permission(target_branch_id,'dashboard.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if from_inclusive>=to_exclusive then raise exception 'invalid_report_period' using errcode='22023'; end if;
  can_profit:=private.has_permission(target_branch_id,'finance.profit.read'); can_expense:=private.has_permission(target_branch_id,'finance.expense.read'); can_ar:=private.has_permission(target_branch_id,'finance.ar.read'); can_ap:=private.has_permission(target_branch_id,'finance.ap.read'); can_comp:=private.has_permission(target_branch_id,'compensation.read');
  select coalesce(sum(amount),0)::bigint into revenue_total from (
    select r.amount_vnd amount from public.revenue_entries r join public.sales_orders o on o.id=r.sales_order_id where r.branch_id=target_branch_id and r.recorded_at>=from_inclusive and r.recorded_at<effective_to and r.recorded_at<=effective_cutoff and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id) and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='DELIVERY')
    union all
    select v.billable_amount_vnd from public.service_verifications v join public.service_jobs j on j.id=v.service_job_id where j.branch_id=target_branch_id and v.verified_at>=from_inclusive and v.verified_at<effective_to and v.verified_at<=effective_cutoff and (target_customer_id is null or j.customer_id=target_customer_id) and (target_site_id is null or j.site_id=target_site_id) and (target_sales_employee_id is null or j.sales_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='SERVICE')
    union all
    select ra.amount_delta_vnd from public.revenue_adjustments ra
      left join public.sales_orders o on o.id=ra.sales_order_id left join public.service_verifications sv on sv.id=ra.service_verification_id
      left join public.service_jobs j on j.id=sv.service_job_id
      where ra.branch_id=target_branch_id and ra.recorded_at>=from_inclusive and ra.recorded_at<effective_to and ra.recorded_at<=effective_cutoff
        and (target_customer_id is null or coalesce(o.customer_id,j.customer_id)=target_customer_id)
        and (target_site_id is null or coalesce(o.site_id,j.site_id)=target_site_id)
        and (target_sales_employee_id is null or coalesce(o.sales_owner_employee_id,j.sales_employee_id)=target_sales_employee_id)
        and (target_activity_kind is null or(target_activity_kind='DELIVERY' and ra.sales_order_id is not null) or(target_activity_kind='SERVICE' and ra.service_verification_id is not null))
    union all
    select a.amount_delta_vnd from public.receivable_adjustments a join public.receivable_obligations ro on ro.id=a.obligation_id
      join public.delivery_verifications dv on dv.id=ro.delivery_verification_id join public.deliveries d on d.id=dv.delivery_id
      join public.sales_orders o on o.id=d.sales_order_id
      where ro.branch_id=target_branch_id and a.return_case_id is not null and a.recorded_at>=from_inclusive and a.recorded_at<effective_to and a.recorded_at<=effective_cutoff
        and not exists(select 1 from public.revenue_adjustments ra where ra.receivable_adjustment_id=a.id)
        and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id)
        and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and(target_activity_kind is null or target_activity_kind='DELIVERY')
  ) revenue;
  if can_profit then
    select coalesce(sum(amount),0)::bigint into direct_cost_total from (
      select d.amount_delta_vnd amount from public.direct_cost_entries d join public.sales_orders o on o.id=d.sales_order_id where d.branch_id=target_branch_id and d.recorded_at>=from_inclusive and d.recorded_at<effective_to and d.recorded_at<=effective_cutoff and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id) and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='DELIVERY')
      union all
      select ee.approved_amount_vnd from public.earning_events ee left join public.service_verifications sv on sv.id=ee.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id left join public.work_item_verifications wv on wv.id=ee.work_item_verification_id left join public.work_items wi on wi.id=wv.work_item_id left join public.deliveries d on d.id=wi.delivery_id left join public.sales_orders wo on wo.id=d.sales_order_id left join public.sales_orders so on so.id=ee.sales_order_id where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification='DIRECT_LABOR' and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff and (target_customer_id is null or coalesce(sj.customer_id,wo.customer_id,so.customer_id)=target_customer_id) and (target_site_id is null or coalesce(sj.site_id,wo.site_id,so.site_id)=target_site_id) and (target_sales_employee_id is null or coalesce(sj.sales_employee_id,wo.sales_owner_employee_id,so.sales_owner_employee_id)=target_sales_employee_id) and (target_activity_kind is null or (target_activity_kind='SERVICE' and ee.service_verification_id is not null) or (target_activity_kind='DELIVERY' and wi.delivery_id is not null))
    ) costs;
    select exists(select 1 from public.delivery_verifications dv join public.deliveries d on d.id=dv.delivery_id
      join public.sales_orders o on o.id=d.sales_order_id where d.branch_id=target_branch_id
       and dv.verified_at>=from_inclusive and dv.verified_at<effective_to and dv.verified_at<=effective_cutoff
       and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id)
       and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and(target_activity_kind is null or target_activity_kind='DELIVERY')
       and not private.delivery_cost_sources_complete(dv.id,effective_cutoff)) into cost_incomplete;
  end if;
  if can_expense then
    select coalesce(sum(amount),0)::bigint into opex_total from (
      select e.amount_vnd amount from public.expenses e where e.branch_id=target_branch_id and e.approval_state='APPROVED' and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff and (target_customer_id is null or e.customer_id=target_customer_id) and (target_site_id is null or e.site_id=target_site_id) and (target_sales_employee_id is null or e.sales_employee_id=target_sales_employee_id) and (target_activity_kind is null or e.activity_kind=target_activity_kind)
      union all
      select ee.approved_amount_vnd from public.earning_events ee left join public.sales_orders so on so.id=ee.sales_order_id left join public.service_verifications sv on sv.id=ee.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification in ('OPEX','SALES_COMMISSION') and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff and (target_customer_id is null or coalesce(so.customer_id,sj.customer_id)=target_customer_id) and (target_site_id is null or coalesce(so.site_id,sj.site_id)=target_site_id) and (target_sales_employee_id is null or ee.employee_id=target_sales_employee_id) and (target_activity_kind is null or (target_activity_kind='SALES' and ee.classification='SALES_COMMISSION') or (target_activity_kind='SERVICE' and ee.service_verification_id is not null) or (target_activity_kind in ('OPERATIONS','ADMIN') and ee.manual_basis_id is not null))
    ) expenses_all;
    opex_not_applicable := (target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null) and (exists(select 1 from public.expenses e where e.branch_id=target_branch_id and e.approval_state='APPROVED' and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff and ((target_customer_id is not null and e.customer_id is null) or (target_site_id is not null and e.site_id is null) or (target_sales_employee_id is not null and e.sales_employee_id is null))) or exists(select 1 from public.earning_events ee where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification='OPEX' and ee.manual_basis_id is not null and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff));
  end if;
  if can_ar then select coalesce(sum(r.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a where a.obligation_id=r.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.receivable_obligation_id=r.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into ar_total from public.receivable_obligations r left join public.delivery_verifications dv on dv.id=r.delivery_verification_id left join public.deliveries d on d.id=dv.delivery_id left join public.sales_orders so on so.id=d.sales_order_id left join public.service_verifications sv on sv.id=r.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id where r.branch_id=target_branch_id and r.recorded_at<=effective_to and r.recorded_at<=effective_cutoff and (target_customer_id is null or r.customer_id=target_customer_id) and (target_site_id is null or r.site_id=target_site_id) and (target_sales_employee_id is null or coalesce(so.sales_owner_employee_id,sj.sales_employee_id)=target_sales_employee_id); end if;
  if can_ap then select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into ap_total from public.payable_obligations p where p.branch_id=target_branch_id and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff; end if;
  if can_comp then
    select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into salary_total from public.payable_obligations p join public.earning_events ee on ee.id=p.earning_event_id where p.branch_id=target_branch_id and ee.classification<>'SALES_COMMISSION' and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff;
    select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into commission_total from public.payable_obligations p join public.earning_events ee on ee.id=p.earning_event_id left join public.sales_orders so on so.id=ee.sales_order_id where p.branch_id=target_branch_id and ee.classification='SALES_COMMISSION' and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff and (target_customer_id is null or so.customer_id=target_customer_id) and (target_site_id is null or so.site_id=target_site_id) and (target_sales_employee_id is null or ee.employee_id=target_sales_employee_id);
  end if;
  return jsonb_build_object('scope',jsonb_build_object('from',from_inclusive,'to',effective_to,'as_of',effective_cutoff,'branch_id',target_branch_id),'revenue',jsonb_build_object('value_vnd',case when not unsupported_activity then (revenue_total)::text else null end,'quality',case when unsupported_activity then 'NOT_APPLICABLE' else 'READY' end),'direct_cost',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then (direct_cost_total)::text else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'gross_profit',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then (revenue_total-direct_cost_total)::text else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'operating_expense',jsonb_build_object('value_vnd',case when can_expense and not opex_not_applicable then (opex_total)::text else null end,'quality',case when not can_expense then 'FORBIDDEN' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_profit',jsonb_build_object('value_vnd',case when can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then (revenue_total-direct_cost_total-opex_total)::text else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_margin_bps',jsonb_build_object('value',case when revenue_total>0 and can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then ((revenue_total-direct_cost_total-opex_total)::numeric*10000/revenue_total) else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'receivable',jsonb_build_object('value_vnd',case when can_ar then (ar_total)::text else null end,'quality',case when can_ar then 'READY' else 'FORBIDDEN' end),'payable',jsonb_build_object('value_vnd',case when can_ap and target_customer_id is null and target_site_id is null and target_sales_employee_id is null then (ap_total)::text else null end,'quality',case when not can_ap then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null then 'NOT_APPLICABLE' else 'READY' end),'salary_payable',jsonb_build_object('value_vnd',case when can_comp and target_customer_id is null and target_site_id is null and target_sales_employee_id is null and target_activity_kind is null then (salary_total)::text else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null or target_activity_kind is not null then 'NOT_APPLICABLE' else 'READY' end),'commission_payable',jsonb_build_object('value_vnd',case when can_comp and (target_activity_kind is null or target_activity_kind='SALES') then (commission_total)::text else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_activity_kind is not null and target_activity_kind<>'SALES' then 'NOT_APPLICABLE' else 'READY' end));
end $function$
;
CREATE OR REPLACE FUNCTION public.calculate_earning_event(target_rule_id uuid, source_kind text, source_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rule public.compensation_rules%rowtype; payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; employee uuid; basis_qty numeric; basis_amount bigint; source_date date; source_key text; amount bigint; service_verification uuid; work_verification uuid; sales_order uuid; manual_basis uuid; basis public.compensation_manual_bases%rowtype;
begin
  select * into rule from public.compensation_rules where id=target_rule_id;
  if rule.id is null or not private.has_permission(rule.branch_id,'compensation.manage') then raise exception 'forbidden_or_rule_not_found' using errcode='42501'; end if;
  if source_kind not in ('SERVICE_VERIFICATION','WORK_ITEM_VERIFICATION','SALES_ORDER','MANUAL_BASIS') then raise exception 'invalid_earning_source' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('rule',target_rule_id,'source_kind',source_kind,'source',source_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id=calculate_earning_event.operation_id;
  if found then if receipt.command_name<>'calculate_earning_event' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  if exists(select 1 from public.compensation_recognition_policies p where p.rule_id=rule.id) then
    if source_kind<>'WORK_ITEM_VERIFICATION' then raise exception 'automatic_rule_requires_canonical_event' using errcode='22023'; end if;
    select e.id into entity_id from public.earning_events e where e.rule_id=rule.id and e.work_item_verification_id=source_id;
    if entity_id is null then raise exception 'automatic_earning_not_recognized' using errcode='55000'; end if;
    insert into public.command_receipts values(operation_id,(select auth.uid()),'calculate_earning_event',payload_hash,'earning_event',entity_id,now());
    return entity_id;
  end if;
  if source_kind='SERVICE_VERIFICATION' then
    select a.employee_id,case when rule.earning_type='PER_JOB' then 1 when rule.earning_type='PER_HOUR' then extract(epoch from (l.ended_at-l.started_at))/3600 else v.compensable_quantity end,v.verified_at::date,v.id into employee,basis_qty,source_date,service_verification
    from public.service_verifications v join public.service_jobs j on j.id=v.service_job_id and j.branch_id=rule.branch_id join public.service_work_logs l on l.work_item_id=v.work_item_id join public.work_item_assignments a on a.work_item_id=v.work_item_id and a.superseded_at is null where v.id=source_id;
    if rule.earning_type not in ('PER_JOB','PER_HOUR','PER_TON','PER_M3','PER_BAG','PER_UNIT') then raise exception 'rule_not_valid_for_service' using errcode='22023'; end if;
  elsif source_kind='WORK_ITEM_VERIFICATION' then
    select a.employee_id,case when rule.earning_type in ('PER_JOB','PER_TRIP') then 1 else r.actual_quantity end,v.verified_at::date,v.id into employee,basis_qty,source_date,work_verification
    from public.work_item_verifications v join public.work_items w on w.id=v.work_item_id and w.branch_id=rule.branch_id join public.work_item_results r on r.id=v.result_id join public.work_item_assignments a on a.id=r.assignment_id and a.work_item_id=v.work_item_id where v.id=source_id;
    if rule.earning_type not in ('PER_JOB','PER_TRIP','PER_TON','PER_M3','PER_BAG','PER_UNIT') then raise exception 'rule_not_valid_for_work' using errcode='22023'; end if;
  elsif source_kind='SALES_ORDER' then
    if rule.earning_type<>'SALES_COMMISSION' then raise exception 'commission_rule_required' using errcode='22023'; end if;
    select o.sales_owner_employee_id,private.sales_order_net_revenue(o.id,now())-coalesce((select sum(d.amount_delta_vnd) from public.direct_cost_entries d where d.sales_order_id=o.id),0),coalesce(max(r.recorded_at),now())::date,o.id into employee,basis_amount,source_date,sales_order
    from public.sales_orders o left join public.revenue_entries r on r.sales_order_id=o.id where o.id=source_id and o.branch_id=rule.branch_id group by o.id;
    if exists(select 1 from public.delivery_verifications dv join public.deliveries d on d.id=dv.delivery_id
      where d.sales_order_id=source_id and not private.delivery_cost_sources_complete(dv.id,now()))
    then raise exception 'commission_cost_source_incomplete' using errcode='23514';end if;
    basis_qty:=basis_amount;
    if basis_amount is null or basis_amount<=0 then raise exception 'commission_profit_basis_not_positive' using errcode='23514'; end if;
  else
    select * into basis from public.compensation_manual_bases where id=source_id and branch_id=rule.branch_id;
    employee:=basis.employee_id; basis_qty:=basis.basis_quantity; source_date:=basis.period_end; manual_basis:=basis.id;
    if basis.id is null or rule.earning_type<>basis.basis_type then raise exception 'rule_basis_mismatch' using errcode='22023'; end if;
  end if;
  if employee is null or (rule.employee_id is not null and rule.employee_id<>employee) then raise exception 'earning_employee_mismatch' using errcode='42501'; end if;
  if source_date<rule.effective_from or (rule.effective_to is not null and source_date>rule.effective_to) then raise exception 'rule_not_effective' using errcode='22023'; end if;
  source_key:=source_kind||':'||source_id::text;
  if rule.calculation_kind='PERCENT_BPS' then amount:=round(basis_amount::numeric*rule.rate_bps/10000)::bigint; else amount:=round(basis_qty*rule.rate_vnd_per_unit)::bigint; end if;
  if amount=0 then raise exception 'zero_earning_not_recorded' using errcode='23514'; end if;
  insert into public.earning_events(branch_id,employee_id,rule_id,rule_code_snapshot,rule_version_snapshot,earning_type,classification,service_verification_id,work_item_verification_id,sales_order_id,manual_basis_id,source_key,basis_quantity,basis_amount_vnd,rate_vnd_per_unit_snapshot,rate_bps_snapshot,calculated_amount_vnd,created_by)
  values(rule.branch_id,employee,rule.id,rule.code,rule.version,rule.earning_type,rule.classification,service_verification,work_verification,sales_order,manual_basis,source_key,basis_qty,basis_amount,rule.rate_vnd_per_unit,rule.rate_bps,amount,(select auth.uid())) on conflict on constraint earning_events_source_key_rule_id_employee_id_key do nothing returning id into entity_id;
  if entity_id is null then
    select e.id into entity_id from public.earning_events e where e.source_key=calculate_earning_event.source_key and e.rule_id=rule.id and e.employee_id=employee;
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'calculate_earning_event',payload_hash,'earning_event',entity_id,now());
  return entity_id;
end $function$
;
notify pgrst,'reload schema';
commit;
