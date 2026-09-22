create table public.inventory_stock_thresholds (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  threshold_base_quantity numeric(20, 6) not null check (threshold_base_quantity >= 0),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (branch_id, warehouse_id, material_id)
);

alter table public.inventory_stock_thresholds enable row level security;

create policy inventory_stock_thresholds_select
on public.inventory_stock_thresholds
for select to authenticated
using (private.has_permission(branch_id, 'inventory.read'));

create or replace function public.set_inventory_stock_threshold(
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_material_id uuid,
  target_threshold_base_quantity numeric,
  target_active boolean
)
returns table (threshold_id uuid, threshold_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.inventory_stock_thresholds;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'inventory.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_threshold_base_quantity is null or target_threshold_base_quantity < 0 then
    raise exception 'invalid_threshold' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.warehouses w
    where w.id = target_warehouse_id
      and w.branch_id = target_branch_id
      and w.active
  ) then
    raise exception 'warehouse_not_available' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.materials m
    where m.id = target_material_id
      and m.active
  ) then
    raise exception 'material_not_available' using errcode = '22023';
  end if;

  insert into public.inventory_stock_thresholds (
    branch_id,
    warehouse_id,
    material_id,
    threshold_base_quantity,
    active,
    created_by,
    updated_by
  )
  values (
    target_branch_id,
    target_warehouse_id,
    target_material_id,
    target_threshold_base_quantity,
    target_active,
    auth.uid(),
    auth.uid()
  )
  on conflict (branch_id, warehouse_id, material_id)
  do update set
    threshold_base_quantity = excluded.threshold_base_quantity,
    active = excluded.active,
    version = public.inventory_stock_thresholds.version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into saved;

  return query select saved.id, saved.version;
end;
$$;

create or replace view public.low_stock_alert_read
with (security_invoker = true)
as
select
  t.id as threshold_id,
  t.branch_id,
  t.warehouse_id,
  w.name as warehouse_name,
  t.material_id,
  m.name as material_name,
  m.base_uom_id,
  u.symbol as base_uom_symbol,
  t.threshold_base_quantity,
  coalesce(i.on_hand_base_quantity::numeric, 0::numeric) as on_hand_base_quantity,
  coalesce(i.reserved_base_quantity::numeric, 0::numeric) as reserved_base_quantity,
  coalesce(i.available_base_quantity::numeric, 0::numeric) as available_base_quantity,
  t.version,
  t.updated_at
from public.inventory_stock_thresholds t
join public.warehouses w on w.id = t.warehouse_id and w.branch_id = t.branch_id
join public.materials m on m.id = t.material_id
join public.units_of_measure u on u.id = m.base_uom_id
left join public.warehouse_inventory_read i
  on i.branch_id = t.branch_id
 and i.warehouse_id = t.warehouse_id
 and i.material_id = t.material_id
where t.active
  and coalesce(i.available_base_quantity::numeric, 0::numeric) < t.threshold_base_quantity;

revoke all on table public.inventory_stock_thresholds from public, anon, authenticated;
grant select on table public.inventory_stock_thresholds to authenticated;

revoke all on table public.low_stock_alert_read from public, anon, authenticated;
grant select on table public.low_stock_alert_read to authenticated;

revoke all on function public.set_inventory_stock_threshold(uuid, uuid, uuid, numeric, boolean) from public, anon, authenticated;
grant execute on function public.set_inventory_stock_threshold(uuid, uuid, uuid, numeric, boolean) to authenticated;
