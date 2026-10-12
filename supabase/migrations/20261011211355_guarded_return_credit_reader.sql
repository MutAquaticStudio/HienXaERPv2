-- Read the cumulative return limit only after checking the caller's branch AR permission.
-- Keep the internal unguarded calculator private to its authorized command owners.
begin;
create function private.return_credit_source_limit_read(target_case uuid) returns bigint
language plpgsql stable security definer set search_path='' as $reader$
declare branch uuid;
begin
 select r.branch_id into branch from public.return_cases r where r.id=target_case;
 if branch is null or auth.uid() is null or not private.has_permission(branch,'finance.ar.read') then
  raise exception 'return_credit_read_forbidden' using errcode='42501';
 end if;
 return private.return_credit_source_limit(target_case);
end $reader$;
revoke all on function private.return_credit_source_limit_read(uuid) from public,anon,authenticated,service_role;
grant execute on function private.return_credit_source_limit_read(uuid) to authenticated;
create or replace view public.customer_return_finance_read with(security_barrier=true) as
 select r.id,r.branch_id,o.customer_id,d.id delivery_id,d.delivery_number,o.order_number,
  r.base_quantity::text base_quantity,sl.material_name_snapshot,r.reason,
  private.return_credit_source_limit_read(r.id)::text maximum_credit_vnd,
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
