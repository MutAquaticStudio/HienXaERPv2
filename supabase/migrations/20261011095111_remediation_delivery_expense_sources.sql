-- One expense is charged to one delivery attempt; existing AP/payment remains authoritative.
begin;
create table public.delivery_expense_sources (
 expense_id uuid primary key references public.expenses(id) on delete restrict,
 branch_id uuid not null references public.branches(id),
 delivery_id uuid not null references public.deliveries(id),
 assignment_id uuid not null references public.delivery_assignments(id),
 cost_scope text not null check(cost_scope in('DIRECT_DELIVERY','OVERHEAD')),
 supplier_id uuid not null references public.suppliers(id),
 supplier_reference text not null check(char_length(trim(supplier_reference)) between 3 and 100),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(branch_id,supplier_id,supplier_reference)
);
alter table public.delivery_expense_sources enable row level security;
create policy delivery_expense_source_read on public.delivery_expense_sources for select to authenticated
 using(private.has_permission(branch_id,'finance.expense.read'));
grant select on public.delivery_expense_sources to authenticated;
revoke insert,update,delete on public.delivery_expense_sources from authenticated,anon;
create trigger delivery_expense_source_immutable before update or delete on public.delivery_expense_sources
 for each row execute function private.reject_r7_posted_mutation();

create function public.create_delivery_expense(target_branch_id uuid,target_assignment_id uuid,
 target_category_id uuid,target_supplier_id uuid,amount_vnd bigint,effective_at timestamptz,due_date date,
 description text,cost_scope text,supplier_reference text,target_evidence_id uuid,expected_delivery_version integer,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
declare d public.deliveries%rowtype; a public.delivery_assignments%rowtype; r public.command_receipts%rowtype; h text; expense_id uuid;
begin
 if not private.has_permission(target_branch_id,'finance.expense.manage') then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'create_delivery_expense');
 perform pg_advisory_xact_lock(hashtextextended('create_delivery_expense:'||operation_id::text,0));
 if operation_id is null or cost_scope is null or cost_scope not in('DIRECT_DELIVERY','OVERHEAD') or supplier_reference is null
 or char_length(trim(supplier_reference)) not between 3 and 100 or amount_vnd is null or amount_vnd<=0 or effective_at is null or due_date is null or description is null
 then raise exception 'invalid_delivery_expense' using errcode='22023';end if;
 h:=private.command_payload_hash(jsonb_build_array(target_branch_id,target_assignment_id,target_category_id,target_supplier_id,amount_vnd,effective_at,due_date,trim(description),cost_scope,trim(supplier_reference),target_evidence_id,expected_delivery_version));
 select * into r from public.command_receipts where command_receipts.operation_id=create_delivery_expense.operation_id;
 if found then
  if r.command_name<>'create_delivery_expense' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid()
  then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;
 end if;
 select * into a from public.delivery_assignments where id=target_assignment_id;
 select * into d from public.deliveries where id=a.delivery_id and branch_id=target_branch_id for update;
 if d.id is null or d.version is distinct from expected_delivery_version then raise exception 'delivery_expense_source_version_conflict' using errcode='40001';end if;
 -- Assignment is explicit and immutable: a later reassignment cannot move an old trip's expense.
 if not exists(select 1 from public.delivery_handoffs where assignment_id=a.id) then raise exception 'delivery_expense_requires_actual_handoff' using errcode='23514';end if;
 expense_id:=public.create_expense(target_branch_id,target_category_id,target_supplier_id,amount_vnd,effective_at,due_date,description,'DELIVERY',
  case when cost_scope='DIRECT_DELIVERY' then d.sales_order_id else null end,target_evidence_id,gen_random_uuid());
 insert into public.delivery_expense_sources values(expense_id,target_branch_id,d.id,a.id,cost_scope,target_supplier_id,trim(supplier_reference),auth.uid(),now());
 insert into public.command_receipts values(operation_id,auth.uid(),'create_delivery_expense',h,'expense',expense_id,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
 values(auth.uid(),target_branch_id,'delivery_expense.created','expense',expense_id,operation_id,array['delivery_id','assignment_id','cost_scope','supplier_reference']);
 return expense_id;
end $fn$;
revoke all on function public.create_delivery_expense(uuid,uuid,uuid,uuid,bigint,timestamptz,date,text,text,text,uuid,integer,uuid) from public,anon;
grant execute on function public.create_delivery_expense(uuid,uuid,uuid,uuid,bigint,timestamptz,date,text,text,text,uuid,integer,uuid) to authenticated;

-- Only operational identifiers are available here; no inventory costs, earnings or raw payloads.
create view public.delivery_expense_assignment_read with(security_barrier=true) as
 select a.id assignment_id,d.id delivery_id,d.branch_id,d.delivery_number,d.execution_state,d.version delivery_version,
 a.assignment_version,a.vehicle_id,v.code vehicle_code,v.plate_number,a.external_carrier_name,h.handed_off_at
 from public.delivery_assignments a join public.deliveries d on d.id=a.delivery_id
 join public.delivery_handoffs h on h.assignment_id=a.id left join public.vehicles v on v.id=a.vehicle_id
 where private.has_permission(d.branch_id,'finance.expense.manage');
grant select on public.delivery_expense_assignment_read to authenticated;

create view public.delivery_expense_read with(security_invoker=true) as
 select s.*,e.expense_number,e.amount_vnd::text,e.approval_state,e.version expense_version
 from public.delivery_expense_sources s join public.expenses e on e.id=s.expense_id;
grant select on public.delivery_expense_read to authenticated;
CREATE OR REPLACE FUNCTION public.approve_expense(target_expense_id uuid, expected_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  expense public.expenses%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  perform private.lock_saved_command_intent(operation_id,'approve_expense');
  perform pg_advisory_xact_lock(hashtextextended('approve_expense:'||operation_id::text,0));
  select * into expense from public.expenses where id = target_expense_id;
  if expense.id is null or not private.has_permission(expense.branch_id, 'finance.expense.manage') then raise exception 'forbidden_or_expense_not_found' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('expense_id', target_expense_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = approve_expense.operation_id;
  if found then
    if receipt.command_name <> 'approve_expense' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into expense from public.expenses where id = target_expense_id for update;
  if expense.approval_state <> 'DRAFT' or expense.version  IS DISTINCT FROM expected_version then raise exception 'expense_version_conflict' using errcode = 'PT409'; end if;
  if expense.evidence_object_id is not null then perform private.assert_verified_evidence(expense.evidence_object_id, expense.branch_id); end if;
  update public.expenses set approval_state = 'APPROVED', version = version + 1, approved_by = (select auth.uid()), approved_at = now() where id = expense.id;
  insert into public.payable_obligations(branch_id, supplier_id, expense_id, original_amount_vnd, due_date, recorded_at, recorded_by)
  values (expense.branch_id, expense.supplier_id, expense.id, expense.amount_vnd, expense.due_date, now(), (select auth.uid()));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'approve_expense', payload_hash, 'expense', expense.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), expense.branch_id, 'expense.approved', 'expense', expense.id, operation_id, array['approval_state','version']);
  return expense.id;
end
$function$
;
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
      select e.amount_vnd from public.expenses e join public.delivery_expense_sources s on s.expense_id=e.id join public.deliveries d on d.id=s.delivery_id join public.sales_orders o on o.id=d.sales_order_id
       where e.branch_id=target_branch_id and e.approval_state='APPROVED' and s.cost_scope='DIRECT_DELIVERY'
       and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff
       and (target_customer_id is null or o.customer_id=target_customer_id) and(target_site_id is null or o.site_id=target_site_id)
       and(target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and(target_activity_kind is null or target_activity_kind='DELIVERY')
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
      select e.amount_vnd amount from public.expenses e where e.branch_id=target_branch_id and e.approval_state='APPROVED' and not exists(select 1 from public.delivery_expense_sources ds where ds.expense_id=e.id and ds.cost_scope='DIRECT_DELIVERY') and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff and (target_customer_id is null or e.customer_id=target_customer_id) and (target_site_id is null or e.site_id=target_site_id) and (target_sales_employee_id is null or e.sales_employee_id=target_sales_employee_id) and (target_activity_kind is null or e.activity_kind=target_activity_kind)
      union all
      select ee.approved_amount_vnd from public.earning_events ee left join public.sales_orders so on so.id=ee.sales_order_id left join public.service_verifications sv on sv.id=ee.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and not exists(select 1 from public.delivery_expense_sources ds where ds.expense_id=e.id and ds.cost_scope='DIRECT_DELIVERY') and ee.classification in ('OPEX','SALES_COMMISSION') and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff and (target_customer_id is null or coalesce(so.customer_id,sj.customer_id)=target_customer_id) and (target_site_id is null or coalesce(so.site_id,sj.site_id)=target_site_id) and (target_sales_employee_id is null or ee.employee_id=target_sales_employee_id) and (target_activity_kind is null or (target_activity_kind='SALES' and ee.classification='SALES_COMMISSION') or (target_activity_kind='SERVICE' and ee.service_verification_id is not null) or (target_activity_kind in ('OPERATIONS','ADMIN') and ee.manual_basis_id is not null))
    ) expenses_all;
    opex_not_applicable := (target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null) and (exists(select 1 from public.expenses e where e.branch_id=target_branch_id and e.approval_state='APPROVED' and not exists(select 1 from public.delivery_expense_sources ds where ds.expense_id=e.id and ds.cost_scope='DIRECT_DELIVERY') and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff and ((target_customer_id is not null and e.customer_id is null) or (target_site_id is not null and e.site_id is null) or (target_sales_employee_id is not null and e.sales_employee_id is null))) or exists(select 1 from public.earning_events ee where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and not exists(select 1 from public.delivery_expense_sources ds where ds.expense_id=e.id and ds.cost_scope='DIRECT_DELIVERY') and ee.classification='OPEX' and ee.manual_basis_id is not null and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff));
  end if;
  if can_ar then select coalesce(sum(r.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a where a.obligation_id=r.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.receivable_obligation_id=r.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into ar_total from public.receivable_obligations r left join public.delivery_verifications dv on dv.id=r.delivery_verification_id left join public.deliveries d on d.id=dv.delivery_id left join public.sales_orders so on so.id=d.sales_order_id left join public.service_verifications sv on sv.id=r.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id where r.branch_id=target_branch_id and r.recorded_at<=effective_to and r.recorded_at<=effective_cutoff and (target_customer_id is null or r.customer_id=target_customer_id) and (target_site_id is null or r.site_id=target_site_id) and (target_sales_employee_id is null or coalesce(so.sales_owner_employee_id,sj.sales_employee_id)=target_sales_employee_id); end if;
  if can_ap then select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into ap_total from public.payable_obligations p where p.branch_id=target_branch_id and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff; end if;
  if can_comp then
    select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into salary_total from public.payable_obligations p join public.earning_events ee on ee.id=p.earning_event_id where p.branch_id=target_branch_id and ee.classification<>'SALES_COMMISSION' and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff;
    select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into commission_total from public.payable_obligations p join public.earning_events ee on ee.id=p.earning_event_id left join public.sales_orders so on so.id=ee.sales_order_id where p.branch_id=target_branch_id and ee.classification='SALES_COMMISSION' and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff and (target_customer_id is null or so.customer_id=target_customer_id) and (target_site_id is null or so.site_id=target_site_id) and (target_sales_employee_id is null or ee.employee_id=target_sales_employee_id);
  end if;
  return jsonb_build_object('scope',(jsonb_build_object('from',from_inclusive,'to',effective_to,'as_of',effective_cutoff,'branch_id',target_branch_id)||private.branch_recording_scope(target_branch_id,effective_cutoff)),'revenue',jsonb_build_object('value_vnd',case when not unsupported_activity then (revenue_total)::text else null end,'quality',case when unsupported_activity then 'NOT_APPLICABLE' else 'READY' end),'direct_cost',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then (direct_cost_total)::text else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'gross_profit',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then (revenue_total-direct_cost_total)::text else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'operating_expense',jsonb_build_object('value_vnd',case when can_expense and not opex_not_applicable then (opex_total)::text else null end,'quality',case when not can_expense then 'FORBIDDEN' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_profit',jsonb_build_object('value_vnd',case when can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then (revenue_total-direct_cost_total-opex_total)::text else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_margin_bps',jsonb_build_object('value',case when revenue_total>0 and can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then ((revenue_total-direct_cost_total-opex_total)::numeric*10000/revenue_total) else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'receivable',jsonb_build_object('value_vnd',case when can_ar then (ar_total)::text else null end,'quality',case when can_ar then 'READY' else 'FORBIDDEN' end),'payable',jsonb_build_object('value_vnd',case when can_ap and target_customer_id is null and target_site_id is null and target_sales_employee_id is null then (ap_total)::text else null end,'quality',case when not can_ap then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null then 'NOT_APPLICABLE' else 'READY' end),'salary_payable',jsonb_build_object('value_vnd',case when can_comp and target_customer_id is null and target_site_id is null and target_sales_employee_id is null and target_activity_kind is null then (salary_total)::text else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null or target_activity_kind is not null then 'NOT_APPLICABLE' else 'READY' end),'commission_payable',jsonb_build_object('value_vnd',case when can_comp and (target_activity_kind is null or target_activity_kind='SALES') then (commission_total)::text else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_activity_kind is not null and target_activity_kind<>'SALES' then 'NOT_APPLICABLE' else 'READY' end));
end $function$
;
alter table private.command_drafts drop constraint command_drafts_command_name_check;
alter table private.command_drafts add constraint command_drafts_command_name_check check(command_name in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense'));
CREATE OR REPLACE FUNCTION public.get_command_draft(target_operation_id uuid, target_command text, target_branch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.command_drafts%rowtype; permission text;
begin
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' else 'inventory.receive' end;
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
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense')
 then raise exception 'invalid_command_lookup' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' else 'inventory.receive' end;
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
 elsif target_command in('create_delivery_expense','approve_expense') and r.result_type='expense' then
  select branch_id into b from public.expenses where id=r.result_entity_id;
 elsif target_command='resolve_commission_reconciliation' and r.result_type='commission_review_resolution' then
  select branch_id into b from public.commission_review_resolutions where id=r.result_entity_id;
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
 if target_operation_id is null or target_command is null or target_command not in('post_payment','receive_purchase_order','verify_supplier_fulfillment','allocate_payment','adjust_return_receivable','refund_customer_credit','offset_customer_credit','reverse_customer_credit_offset','resolve_commission_reconciliation','create_delivery_expense','approve_expense')
 or target_entries is null or jsonb_typeof(target_entries) is distinct from 'array'
 or jsonb_array_length(target_entries)>200 or octet_length(target_entries::text)>65536
 then raise exception 'invalid_command_draft' using errcode='22023';end if;
 permission:=case target_command when 'post_payment' then 'finance.payment.post' when 'allocate_payment' then 'finance.payment.post' when 'adjust_return_receivable' then 'finance.ar.adjust' when 'refund_customer_credit' then 'finance.payment.post' when 'offset_customer_credit' then 'finance.payment.post' when 'reverse_customer_credit_offset' then 'finance.payment.reverse' when 'resolve_commission_reconciliation' then 'compensation.manage' when 'create_delivery_expense' then 'finance.expense.manage' when 'approve_expense' then 'finance.expense.manage' else 'inventory.receive' end;
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
