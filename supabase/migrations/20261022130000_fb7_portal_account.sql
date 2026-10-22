-- FB7 (Owner 22/10): "Tài khoản" on the customer portal — the customer's own details and where goods are delivered.
-- Customers cannot read public.customers (staff only); this reader returns their own record's contact fields only (no credit
-- limit, internal note or salesperson), and the payment terms only to those who may see debts.
begin;

create or replace function public.customer_portal_account(target_customer_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  selected_customer_id uuid;
  member_role text;
  customer public.customers%rowtype;
  sites jsonb;
begin
  select m.customer_id, m.membership_role into selected_customer_id, member_role
  from public.customer_portal_memberships m
  where m.auth_user_id = (select auth.uid()) and m.active
    and (target_customer_id is null or m.customer_id = target_customer_id)
  order by m.customer_id, case m.membership_role when 'OWNER' then 1 when 'FINANCE_CONTACT' then 2 else 3 end
  limit 1;
  if selected_customer_id is null then raise exception 'active_customer_membership_required' using errcode = '42501'; end if;
  select * into customer from public.customers c where c.id = selected_customer_id;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id, 'name', s.name, 'address_text', s.address_text,
      'receiver_name', s.receiver_name, 'receiver_phone', s.receiver_phone)) order by s.name, s.id), '[]'::jsonb)
    into sites from public.customer_sites s where s.customer_id = customer.id and s.active;
  return jsonb_build_object(
    'customer', jsonb_strip_nulls(jsonb_build_object('id', customer.id, 'code', customer.code, 'display_name', customer.display_name,
      'customer_type', customer.customer_type, 'phone', customer.phone, 'email', customer.email, 'address_text', customer.address_text,
      'tax_code', customer.tax_code,
      'payment_terms_days', case when member_role in ('OWNER', 'FINANCE_CONTACT') then customer.payment_terms_days end)),
    'membership_role', member_role,
    'sites', sites);
end
$function$;
revoke all on function public.customer_portal_account(uuid) from public, anon;
grant execute on function public.customer_portal_account(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
