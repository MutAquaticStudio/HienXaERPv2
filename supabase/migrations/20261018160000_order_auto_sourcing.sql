-- FB4 D19 (Owner 17/10/2026): an order is sourced by the system, not by the user. On confirmation (and with "Tự phân nguồn"
-- for older orders) every line still without a source is planned for the whole order at once:
-- * a warehouse that can cover the line takes it (the warehouse covering most lines first, the branch default on a tie, so the
--   order goes out on as few trips as possible); free stock = on hand − held for deliveries − promised to other orders;
-- * nothing in stock → the cheapest current supplier price (same price: newest rule) on a draft supplier-direct purchase order;
-- * part in stock → stock + supplier for the rest, unless buying the whole line costs less than the extra trip (branch
--   "chi phí một chuyến"; empty = always use the stock first);
-- * no supplier price → stock as far as it goes, the rest is "Thiếu nguồn" and the purchasing team is told.
-- The plan is a pure function (private.solve_order_sourcing) so the customer-order approval can show it before applying.
-- auto_source_sales_order applies it with the existing commands: warehouse sources through private.allocate_warehouse_source,
-- supplier parts through create_direct_purchase_from_sales_order (needs purchasing.create of the same person — without it the
-- line waits for purchasing and they are notified). Each run is kept with its reasons for the order page.
-- Confirming a supplier-direct purchase order then makes its delivery (contact = the supplier) with
-- create_supplier_direct_delivery, and staff report it in one step with submit_supplier_delivery_done ("NCC đã giao").
begin;

create table public.sales_order_sourcing_runs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  operation_id uuid not null unique,
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  outcome jsonb not null check (jsonb_typeof(outcome) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index sales_order_sourcing_runs_order_idx on public.sales_order_sourcing_runs(sales_order_id, created_at desc);
alter table public.sales_order_sourcing_runs enable row level security;
revoke all on public.sales_order_sourcing_runs from anon, authenticated;
grant select on public.sales_order_sourcing_runs to authenticated;
create policy sales_order_sourcing_runs_select on public.sales_order_sourcing_runs for select to authenticated
  using ((select private.has_permission(branch_id, 'orders.read')));

-- Stock of a material in a warehouse nobody has claimed yet: on hand, minus what deliveries hold, minus warehouse sources of open
-- orders not yet put on a delivery.
create or replace function private.free_warehouse_stock(target_warehouse_id uuid, target_material_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(m.base_quantity_delta) from public.inventory_movements m
      where m.location_kind = 'WAREHOUSE' and m.warehouse_id = target_warehouse_id and m.material_id = target_material_id), 0)
    - coalesce((select sum(r.reserved_base_quantity) from public.inventory_reservations r
      where r.state = 'ACTIVE' and r.warehouse_id = target_warehouse_id and r.material_id = target_material_id), 0)
    - coalesce((select sum(greatest(a.allocated_base_quantity - private.delivery_allocation_consumed(a.id), 0))
      from public.supply_allocations a join public.sales_order_lines l on l.id = a.sales_order_line_id
      join public.sales_orders o on o.id = l.sales_order_id
      where a.supply_mode = 'WAREHOUSE' and a.warehouse_id = target_warehouse_id and l.material_id = target_material_id
        and o.commercial_state in ('DRAFT', 'CONFIRMED')), 0)
$$;
revoke all on function private.free_warehouse_stock(uuid, uuid) from public, anon, authenticated, service_role;

-- Every current supplier price that can buy exactly `base_quantity` of the material, cheapest first (same total: newest rule).
-- Only the newest version of a supplier's price for a unit counts, as on a purchase order.
create or replace function private.purchase_options(target_branch_id uuid, target_material_id uuid, base_quantity numeric)
returns table(supplier_id uuid, supplier_name text, supplier_phone text, purchase_uom_id uuid, uom_symbol text, quantity numeric,
  conversion_numerator numeric, conversion_denominator numeric, rounding_mode text, rule_id uuid, rule_version integer,
  unit_cost_vnd bigint, source_type text, total_cost_vnd bigint)
language sql stable security definer set search_path = '' as $$
  with current_rules as (
    select r.*, count(*) over (partition by r.supplier_id, r.purchase_uom_id, r.version) as same_version,
      rank() over (partition by r.supplier_id, r.purchase_uom_id order by r.version desc) as newest
    from public.purchase_price_rules r
    where r.branch_id = target_branch_id and r.material_id = target_material_id and r.active
      and r.effective_from <= now() and (r.effective_to is null or r.effective_to > now())
  ), priced as (
    select r.*, s.name as s_name, s.phone as s_phone, u.symbol as u_symbol, m.base_uom_id,
      case when r.purchase_uom_id = m.base_uom_id then 1::numeric else c.numerator end as num,
      case when r.purchase_uom_id = m.base_uom_id then 1::numeric else c.denominator end as den,
      case when r.purchase_uom_id = m.base_uom_id then 'HALF_UP' when c.rounding_mode in ('HALF_UP', 'DOWN') then c.rounding_mode else 'HALF_UP' end as rmode
    from current_rules r
    join public.suppliers s on s.id = r.supplier_id and s.active and s.branch_id = target_branch_id
    join public.materials m on m.id = r.material_id and m.active and m.purchase_enabled
    join public.units_of_measure u on u.id = r.purchase_uom_id
    left join lateral (select c.* from public.material_uom_conversions c
      where c.material_id = r.material_id and c.from_uom_id = r.purchase_uom_id and c.to_uom_id = m.base_uom_id
        and c.active and c.settlement_allowed and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
      order by c.effective_from desc, c.id limit 1) c on true
    where r.newest = 1 and r.same_version = 1 and r.unit_cost_vnd > 0
      and (r.purchase_uom_id = m.base_uom_id or c.id is not null)
  ), sized as (
    select p.*, base_quantity * p.den / p.num as q from priced p
  )
  select s.supplier_id, s.s_name, s.s_phone, s.purchase_uom_id, s.u_symbol, trim_scale(s.q), s.num, s.den, s.rmode, s.id, s.version,
    s.unit_cost_vnd, s.source_type, round(s.q * s.unit_cost_vnd)::bigint
  from sized s
  where base_quantity > 0 and s.q > 0 and s.q = round(s.q, 6)
  order by round(s.q * s.unit_cost_vnd), s.created_at desc, s.s_name, s.id
$$;
revoke all on function private.purchase_options(uuid, uuid, numeric) from public, anon, authenticated, service_role;

create or replace function private.sourcing_qty(value numeric) returns text
language sql immutable set search_path = '' as $$ select replace(trim_scale(value)::text, '.', ',') $$;
revoke all on function private.sourcing_qty(numeric) from public, anon, authenticated, service_role;
create or replace function private.sourcing_vnd(value bigint) returns text
language sql immutable set search_path = '' as $$ select replace(to_char(value, 'FM999,999,999,999,990'), ',', '.') $$;
revoke all on function private.sourcing_vnd(bigint) from public, anon, authenticated, service_role;

-- The plan for the lines of an order still without a source. Reads only; nothing is reserved or bought.
create or replace function private.solve_order_sourcing(target_sales_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  sale_order public.sales_orders%rowtype;
  settings public.branch_operation_settings;
  needs jsonb := '[]'::jsonb;
  item jsonb;
  line record;
  wh record;
  primary_wh uuid;
  used jsonb := '{}'::jsonb;
  wh_used uuid[] := '{}';
  sup_used uuid[] := '{}';
  result jsonb := '[]'::jsonb;
  pending jsonb := '[]'::jsonb;
  partial jsonb := '[]'::jsonb;
  free_qty numeric;
  best_free numeric;
  best_wh uuid;
  alt_wh uuid;
  split_cost bigint;
  whole_cost bigint;
  rest_option record;
  whole_option record;
  trip bigint;
  reason text;
  wh_name text;
begin
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id;
  if sale_order.id is null then raise exception 'sales_order_not_found' using errcode = '23503'; end if;
  settings := private.branch_settings(sale_order.branch_id);

  for line in
    select l.id, l.line_number, l.material_id, l.material_name_snapshot as name, u.symbol,
      l.quantity * l.conversion_numerator / l.conversion_denominator
        - coalesce((select sum(a.allocated_base_quantity) from public.supply_allocations a where a.sales_order_line_id = l.id), 0) as need
    from public.sales_order_lines l join public.units_of_measure u on u.id = l.base_uom_id
    where l.sales_order_id = target_sales_order_id order by l.line_number
  loop
    if line.need > 0 then
      needs := needs || jsonb_build_object('line_id', line.id, 'line_number', line.line_number, 'material_id', line.material_id,
        'material_name', line.name, 'symbol', line.symbol, 'need', line.need);
    end if;
  end loop;
  if jsonb_array_length(needs) = 0 then
    return jsonb_build_object('sales_order_id', sale_order.id, 'lines', '[]'::jsonb, 'trip_cost_vnd', settings.trip_cost_vnd);
  end if;

  -- The warehouse that covers most lines on its own (then the default warehouse, then the most stock, then the code).
  select w.id into primary_wh from public.warehouses w
  where w.branch_id = sale_order.branch_id and w.active
  order by (select count(*) from jsonb_array_elements(needs) n
      where private.free_warehouse_stock(w.id, (n->>'material_id')::uuid) >= (n->>'need')::numeric) desc,
    (w.id = settings.default_warehouse_id) desc,
    (select coalesce(sum(least(greatest(private.free_warehouse_stock(w.id, (n->>'material_id')::uuid), 0), (n->>'need')::numeric)), 0)
      from jsonb_array_elements(needs) n) desc,
    w.code, w.id
  limit 1;

  -- Pass 1: lines one warehouse covers (the primary first), and lines with no stock anywhere.
  for item in select value from jsonb_array_elements(needs) loop
    best_wh := null; best_free := 0; alt_wh := null;
    for wh in select w.id, w.name, w.code from public.warehouses w where w.branch_id = sale_order.branch_id and w.active
      order by (w.id = primary_wh) desc, (w.id = settings.default_warehouse_id) desc, w.code, w.id loop
      free_qty := private.free_warehouse_stock(wh.id, (item->>'material_id')::uuid) - coalesce((used->>(wh.id::text || ':' || (item->>'material_id')))::numeric, 0);
      if free_qty >= (item->>'need')::numeric and alt_wh is null then alt_wh := wh.id; end if;
      if free_qty > best_free then best_free := free_qty; best_wh := wh.id; end if;
    end loop;
    if alt_wh is not null then
      select w.name into wh_name from public.warehouses w where w.id = alt_wh;
      used := used || jsonb_build_object(alt_wh::text || ':' || (item->>'material_id'),
        coalesce((used->>(alt_wh::text || ':' || (item->>'material_id')))::numeric, 0) + (item->>'need')::numeric);
      if not alt_wh = any(wh_used) then wh_used := wh_used || alt_wh; end if;
      result := result || jsonb_build_object('line_id', item->'line_id', 'line_number', item->'line_number', 'material_name', item->'material_name',
        'symbol', item->'symbol', 'need', item->'need', 'choice', 'WAREHOUSE',
        'warehouse', jsonb_build_object('id', alt_wh, 'name', wh_name, 'quantity', item->'need'), 'supplier', null, 'short', 0,
        'reason', case when alt_wh = primary_wh then 'Kho ' || wh_name || ' đủ hàng.' else 'Kho chính thiếu; kho ' || wh_name || ' đủ hàng.' end);
    else
      pending := pending || (item || jsonb_build_object('best_wh', best_wh, 'best_free', greatest(best_free, 0)));
    end if;
  end loop;

  -- Pass 2: lines with no stock at all go to the cheapest supplier (or wait for a price). A line whose stock went to an
  -- earlier line of the same material in pass 1 is decided here too.
  for item in select value from jsonb_array_elements(pending) order by (value->>'best_free')::numeric loop
    best_wh := null; best_free := 0;
    for wh in select w.id from public.warehouses w where w.branch_id = sale_order.branch_id and w.active
      order by (w.id = primary_wh) desc, (w.id = settings.default_warehouse_id) desc, w.code, w.id loop
      free_qty := private.free_warehouse_stock(wh.id, (item->>'material_id')::uuid) - coalesce((used->>(wh.id::text || ':' || (item->>'material_id')))::numeric, 0);
      if free_qty > best_free then best_free := free_qty; best_wh := wh.id; end if;
    end loop;
    if best_free > 0 then
      partial := partial || (item || jsonb_build_object('best_wh', best_wh, 'best_free', best_free));
      continue;
    end if;
    select * into whole_option from private.purchase_options(sale_order.branch_id, (item->>'material_id')::uuid, (item->>'need')::numeric) limit 1;
    if whole_option.supplier_id is not null then
      if not whole_option.supplier_id = any(sup_used) then sup_used := sup_used || whole_option.supplier_id; end if;
      result := result || jsonb_build_object('line_id', item->'line_id', 'line_number', item->'line_number', 'material_name', item->'material_name',
        'symbol', item->'symbol', 'need', item->'need', 'choice', 'SUPPLIER', 'warehouse', null,
        'supplier', to_jsonb(whole_option) || jsonb_build_object('base_quantity', item->'need'), 'short', 0,
        'reason', 'Kho hết hàng; mua ' || whole_option.supplier_name || ' giá thấp nhất ('
          || private.sourcing_vnd(whole_option.unit_cost_vnd) || ' đ/' || whole_option.uom_symbol || ').');
    else
      result := result || jsonb_build_object('line_id', item->'line_id', 'line_number', item->'line_number', 'material_name', item->'material_name',
        'symbol', item->'symbol', 'need', item->'need', 'choice', 'SHORT', 'warehouse', null, 'supplier', null, 'short', item->'need',
        'reason', 'Thiếu nguồn ' || private.sourcing_qty((item->>'need')::numeric) || ' ' || (item->>'symbol') || ': kho hết hàng và chưa có NCC/giá mua.');
    end if;
  end loop;

  -- Pass 3: partly in stock — stock + supplier for the rest, or the whole line from the supplier when one more trip costs more.
  for item in select value from jsonb_array_elements(partial) loop
    best_wh := (item->>'best_wh')::uuid;
    best_free := least((item->>'best_free')::numeric, private.free_warehouse_stock(best_wh, (item->>'material_id')::uuid)
      - coalesce((used->>(best_wh::text || ':' || (item->>'material_id')))::numeric, 0));
    if best_free <= 0 then
      -- Its stock went to another line of the same material: buy the whole line, or it is short.
      select * into whole_option from private.purchase_options(sale_order.branch_id, (item->>'material_id')::uuid, (item->>'need')::numeric) limit 1;
      if whole_option.supplier_id is not null and not whole_option.supplier_id = any(sup_used) then sup_used := sup_used || whole_option.supplier_id; end if;
      result := result || jsonb_build_object('line_id', item->'line_id', 'line_number', item->'line_number', 'material_name', item->'material_name',
        'symbol', item->'symbol', 'need', item->'need', 'warehouse', null,
        'choice', case when whole_option.supplier_id is null then 'SHORT' else 'SUPPLIER' end,
        'supplier', case when whole_option.supplier_id is null then null else to_jsonb(whole_option) || jsonb_build_object('base_quantity', item->'need') end,
        'short', case when whole_option.supplier_id is null then (item->>'need')::numeric else 0 end,
        'reason', case when whole_option.supplier_id is null
          then 'Thiếu nguồn ' || private.sourcing_qty((item->>'need')::numeric) || ' ' || (item->>'symbol') || ': tồn kho đã dành cho dòng khác, chưa có NCC/giá mua.'
          else 'Tồn kho đã dành cho dòng khác; mua ' || whole_option.supplier_name || ' giá thấp nhất.' end);
      continue;
    end if;
    select w.name into wh_name from public.warehouses w where w.id = best_wh;
    select * into rest_option from private.purchase_options(sale_order.branch_id, (item->>'material_id')::uuid, (item->>'need')::numeric - best_free) limit 1;
    select * into whole_option from private.purchase_options(sale_order.branch_id, (item->>'material_id')::uuid, (item->>'need')::numeric) limit 1;
    trip := settings.trip_cost_vnd;
    if rest_option.supplier_id is null and whole_option.supplier_id is null then
      -- No price: what the stock can give, the rest is short.
      used := used || jsonb_build_object(best_wh::text || ':' || (item->>'material_id'), coalesce((used->>(best_wh::text || ':' || (item->>'material_id')))::numeric, 0) + best_free);
      if not best_wh = any(wh_used) then wh_used := wh_used || best_wh; end if;
      result := result || jsonb_build_object('line_id', item->'line_id', 'line_number', item->'line_number', 'material_name', item->'material_name',
        'symbol', item->'symbol', 'need', item->'need', 'choice', 'WAREHOUSE_SHORT',
        'warehouse', jsonb_build_object('id', best_wh, 'name', wh_name, 'quantity', best_free), 'supplier', null,
        'short', (item->>'need')::numeric - best_free,
        'reason', 'Kho ' || wh_name || ' có ' || private.sourcing_qty(best_free) || ' ' || (item->>'symbol') || '; thiếu '
          || private.sourcing_qty((item->>'need')::numeric - best_free) || ' ' || (item->>'symbol') || ' vì chưa có NCC/giá mua.');
      continue;
    end if;
    split_cost := case when rest_option.supplier_id is null then null else rest_option.total_cost_vnd
      + case when trip is not null and not best_wh = any(wh_used) then trip else 0 end
      + case when trip is not null and not rest_option.supplier_id = any(sup_used) then trip else 0 end end;
    whole_cost := case when whole_option.supplier_id is null then null else whole_option.total_cost_vnd
      + case when trip is not null and not whole_option.supplier_id = any(sup_used) then trip else 0 end end;
    if split_cost is not null and (trip is null or whole_cost is null or split_cost <= whole_cost) then
      used := used || jsonb_build_object(best_wh::text || ':' || (item->>'material_id'), coalesce((used->>(best_wh::text || ':' || (item->>'material_id')))::numeric, 0) + best_free);
      if not best_wh = any(wh_used) then wh_used := wh_used || best_wh; end if;
      if not rest_option.supplier_id = any(sup_used) then sup_used := sup_used || rest_option.supplier_id; end if;
      reason := 'Kho ' || wh_name || ' có ' || private.sourcing_qty(best_free) || ' ' || (item->>'symbol') || '; mua ' || rest_option.supplier_name
        || ' phần còn lại ' || private.sourcing_qty((item->>'need')::numeric - best_free) || ' ' || (item->>'symbol')
        || case when whole_cost is not null and whole_cost > split_cost then ' (rẻ hơn mua cả dòng ' || private.sourcing_vnd(whole_cost - split_cost) || ' đ).'
          else ' (dùng tồn kho trước).' end;
      result := result || jsonb_build_object('line_id', item->'line_id', 'line_number', item->'line_number', 'material_name', item->'material_name',
        'symbol', item->'symbol', 'need', item->'need', 'choice', 'SPLIT',
        'warehouse', jsonb_build_object('id', best_wh, 'name', wh_name, 'quantity', best_free),
        'supplier', to_jsonb(rest_option) || jsonb_build_object('base_quantity', (item->>'need')::numeric - best_free), 'short', 0, 'reason', reason);
    else
      if not whole_option.supplier_id = any(sup_used) then sup_used := sup_used || whole_option.supplier_id; end if;
      result := result || jsonb_build_object('line_id', item->'line_id', 'line_number', item->'line_number', 'material_name', item->'material_name',
        'symbol', item->'symbol', 'need', item->'need', 'choice', 'SUPPLIER', 'warehouse', null,
        'supplier', to_jsonb(whole_option) || jsonb_build_object('base_quantity', item->'need'), 'short', 0,
        'reason', 'Mua cả dòng từ ' || whole_option.supplier_name || case when split_cost is not null
          then ' (rẻ hơn lấy ' || private.sourcing_qty(best_free) || ' ' || (item->>'symbol') || ' ở kho ' || wh_name || ' vì thêm một chuyến '
            || private.sourcing_vnd(trip) || ' đ).' else ' (không mua được riêng phần còn thiếu).' end);
    end if;
  end loop;

  return jsonb_build_object('sales_order_id', sale_order.id, 'trip_cost_vnd', settings.trip_cost_vnd,
    'lines', coalesce((select jsonb_agg(value order by (value->>'line_number')::int) from jsonb_array_elements(result)), '[]'::jsonb));
end
$function$;
revoke all on function private.solve_order_sourcing(uuid) from public, anon, authenticated, service_role;

-- Read-only preview for the order page and the customer-order approval.
create or replace function public.order_sourcing_plan(target_sales_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare branch uuid;
begin
  select o.branch_id into branch from public.sales_orders o where o.id = target_sales_order_id;
  if branch is null or not (private.has_permission(branch, 'orders.confirm') or private.has_permission(branch, 'purchasing.create')
    or private.has_permission(branch, 'delivery.create')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.solve_order_sourcing(target_sales_order_id);
end
$function$;
revoke all on function public.order_sourcing_plan(uuid) from public, anon;
grant execute on function public.order_sourcing_plan(uuid) to authenticated;

-- What happens once an order has its sources (the auto-dispatch migration makes the warehouse deliveries here). Returns the
-- deliveries made.
create or replace function private.after_order_sourced(target_sales_order_id uuid, trace uuid) returns jsonb
language sql security definer set search_path = '' as $$ select '[]'::jsonb $$;
revoke all on function private.after_order_sourced(uuid, uuid) from public, anon, authenticated, service_role;

-- Applies the plan to a confirmed order.
create or replace function public.auto_source_sales_order(target_sales_order_id uuid, operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  sale_order public.sales_orders%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  plan jsonb;
  item jsonb;
  existing public.supply_allocations%rowtype;
  supplier uuid;
  purchase_lines jsonb;
  purchase_id uuid;
  purchase_number text;
  can_buy boolean;
  purchases jsonb := '[]'::jsonb;
  waiting jsonb := '[]'::jsonb;
  short_lines jsonb := '[]'::jsonb;
  warehouse_lines integer := 0;
  outcome jsonb;
  deliveries jsonb;
  expected timestamptz;
begin
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id;
  if sale_order.id is null or auth.uid() is null or not (private.has_permission(sale_order.branch_id, 'orders.confirm')
    or private.has_permission(sale_order.branch_id, 'purchasing.create') or private.has_permission(sale_order.branch_id, 'delivery.create')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if auto_source_sales_order.operation_id is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('order', target_sales_order_id));
  perform pg_advisory_xact_lock(hashtextextended('auto_source:' || target_sales_order_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = auto_source_sales_order.operation_id;
  if found then
    if receipt.command_name <> 'auto_source_sales_order' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return (select r.outcome || jsonb_build_object('replayed', true) from public.sales_order_sourcing_runs r where r.operation_id = auto_source_sales_order.operation_id);
  end if;
  select * into sale_order from public.sales_orders o where o.id = target_sales_order_id for update;
  if sale_order.commercial_state <> 'CONFIRMED' then raise exception 'sales_order_not_sourceable' using errcode = '23514'; end if;

  plan := private.solve_order_sourcing(target_sales_order_id);
  can_buy := private.has_permission(sale_order.branch_id, 'purchasing.create');
  expected := case when sale_order.requested_delivery_at > now() then sale_order.requested_delivery_at else null end;

  -- Warehouse parts (a source already taken in the same warehouse is topped up).
  for item in select value from jsonb_array_elements(plan->'lines') where jsonb_typeof(value->'warehouse') = 'object' loop
    select * into existing from public.supply_allocations a
    where a.sales_order_line_id = (item->>'line_id')::uuid and a.supply_mode = 'WAREHOUSE' and a.warehouse_id = (item->'warehouse'->>'id')::uuid
    order by a.created_at limit 1;
    if existing.id is null then
      perform private.allocate_warehouse_source((item->>'line_id')::uuid, (item->'warehouse'->>'id')::uuid, (item->'warehouse'->>'quantity')::numeric, null, null);
    else
      perform private.allocate_warehouse_source((item->>'line_id')::uuid, existing.warehouse_id,
        existing.allocated_base_quantity + (item->'warehouse'->>'quantity')::numeric, existing.id, existing.version);
    end if;
    warehouse_lines := warehouse_lines + 1;
  end loop;

  -- Supplier parts: one draft purchase order per supplier.
  for supplier in select distinct (value->'supplier'->>'supplier_id')::uuid from jsonb_array_elements(plan->'lines')
    where jsonb_typeof(value->'supplier') = 'object' loop
    select jsonb_agg(jsonb_build_object('linked_sales_order_line_id', value->>'line_id', 'material_id', l.material_id,
        'ordered_uom_id', value->'supplier'->>'purchase_uom_id', 'quantity', value->'supplier'->'quantity',
        'conversion_numerator', value->'supplier'->'conversion_numerator', 'conversion_denominator', value->'supplier'->'conversion_denominator',
        'rounding_mode', value->'supplier'->>'rounding_mode', 'unit_cost_vnd', value->'supplier'->'unit_cost_vnd',
        'purchase_price_rule_id', value->'supplier'->>'rule_id', 'purchase_price_rule_version', value->'supplier'->'rule_version',
        'price_source_type', value->'supplier'->>'source_type') order by (value->>'line_number')::int)
    into purchase_lines
    from jsonb_array_elements(plan->'lines') join public.sales_order_lines l on l.id = (value->>'line_id')::uuid
    where (value->'supplier'->>'supplier_id')::uuid = supplier;
    if can_buy then
      purchase_id := public.create_direct_purchase_from_sales_order(target_sales_order_id, supplier, purchase_lines, expected,
        md5(auto_source_sales_order.operation_id::text || ':purchase:' || supplier::text)::uuid);
      select p.purchase_order_number into purchase_number from public.purchase_orders p where p.id = purchase_id;
      purchases := purchases || jsonb_build_object('purchase_order_id', purchase_id, 'number', purchase_number, 'supplier_id', supplier);
      perform private.notify(sale_order.branch_id, 'purchase.draft_ready', 'purchase_order', purchase_id,
        'Đơn mua nháp ' || purchase_number || ' cần duyệt', 'Giao thẳng cho ' || sale_order.order_number || ' · ' || sale_order.customer_name_snapshot,
        '/admin/purchase-orders/' || purchase_id, 'purchasing.confirm', null, 'purchase.draft_ready:' || purchase_id);
    else
      waiting := waiting || jsonb_build_object('supplier_id', supplier, 'lines', purchase_lines);
    end if;
  end loop;
  if jsonb_array_length(waiting) > 0 then
    perform private.notify(sale_order.branch_id, 'sales_order.needs_purchase', 'sales_order', sale_order.id,
      sale_order.order_number || ' cần đặt NCC giao thẳng', 'Người xác nhận đơn không có quyền tạo đơn mua; bấm "Tự phân nguồn" trên đơn để tạo.',
      '/admin/orders/' || sale_order.id, 'purchasing.create', null, 'sales_order.needs_purchase:' || auto_source_sales_order.operation_id);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('material_name', value->'material_name', 'short', value->'short', 'symbol', value->'symbol')), '[]'::jsonb)
  into short_lines from jsonb_array_elements(plan->'lines') where (value->>'short')::numeric > 0;
  if jsonb_array_length(short_lines) > 0 then
    perform private.notify(sale_order.branch_id, 'sales_order.short_source', 'sales_order', sale_order.id,
      sale_order.order_number || ' thiếu nguồn hàng',
      (select string_agg((value->>'material_name') || ' ' || private.sourcing_qty((value->>'short')::numeric) || ' ' || (value->>'symbol'), '; ')
        from jsonb_array_elements(short_lines)) || ' — chưa có NCC/giá mua.',
      '/admin/orders/' || sale_order.id, 'purchasing.create', null, 'sales_order.short_source:' || auto_source_sales_order.operation_id);
  end if;

  deliveries := private.after_order_sourced(target_sales_order_id, auto_source_sales_order.operation_id);
  outcome := jsonb_build_object('warehouse_lines', warehouse_lines, 'purchase_orders', purchases,
    'waiting_purchase', jsonb_array_length(waiting) > 0, 'short_lines', short_lines, 'deliveries', deliveries);
  insert into public.sales_order_sourcing_runs(branch_id, sales_order_id, operation_id, plan, outcome, created_by)
  values (sale_order.branch_id, sale_order.id, auto_source_sales_order.operation_id, plan, outcome, (select auth.uid()));
  insert into public.command_receipts values (auto_source_sales_order.operation_id, auth.uid(), 'auto_source_sales_order', hash, 'sales_order', sale_order.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), sale_order.branch_id, 'sales_order.auto_sourced', 'sales_order', sale_order.id, auto_source_sales_order.operation_id,
    array['supply_allocations'], left(coalesce((select string_agg('Dòng ' || (value->>'line_number') || ': ' || (value->>'reason'), ' ')
      from jsonb_array_elements(plan->'lines')), 'Mọi dòng đã có nguồn.'), 500));
  return outcome;
end
$function$;
revoke all on function public.auto_source_sales_order(uuid, uuid) from public, anon;
grant execute on function public.auto_source_sales_order(uuid, uuid) to authenticated;

-- A confirmed supplier-direct purchase order gets its delivery: what its lines still have to bring, contact = the supplier,
-- on the expected date (or now).
create or replace function public.create_supplier_direct_delivery(target_purchase_order_id uuid, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  purchase public.purchase_orders%rowtype;
  supplier public.suppliers%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  lines jsonb;
  delivery uuid;
  at_time timestamptz;
begin
  select * into purchase from public.purchase_orders p where p.id = target_purchase_order_id;
  if purchase.id is null or auth.uid() is null or not private.has_permission(purchase.branch_id, 'delivery.create')
    or not private.has_permission(purchase.branch_id, 'delivery.assign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if create_supplier_direct_delivery.operation_id is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order', target_purchase_order_id));
  perform pg_advisory_xact_lock(hashtextextended('supplier_delivery:' || target_purchase_order_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = create_supplier_direct_delivery.operation_id;
  if found then
    if receipt.command_name <> 'create_supplier_direct_delivery' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if purchase.state <> 'CONFIRMED' or purchase.destination_type <> 'CUSTOMER_SITE' or purchase.source_sales_order_id is null then
    raise exception 'purchase_order_not_direct' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('supply_allocation_id', a.id,
      'planned_base_quantity', a.allocated_base_quantity - private.delivery_allocation_consumed(a.id)) order by pl.line_number), '[]'::jsonb)
  into lines
  from public.supply_allocations a join public.purchase_order_lines pl on pl.id = a.purchase_order_line_id
  where pl.purchase_order_id = purchase.id and a.supply_mode = 'SUPPLIER_DIRECT'
    and a.allocated_base_quantity - private.delivery_allocation_consumed(a.id) > 0;
  if jsonb_array_length(lines) = 0 then raise exception 'nothing_to_deliver' using errcode = '23514'; end if;
  select * into supplier from public.suppliers s where s.id = purchase.supplier_id;
  at_time := greatest(coalesce(purchase.expected_at, now()), now());
  delivery := public.create_delivery_from_allocations(purchase.source_sales_order_id, lines, at_time,
    md5(create_supplier_direct_delivery.operation_id::text || ':delivery')::uuid);
  perform public.assign_delivery(delivery, null, null, left(coalesce(purchase.supplier_name_snapshot, supplier.name), 120), supplier.phone,
    (select d.version from public.deliveries d where d.id = delivery), md5(create_supplier_direct_delivery.operation_id::text || ':assign')::uuid);
  insert into public.command_receipts values (create_supplier_direct_delivery.operation_id, auth.uid(), 'create_supplier_direct_delivery', hash, 'delivery', delivery, now());
  return delivery;
end
$function$;
revoke all on function public.create_supplier_direct_delivery(uuid, uuid) from public, anon;
grant execute on function public.create_supplier_direct_delivery(uuid, uuid) to authenticated;

-- "NCC đã giao": staff report a supplier-direct delivery in one step. Not started → the supplier took it on the way (loaded =
-- planned); on the way → arrived; then the result (null lines = all delivered). A delivered quantity needs a photo, nothing
-- delivered needs a reason.
create or replace function public.submit_supplier_delivery_done(target_delivery_id uuid, result_lines jsonb, receiver_name text, note text,
  target_evidence_id uuid, expected_version integer, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  delivery public.deliveries%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  lines jsonb;
  kind text;
  result_id uuid;
  version_now integer;
begin
  select * into delivery from public.deliveries d where d.id = target_delivery_id;
  if delivery.id is null or auth.uid() is null or not private.has_permission(delivery.branch_id, 'delivery.submit') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if submit_supplier_delivery_done.operation_id is null or (result_lines is not null and jsonb_typeof(result_lines) <> 'array') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('delivery', target_delivery_id, 'lines', result_lines, 'receiver', nullif(trim(receiver_name), ''),
    'note', nullif(trim(note), ''), 'evidence', target_evidence_id, 'version', expected_version));
  perform pg_advisory_xact_lock(hashtextextended(submit_supplier_delivery_done.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = submit_supplier_delivery_done.operation_id;
  if found then
    if receipt.command_name <> 'submit_supplier_delivery_done' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into delivery from public.deliveries d where d.id = target_delivery_id for update;
  if delivery.version is distinct from expected_version or delivery.execution_state not in ('ASSIGNED', 'DISPATCHED', 'ARRIVED') then
    raise exception 'delivery_result_version_conflict' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.delivery_lines l where l.delivery_id = delivery.id and l.source_mode <> 'SUPPLIER_DIRECT')
    or not exists (select 1 from public.delivery_lines l where l.delivery_id = delivery.id) then
    raise exception 'delivery_not_supplier_direct' using errcode = '23514';
  end if;
  version_now := delivery.version;
  if delivery.execution_state = 'ASSIGNED' then
    perform public.handoff_delivery_actual(delivery.id, version_now, now(), md5(submit_supplier_delivery_done.operation_id::text || ':handoff')::uuid,
      (select jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'loaded_base_quantity', l.planned_base_quantity)) from public.delivery_lines l where l.delivery_id = delivery.id));
    select d.version into version_now from public.deliveries d where d.id = delivery.id;
  end if;
  if (select d.execution_state from public.deliveries d where d.id = delivery.id) = 'DISPATCHED' then
    perform public.mark_delivery_arrived(delivery.id, version_now, md5(submit_supplier_delivery_done.operation_id::text || ':arrived')::uuid);
    select d.version into version_now from public.deliveries d where d.id = delivery.id;
  end if;
  if result_lines is null then
    select jsonb_agg(jsonb_build_object('delivery_line_id', l.id, 'actual_base_quantity', coalesce(private.delivery_loaded_quantity(l.id), l.planned_base_quantity)))
    into lines from public.delivery_lines l where l.delivery_id = delivery.id;
  else
    lines := result_lines;
  end if;
  select case when bool_and((i->>'actual_base_quantity')::numeric = 0) then 'FAILED'
    when bool_and((i->>'actual_base_quantity')::numeric >= l.planned_base_quantity) then 'FULL' else 'PARTIAL' end
  into kind from jsonb_array_elements(lines) i join public.delivery_lines l on l.id = (i->>'delivery_line_id')::uuid and l.delivery_id = delivery.id;
  if kind is null then raise exception 'invalid_delivery_result' using errcode = '22023'; end if;
  if kind <> 'FAILED' and target_evidence_id is null then raise exception 'delivery_photo_required' using errcode = '22023'; end if;
  if kind = 'FAILED' and char_length(trim(coalesce(note, ''))) < 3 then raise exception 'delivery_failure_reason_required' using errcode = '22023'; end if;
  result_id := public.submit_delivery_result(delivery.id, kind, lines, coalesce(nullif(trim(receiver_name), ''), delivery.receiver_name_snapshot), note, null,
    target_evidence_id, version_now, md5(submit_supplier_delivery_done.operation_id::text || ':result')::uuid);
  insert into public.command_receipts values (submit_supplier_delivery_done.operation_id, auth.uid(), 'submit_supplier_delivery_done', hash, 'delivery_result', result_id, now());
  return result_id;
end
$function$;
revoke all on function public.submit_supplier_delivery_done(uuid, jsonb, text, text, uuid, integer, uuid) from public, anon;
grant execute on function public.submit_supplier_delivery_done(uuid, jsonb, text, text, uuid, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
