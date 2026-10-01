-- The invoker view must not expose the unrestricted internal payable helper.
create or replace function private.earning_payable_outstanding(target_earning_id uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare earning public.earning_events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into earning from public.earning_events where id = target_earning_id;
  if not found or (
    private.has_permission(earning.branch_id, 'compensation.read')
    or (earning.employee_id = private.current_employee_id() and private.has_permission(earning.branch_id, 'work.claim'))
  ) is not true then
    raise exception 'earning_read_forbidden' using errcode = '42501';
  end if;
  return coalesce(private.current_payable_outstanding(earning.payable_obligation_id), 0);
end;
$$;
revoke all on function private.earning_payable_outstanding(uuid) from public, anon, authenticated;
grant execute on function private.earning_payable_outstanding(uuid) to authenticated;

create or replace view public.earning_event_read with (security_invoker=true) as
select ee.id,ee.branch_id,ee.employee_id,e.display_name employee_name,ee.rule_id,ee.rule_code_snapshot,ee.rule_version_snapshot,ee.earning_type,ee.classification,ee.source_key,ee.basis_quantity,ee.basis_amount_vnd,ee.rate_vnd_per_unit_snapshot,ee.rate_bps_snapshot,ee.calculated_amount_vnd,ee.approved_amount_vnd,ee.approval_state,ee.version,ee.created_at,ee.approved_at,ee.service_verification_id,ee.work_item_verification_id,ee.sales_order_id,ee.manual_basis_id,ee.payable_obligation_id,private.earning_payable_outstanding(ee.id) outstanding_amount_vnd
from public.earning_events ee join public.employees e on e.id=ee.employee_id;
