-- G11: source-backed new transactions do not depend on opening imports or manual activation.
-- Historical import capabilities, source/role checks and immutable old activation facts remain separate.
begin;
create table private.branch_recorded_operations (
 branch_id uuid primary key references public.branches(id),
 started_at timestamptz not null,
 started_by uuid not null references auth.users(id),
 basis text not null check(basis in ('FIRST_RECORDED_TRANSACTION','EXISTING_ACTIVATION'))
);
alter table private.branch_recorded_operations enable row level security;
revoke all on private.branch_recorded_operations from public,anon,authenticated,service_role;
create function private.protect_recording_start() returns trigger
 language plpgsql security definer set search_path='' as $protect$
begin raise exception 'recording_start_immutable' using errcode='55000';end $protect$;
revoke all on function private.protect_recording_start() from public,anon,authenticated,service_role;
create trigger protect_recording_start before update or delete on private.branch_recorded_operations
 for each row execute function private.protect_recording_start();

create or replace function private.require_active_operations(b uuid) returns void
 language plpgsql security definer set search_path='' as $recording$
declare valid_start timestamptz; inserted uuid;
begin
 if b is null or auth.uid() is null or not exists(
  select 1 from public.employees e join public.employee_branch_access a on a.employee_id=e.id and a.active
  join public.roles r on r.id=a.role_id and r.active join public.branches branch on branch.id=a.branch_id and branch.active
  where e.auth_user_id=auth.uid() and e.active and a.branch_id=b)
 then raise exception 'forbidden_operational_branch' using errcode='42501';end if;
 -- Keep an already recorded start. No writer changes the opening/activation state.
 if exists(select 1 from private.branch_recorded_operations where branch_id=b) then return;end if;
 select e.recorded_at into valid_start from private.branch_operational_states s
  join private.operational_state_events e on e.operation_id=s.activation_operation_id and e.branch_id=s.branch_id
  where s.branch_id=b and s.state='ACTIVE' and e.intent->>'action'='activate';
 insert into private.branch_recorded_operations(branch_id,started_at,started_by,basis)
 values(b,coalesce(valid_start,statement_timestamp()),auth.uid(),
  case when valid_start is null then 'FIRST_RECORDED_TRANSACTION' else 'EXISTING_ACTIVATION' end)
 on conflict(branch_id) do nothing returning branch_id into inserted;
 if inserted is not null then
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,changed_fields)
  values(auth.uid(),b,'operations.recording_started','branch',b,array['recorded_operations_start']);
 end if;
end $recording$;
revoke all on function private.require_active_operations(uuid) from public,anon,authenticated,service_role;

create function private.branch_recording_scope(b uuid) returns jsonb
 language sql stable security definer set search_path='' as $scope$
 select jsonb_build_object('balance_scope','RECORDED_TRANSACTIONS','business_total_verified',false,
  'recorded_operations_since',(select started_at from private.branch_recorded_operations where branch_id=b),
  'historical_quality',case when exists(
   select 1 from private.branch_operational_states s
   join private.operational_opening_readbacks r on r.id=s.reconciliation_id
   join private.operational_opening_packages p on p.id=r.package_id and p.branch_id=s.branch_id
   where s.branch_id=b and p.status='RECONCILED' and p.data_mode='REAL')
  then 'VERIFIED_IMPORT_SCOPE' else 'UNRECONCILED' end)
 $scope$;
revoke all on function private.branch_recording_scope(uuid) from public,anon,authenticated,service_role;

create or replace function public.operational_branch_state(target_branch_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $state$
declare s private.branch_operational_states%rowtype; scope jsonb;
begin
 if not exists(select 1 from public.employees e join public.employee_branch_access a on a.employee_id=e.id and a.active
  join public.roles r on r.id=a.role_id and r.active join public.branches b on b.id=a.branch_id and b.active
  where e.auth_user_id=auth.uid() and e.active and a.branch_id=target_branch_id)
 then raise exception 'forbidden' using errcode='42501';end if;
 select * into s from private.branch_operational_states where branch_id=target_branch_id;
 scope:=private.branch_recording_scope(target_branch_id);
 return jsonb_build_object('state',s.state,'version',s.version,'canActivate',false,'reconciliationId',s.reconciliation_id,
  'postingAllowed',true,'historicalQuality',scope->>'historical_quality',
  'recordedOperationsSince',scope->'recorded_operations_since','businessTotalVerified',false);
end $state$;
revoke all on function public.operational_branch_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.operational_branch_state(uuid) to authenticated;

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
  return jsonb_build_object('scope',(jsonb_build_object('from',from_inclusive,'to',effective_to,'as_of',effective_cutoff,'branch_id',target_branch_id)||private.branch_recording_scope(target_branch_id)),'revenue',jsonb_build_object('value_vnd',case when not unsupported_activity then (revenue_total)::text else null end,'quality',case when unsupported_activity then 'NOT_APPLICABLE' else 'READY' end),'direct_cost',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then (direct_cost_total)::text else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'gross_profit',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then (revenue_total-direct_cost_total)::text else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'operating_expense',jsonb_build_object('value_vnd',case when can_expense and not opex_not_applicable then (opex_total)::text else null end,'quality',case when not can_expense then 'FORBIDDEN' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_profit',jsonb_build_object('value_vnd',case when can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then (revenue_total-direct_cost_total-opex_total)::text else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_margin_bps',jsonb_build_object('value',case when revenue_total>0 and can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then ((revenue_total-direct_cost_total-opex_total)::numeric*10000/revenue_total) else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'receivable',jsonb_build_object('value_vnd',case when can_ar then (ar_total)::text else null end,'quality',case when can_ar then 'READY' else 'FORBIDDEN' end),'payable',jsonb_build_object('value_vnd',case when can_ap and target_customer_id is null and target_site_id is null and target_sales_employee_id is null then (ap_total)::text else null end,'quality',case when not can_ap then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null then 'NOT_APPLICABLE' else 'READY' end),'salary_payable',jsonb_build_object('value_vnd',case when can_comp and target_customer_id is null and target_site_id is null and target_sales_employee_id is null and target_activity_kind is null then (salary_total)::text else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null or target_activity_kind is not null then 'NOT_APPLICABLE' else 'READY' end),'commission_payable',jsonb_build_object('value_vnd',case when can_comp and (target_activity_kind is null or target_activity_kind='SALES') then (commission_total)::text else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_activity_kind is not null and target_activity_kind<>'SALES' then 'NOT_APPLICABLE' else 'READY' end));
end $function$
;
notify pgrst,'reload schema';
commit;
