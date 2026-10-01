revoke select on table public.customers from public, anon, authenticated;
revoke select (credit_limit_vnd, internal_note) on table public.customers from public, anon, authenticated;

grant select (
  id,
  branch_id,
  code,
  display_name,
  active,
  created_at,
  customer_type,
  phone,
  email,
  address_text,
  tax_code,
  sales_owner_employee_id,
  tier_code,
  payment_terms_days
) on table public.customers to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on table public.customers to service_role';
  end if;
end
$$;

create or replace function public.customer_private_fields(target_customer_ids uuid[])
returns table(customer_id uuid, credit_limit_vnd bigint, internal_note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if cardinality(coalesce(target_customer_ids, '{}'::uuid[])) > 200 then
    raise exception 'too many customer ids' using errcode = '22023';
  end if;

  return query
  select
    c.id,
    case
      when private.has_permission(c.branch_id, 'finance.ar.read')
        or private.has_permission(c.branch_id, 'finance.ar.adjust')
      then c.credit_limit_vnd
      else null
    end,
    case
      when private.has_permission(c.branch_id, 'customers.manage') then c.internal_note
      else null
    end
  from public.customers c
  where c.id = any(coalesce(target_customer_ids, '{}'::uuid[]))
    and (
      private.has_permission(c.branch_id, 'customers.read')
      or private.has_permission(c.branch_id, 'customers.manage')
    );
end;
$$;

revoke all on function public.customer_private_fields(uuid[]) from public, anon, authenticated;
grant execute on function public.customer_private_fields(uuid[]) to authenticated;
