-- FB6 (Owner 18/10/2026): "Đặt hàng" on the customer portal looks like the internal sales order editor, with variants of one
-- product ("hàng cùng loại": Xi măng Bút Sơn PCB30 / PCB40) shown together and switchable on a line. Customers cannot read
-- material_variant_groups (employees only), so the catalog carries each material's group name and attribute label.
-- Same as 20261018200000 otherwise: own prices only, stock as a flag, no costs.
begin;

create or replace function public.customer_portal_catalog(target_customer_id uuid default null, search text default null, page_limit integer default 60)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  customer public.customers%rowtype;
  needle text := nullif(trim(coalesce(search, '')), '');
  wanted integer := greatest(1, least(coalesce(page_limit, 60), 200));
  unit record;
  rule public.pricing_rules%rowtype;
  rule_id uuid;
  stocked jsonb := '{}'::jsonb;
  items jsonb := '[]'::jsonb;
  found_count integer := 0;
  in_stock boolean;
begin
  select c.* into customer from public.customers c where c.id = private.portal_ordering_customer(target_customer_id);
  if customer.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  for unit in
    select m.id material_id, m.code, m.name, m.specification, g.name group_name, u.id uom_id, u.name uom_name, u.symbol uom_symbol,
      u.decimal_scale, bu.symbol base_symbol, conv.numerator, conv.denominator,
      vg.id variant_group_id, vg.name variant_name,
      (select string_agg(a.attribute || ': ' || (m.variant_attributes->>a.attribute), ' · ' order by a.position)
        from unnest(vg.attribute_names) with ordinality a(attribute, position) where m.variant_attributes ? a.attribute) variant_label
    from public.materials m
    join public.material_groups g on g.id = m.group_id
    left join public.material_variant_groups vg on vg.id = m.variant_group_id and vg.active
    join public.units_of_measure bu on bu.id = m.base_uom_id
    cross join lateral (
      select m.base_uom_id uom_id union
      select c.from_uom_id from public.material_uom_conversions c
      where c.material_id = m.id and c.to_uom_id = m.base_uom_id and c.active and c.settlement_allowed
        and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
    ) sale_unit
    join public.units_of_measure u on u.id = sale_unit.uom_id
    cross join lateral private.portal_sale_conversion(m.id, u.id) conv
    where m.active and m.sale_enabled and conv.numerator is not null
      and (needle is null or m.name ilike '%' || needle || '%' or m.code ilike '%' || needle || '%' or g.name ilike '%' || needle || '%'
        or vg.name ilike '%' || needle || '%')
    order by g.name, coalesce(vg.name, m.name), m.name, m.id, conv.numerator / conv.denominator desc
    limit wanted * 4
  loop
    exit when found_count >= wanted;
    begin
      rule_id := private.preferred_commercial_price_rule(customer.branch_id, customer.id, unit.material_id, unit.uom_id);
    exception when others then
      continue; -- no price for this customer in this unit: not offered on the portal.
    end;
    select * into rule from public.pricing_rules p where p.id = rule_id;
    if not stocked ? unit.material_id::text then
      stocked := stocked || jsonb_build_object(unit.material_id::text, exists (select 1 from public.warehouses w
        where w.branch_id = customer.branch_id and w.active and private.free_warehouse_stock(w.id, unit.material_id) > 0));
    end if;
    in_stock := (stocked->>unit.material_id::text)::boolean;
    found_count := found_count + 1;
    items := items || jsonb_build_object('material_id', unit.material_id, 'code', unit.code, 'name', unit.name, 'specification', unit.specification,
      'group_name', unit.group_name, 'uom_id', unit.uom_id, 'uom_name', unit.uom_name, 'uom_symbol', unit.uom_symbol, 'decimal_scale', unit.decimal_scale,
      'base_symbol', unit.base_symbol, 'conversion_numerator', unit.numerator::text, 'conversion_denominator', unit.denominator::text,
      'unit_price_vnd', rule.unit_price_vnd::text, 'in_stock', in_stock,
      'variant_group_id', unit.variant_group_id, 'variant_name', unit.variant_name, 'variant_label', unit.variant_label);
  end loop;
  return jsonb_build_object(
    'customer', jsonb_build_object('id', customer.id, 'code', customer.code, 'display_name', customer.display_name),
    'sites', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'address_text', s.address_text,
      'receiver_name', s.receiver_name, 'receiver_phone', s.receiver_phone) order by s.name, s.id)
      from public.customer_sites s where s.customer_id = customer.id and s.active), '[]'::jsonb),
    'items', items);
end
$function$;

revoke all on function public.customer_portal_catalog(uuid, text, integer) from public, anon;
grant execute on function public.customer_portal_catalog(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
