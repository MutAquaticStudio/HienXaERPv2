-- Portal members must not read internal customer columns through PostgREST.
alter policy customers_select on public.customers
  using ((select private.has_permission(branch_id, 'customers.read')));

-- Preserve the real customer name needed for portal quotation acceptance.
create or replace function public.customer_portal_display_name(target_customer_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.display_name
  from public.customer_portal_memberships m
  join public.customers c on c.id = m.customer_id
  where m.customer_id = target_customer_id
    and m.auth_user_id = (select auth.uid())
    and m.active
  limit 1
$$;

revoke all on function public.customer_portal_display_name(uuid) from public, anon, authenticated;
grant execute on function public.customer_portal_display_name(uuid) to authenticated;
