-- P4 hardening: commercial workflow rows do not have the master-data
-- is_active/deactivated_at lifecycle fields. Keep their timestamp trigger
-- deliberately narrow so quotation/order state updates remain valid.

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function app_private.touch_updated_at() from public;

drop trigger if exists quotations_updated_at on public.quotations;
create trigger quotations_updated_at
before update on public.quotations
for each row execute function app_private.touch_updated_at();

drop trigger if exists sales_orders_updated_at on public.sales_orders;
create trigger sales_orders_updated_at
before update on public.sales_orders
for each row execute function app_private.touch_updated_at();

drop trigger if exists fulfillment_requirements_updated_at
on public.fulfillment_requirements;
create trigger fulfillment_requirements_updated_at
before update on public.fulfillment_requirements
for each row execute function app_private.touch_updated_at();
