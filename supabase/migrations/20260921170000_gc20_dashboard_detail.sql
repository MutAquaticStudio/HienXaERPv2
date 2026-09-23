create or replace function public.finance_dashboard_detail(
  target_branch_id uuid,
  from_inclusive timestamptz,
  to_exclusive timestamptz,
  knowledge_cutoff timestamptz,
  target_customer_id uuid default null,
  target_site_id uuid default null,
  target_sales_employee_id uuid default null,
  target_activity_kind text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  effective_to timestamptz := least(to_exclusive, now());
  effective_cutoff timestamptz := least(knowledge_cutoff, now());
  can_expense boolean;
  can_compensation boolean;
  expense_not_applicable boolean := false;
  expense_quality text;
  commission_quality text;
  expense_items jsonb := '[]'::jsonb;
  commission_items jsonb := '[]'::jsonb;
begin
  if not private.has_permission(target_branch_id, 'dashboard.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if from_inclusive >= to_exclusive then
    raise exception 'invalid_report_period' using errcode = '22023';
  end if;

  can_expense := private.has_permission(target_branch_id, 'finance.expense.read');
  can_compensation := private.has_permission(target_branch_id, 'compensation.read');

  if can_expense then
    expense_not_applicable :=
      (target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null)
      and (
        exists (
          select 1
          from public.expenses e
          where e.branch_id = target_branch_id
            and e.approval_state = 'APPROVED'
            and e.effective_at >= from_inclusive
            and e.effective_at < effective_to
            and e.approved_at <= effective_cutoff
            and (
              (target_customer_id is not null and e.customer_id is null)
              or (target_site_id is not null and e.site_id is null)
              or (target_sales_employee_id is not null and e.sales_employee_id is null)
            )
        )
        or exists (
          select 1
          from public.earning_events ee
          where ee.branch_id = target_branch_id
            and ee.approval_state = 'APPROVED'
            and ee.classification = 'OPEX'
            and ee.manual_basis_id is not null
            and ee.approved_at >= from_inclusive
            and ee.approved_at < effective_to
            and ee.approved_at <= effective_cutoff
        )
      );
  end if;

  expense_quality := case
    when not can_expense then 'FORBIDDEN'
    when expense_not_applicable then 'NOT_APPLICABLE'
    else 'READY'
  end;

  if expense_quality = 'READY' then
    with raw_expense as (
      select
        'EXPENSE'::text as source_kind,
        coalesce(ec.name, ec.code, 'Chi phi khac')::text as label,
        e.amount_vnd::bigint as amount_vnd
      from public.expenses e
      left join public.expense_categories ec on ec.id = e.category_id
      where e.branch_id = target_branch_id
        and e.approval_state = 'APPROVED'
        and e.effective_at >= from_inclusive
        and e.effective_at < effective_to
        and e.approved_at <= effective_cutoff
        and (target_customer_id is null or e.customer_id = target_customer_id)
        and (target_site_id is null or e.site_id = target_site_id)
        and (target_sales_employee_id is null or e.sales_employee_id = target_sales_employee_id)
        and (target_activity_kind is null or e.activity_kind = target_activity_kind)

      union all

      select
        'EARNING'::text as source_kind,
        case
          when ee.classification = 'SALES_COMMISSION' then 'Hoa hong ban hang'
          else 'Chi phi nhan su van hanh'
        end::text as label,
        ee.approved_amount_vnd::bigint as amount_vnd
      from public.earning_events ee
      left join public.sales_orders so on so.id = ee.sales_order_id
      left join public.service_verifications sv on sv.id = ee.service_verification_id
      left join public.service_jobs sj on sj.id = sv.service_job_id
      where ee.branch_id = target_branch_id
        and ee.approval_state = 'APPROVED'
        and ee.classification in ('OPEX', 'SALES_COMMISSION')
        and ee.approved_at >= from_inclusive
        and ee.approved_at < effective_to
        and ee.approved_at <= effective_cutoff
        and (target_customer_id is null or coalesce(so.customer_id, sj.customer_id) = target_customer_id)
        and (target_site_id is null or coalesce(so.site_id, sj.site_id) = target_site_id)
        and (target_sales_employee_id is null or ee.employee_id = target_sales_employee_id)
        and (
          target_activity_kind is null
          or (target_activity_kind = 'SALES' and ee.classification = 'SALES_COMMISSION')
          or (target_activity_kind = 'SERVICE' and ee.service_verification_id is not null)
          or (target_activity_kind in ('OPERATIONS', 'ADMIN') and ee.manual_basis_id is not null)
        )
    ), grouped_expense as (
      select source_kind, label, sum(amount_vnd)::bigint as amount_vnd
      from raw_expense
      group by source_kind, label
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'source_kind', source_kind,
          'label', label,
          'amount_vnd', amount_vnd
        )
        order by amount_vnd desc, label
      ),
      '[]'::jsonb
    )
    into expense_items
    from grouped_expense;
  end if;

  commission_quality := case
    when not can_compensation then 'FORBIDDEN'
    when target_activity_kind is not null and target_activity_kind <> 'SALES' then 'NOT_APPLICABLE'
    else 'READY'
  end;

  if commission_quality = 'READY' then
    with commission_balance as (
      select
        ee.employee_id,
        coalesce(emp.display_name, 'Nhan vien')::text as employee_name,
        ee.id as earning_event_id,
        (
          p.original_amount_vnd
          + coalesce((
            select sum(pa.amount_delta_vnd)
            from public.payable_adjustments pa
            where pa.obligation_id = p.id
              and pa.recorded_at <= effective_to
              and pa.recorded_at <= effective_cutoff
          ), 0)
          - coalesce((
            select sum(a.amount_delta_vnd)
            from public.payment_allocations a
            where a.payable_obligation_id = p.id
              and a.allocated_at <= effective_to
              and a.allocated_at <= effective_cutoff
          ), 0)
        )::bigint as outstanding_amount_vnd
      from public.payable_obligations p
      join public.earning_events ee on ee.id = p.earning_event_id
      left join public.employees emp on emp.id = ee.employee_id
      left join public.sales_orders so on so.id = ee.sales_order_id
      where p.branch_id = target_branch_id
        and ee.classification = 'SALES_COMMISSION'
        and p.recorded_at <= effective_to
        and p.recorded_at <= effective_cutoff
        and (target_customer_id is null or so.customer_id = target_customer_id)
        and (target_site_id is null or so.site_id = target_site_id)
        and (target_sales_employee_id is null or ee.employee_id = target_sales_employee_id)
    ), grouped_commission as (
      select
        employee_id,
        employee_name,
        count(distinct earning_event_id)::integer as event_count,
        sum(outstanding_amount_vnd)::bigint as outstanding_amount_vnd
      from commission_balance
      group by employee_id, employee_name
      having sum(outstanding_amount_vnd) <> 0
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'employee_id', employee_id,
          'employee_name', employee_name,
          'event_count', event_count,
          'outstanding_amount_vnd', outstanding_amount_vnd
        )
        order by outstanding_amount_vnd desc, employee_name
      ),
      '[]'::jsonb
    )
    into commission_items
    from grouped_commission;
  end if;

  return jsonb_build_object(
    'expense_breakdown', jsonb_build_object(
      'quality', expense_quality,
      'items', expense_items
    ),
    'commission_detail', jsonb_build_object(
      'quality', commission_quality,
      'items', commission_items
    )
  );
end;
$$;

revoke all on function public.finance_dashboard_detail(uuid, timestamptz, timestamptz, timestamptz, uuid, uuid, uuid, text) from public;
revoke all on function public.finance_dashboard_detail(uuid, timestamptz, timestamptz, timestamptz, uuid, uuid, uuid, text) from anon;
revoke all on function public.finance_dashboard_detail(uuid, timestamptz, timestamptz, timestamptz, uuid, uuid, uuid, text) from authenticated;
grant execute on function public.finance_dashboard_detail(uuid, timestamptz, timestamptz, timestamptz, uuid, uuid, uuid, text) to authenticated;
