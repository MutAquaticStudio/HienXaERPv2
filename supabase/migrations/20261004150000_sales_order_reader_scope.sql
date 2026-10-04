-- Cache current-actor authorization scope once per statement, not per order.
-- Existing permission/membership functions remain the authoritative checks.
do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'sales_orders'
      and policyname = 'sales_orders_select' and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual = '(( SELECT private.has_permission(sales_orders.branch_id, ''orders.read''::text) AS has_permission) OR ( SELECT private.has_customer_membership(sales_orders.customer_id, NULL::text[]) AS has_customer_membership))'
  ) or pg_catalog.to_regprocedure('private.sales_order_reader_scope()') is not null then
    raise exception using errcode = '55000', message = 'sales_order_reader_scope_precondition_failed';
  end if;
end;
$migration$;

create function private.sales_order_reader_scope()
returns table (branch_ids uuid[], customer_ids uuid[])
language sql stable security definer
set search_path = ''
as $function$
  select
    array(
      select distinct a.branch_id
      from public.employee_branch_access a
      join public.employees e on e.id = a.employee_id
      where e.auth_user_id = (select auth.uid())
        and private.has_permission(a.branch_id, 'orders.read')
    ),
    array(
      select distinct m.customer_id
      from public.customer_portal_memberships m
      where m.auth_user_id = (select auth.uid())
        and private.has_customer_membership(m.customer_id, null::text[])
    );
$function$;

revoke all on function private.sales_order_reader_scope() from public, anon, service_role;
grant execute on function private.sales_order_reader_scope() to authenticated;

alter policy sales_orders_select on public.sales_orders
using (
  branch_id = any (((select scope.branch_ids from private.sales_order_reader_scope() scope))::uuid[])
  or customer_id = any (((select scope.customer_ids from private.sales_order_reader_scope() scope))::uuid[])
);
