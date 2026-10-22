-- FB8 (Owner 23/10): the credit exception of a sales order names people, not login ids. Who approved it (name, code and
-- role in the order's branch), and, while it waits, who may approve it (staff of the branch holding both orders.confirm and
-- finance.ar.adjust, by role or by an extra grant). Staff who may read the order may read these names; nothing else about
-- the employees is returned.
begin;

create or replace function public.sales_order_credit_people(target_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  order_row public.sales_orders%rowtype; approved jsonb; approvers jsonb;
begin
  select * into order_row from public.sales_orders o where o.id = target_order_id;
  if order_row.id is null or not private.has_permission(order_row.branch_id, 'orders.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_strip_nulls(jsonb_build_object('name', e.display_name, 'code', e.code, 'at', co.created_at,
      'roles', (select string_agg(distinct r.name, ', ') from public.employee_branch_access a join public.roles r on r.id = a.role_id
        where a.employee_id = e.id and a.branch_id = order_row.branch_id and a.active)))
    into approved
  from public.sales_order_credit_overrides co
  left join public.employees e on e.auth_user_id = co.actor_auth_user_id
  where co.sales_order_id = order_row.id;

  with holders as (
    select e.id, e.display_name,
      (select string_agg(distinct r.name, ', ') from public.employee_branch_access a join public.roles r on r.id = a.role_id and r.active
        where a.employee_id = e.id and a.branch_id = order_row.branch_id and a.active) as roles
    from public.employees e
    where e.active
      and exists (select 1 from public.employee_branch_access a where a.employee_id = e.id and a.branch_id = order_row.branch_id and a.active)
      and not exists (select 1 from unnest(array['orders.confirm', 'finance.ar.adjust']) needed
        where not exists (select 1 from public.employee_branch_access a join public.roles r on r.id = a.role_id and r.active
            join public.role_permissions rp on rp.role_id = r.id and rp.permission_code = needed
            where a.employee_id = e.id and a.branch_id = order_row.branch_id and a.active)
          and not exists (select 1 from public.employee_permission_grants g
            where g.employee_id = e.id and g.branch_id = order_row.branch_id and g.permission_code = needed))
  )
  select coalesce(jsonb_agg(jsonb_build_object('name', h.display_name, 'roles', h.roles) order by h.display_name), '[]'::jsonb)
    into approvers from (select * from holders order by display_name limit 10) h;

  return jsonb_build_object('approved', approved, 'approvers', approvers);
end
$function$;
revoke all on function public.sales_order_credit_people(uuid) from public, anon;
grant execute on function public.sales_order_credit_people(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
