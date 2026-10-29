-- FB16 (D38): every sales order belongs to one seller ("NV bán hàng", sales_orders.sales_owner_employee_id), which the
-- sales commission of the payroll counts. A salesperson's own order is theirs (create_sales_order_draft already records
-- the person creating it); only the owner of the business (roles.manage) names another seller, when creating an order for
-- someone or later, so a salesperson can never move an order to themselves. A change is audited, and refused once the
-- order's revenue is in a closed payroll (the commission there is already paid).
begin;

-- Who can be named seller, and the names to show on the order list (people who sell, or already hold orders).
create or replace function public.sales_seller_options(target_branch_id uuid)
returns table(id uuid, name text, assignable boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'orders.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with candidates as (
    select e.id, e.display_name, e.active,
      exists(select 1 from public.employee_branch_access a
        where a.employee_id = e.id and a.branch_id = target_branch_id and a.active) as branch_active,
      exists(select 1 from public.employee_branch_access a join public.roles r on r.id = a.role_id and r.active
          join public.role_permissions rp on rp.role_id = r.id and rp.permission_code = 'orders.create'
          where a.employee_id = e.id and a.branch_id = target_branch_id and a.active)
        or exists(select 1 from public.employee_permission_grants g
          where g.employee_id = e.id and g.branch_id = target_branch_id and g.permission_code = 'orders.create') as sells,
      exists(select 1 from public.sales_orders o where o.branch_id = target_branch_id and o.sales_owner_employee_id = e.id) as holds
    from public.employees e
  )
  select c.id, c.display_name || case when c.active and c.branch_active and c.sells then '' else ' (ngừng)' end,
    c.active and c.branch_active and c.sells
  from candidates c
  where (c.active and c.branch_active and c.sells) or c.holds
  order by c.display_name, c.id limit 500;
end $$;

create or replace function public.set_sales_order_seller(target_order_id uuid, target_employee_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sale_order public.sales_orders%rowtype;
  hash text := private.command_payload_hash(jsonb_build_object('order', target_order_id, 'seller', target_employee_id));
  receipt public.command_receipts%rowtype;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into receipt from public.command_receipts r where r.operation_id = set_sales_order_seller.operation_id;
  if receipt.operation_id is not null then
    if receipt.actor_auth_user_id <> auth.uid() or receipt.command_name <> 'set_sales_order_seller' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '22023';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into sale_order from public.sales_orders o where o.id = target_order_id for update;
  if sale_order.id is null or not private.has_permission(sale_order.branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
      select 1 from public.employees e join public.employee_branch_access a on a.employee_id = e.id and a.branch_id = sale_order.branch_id and a.active
      where e.id = target_employee_id and e.active
        and (exists(select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id and r.active
               where rp.role_id = a.role_id and rp.permission_code = 'orders.create')
          or exists(select 1 from public.employee_permission_grants g
               where g.employee_id = e.id and g.branch_id = sale_order.branch_id and g.permission_code = 'orders.create'))) then
    raise exception 'sales_seller_not_assignable' using errcode = '22023';
  end if;
  if sale_order.sales_owner_employee_id is distinct from target_employee_id then
    if exists (select 1 from public.revenue_entries re join public.payroll_periods p on p.branch_id = re.branch_id and p.state = 'CLOSED'
        and (re.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date between p.period_start and p.period_end
        where re.sales_order_id = sale_order.id) then
      raise exception 'sales_seller_locked_by_payroll' using errcode = '55000';
    end if;
    update public.sales_orders set sales_owner_employee_id = target_employee_id where id = sale_order.id;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), sale_order.branch_id, 'sales_order.seller_changed', 'sales_order', sale_order.id, set_sales_order_seller.operation_id,
      array['sales_owner_employee_id'], left(format('Người bán: %s → %s',
        coalesce((select e.display_name from public.employees e where e.id = sale_order.sales_owner_employee_id), 'chưa có'),
        (select e.display_name from public.employees e where e.id = target_employee_id)), 500));
  end if;
  insert into public.command_receipts values (set_sales_order_seller.operation_id, auth.uid(), 'set_sales_order_seller', hash, 'sales_order', sale_order.id, now());
  return sale_order.id;
end $$;

revoke all on function public.sales_seller_options(uuid), public.set_sales_order_seller(uuid, uuid, uuid) from public, anon;
grant execute on function public.sales_seller_options(uuid), public.set_sales_order_seller(uuid, uuid, uuid) to authenticated;

commit;
