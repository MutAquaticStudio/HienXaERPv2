-- KiotViet-style "Đơn vị tính" (owner decision D7, 2026-10-16): add or stop a material's selling units and set the
-- general price of each unit in one all-or-nothing command. Stock stays one number in the base unit; a selling unit is
-- a material conversion "1 <unit> = numerator/denominator <base unit>", which order lines already snapshot.
-- Conversions still go through public.save_catalog_record and prices through public.save_pricing_rules_batch, so the
-- existing rules (permissions, immutable ratios, versioned prices, audit) apply unchanged. Nested operation IDs are
-- derived from this command's operation ID, so a repeated command replays instead of writing twice.
begin;

create or replace function public.save_material_units(
  target_branch_id uuid,
  target_material_id uuid,
  add_units jsonb,
  stop_conversion_ids jsonb,
  prices jsonb,
  effective_from timestamptz,
  change_reason text,
  operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  max_items constant integer := 20;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  material public.materials%rowtype;
  conversion public.material_uom_conversions%rowtype;
  item jsonb;
  item_no integer;
  unit_uom uuid;
  unit_type text;
  unit_numerator numeric;
  unit_denominator numeric;
  stop_id uuid;
  conversion_ids uuid[] := '{}';
  sellable uuid[];
  batch jsonb := '[]';
  batch_result jsonb;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  add_units := coalesce(add_units, '[]');
  stop_conversion_ids := coalesce(stop_conversion_ids, '[]');
  prices := coalesce(prices, '[]');
  if operation_id is null or target_material_id is null or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500
    or jsonb_typeof(add_units) <> 'array' or jsonb_typeof(stop_conversion_ids) <> 'array' or jsonb_typeof(prices) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if jsonb_array_length(add_units) + jsonb_array_length(stop_conversion_ids) + jsonb_array_length(prices) = 0 then
    raise exception 'nothing_to_save' using errcode = '22023';
  end if;
  if jsonb_array_length(add_units) > max_items or jsonb_array_length(stop_conversion_ids) > max_items or jsonb_array_length(prices) > max_items + 1 then
    raise exception 'too_many_units' using errcode = '22023';
  end if;
  if jsonb_array_length(add_units) + jsonb_array_length(stop_conversion_ids) > 0 and not private.has_permission(target_branch_id, 'catalog.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_array_length(prices) > 0 then
    if not private.has_permission(target_branch_id, 'pricing.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
    if effective_from is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;

  payload_hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'material', target_material_id,
    'add', add_units, 'stop', stop_conversion_ids, 'prices', prices, 'from', effective_from, 'reason', change_reason));
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_material_units.operation_id;
  if found then
    if receipt.command_name <> 'save_material_units' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('material_id', target_material_id, 'replayed', true);
  end if;

  -- One editor at a time per material: the unit set and its prices are checked against what is saved now.
  select * into material from public.materials m where m.id = target_material_id for update;
  if material.id is null then raise exception 'material_missing' using errcode = 'PT409'; end if;

  -- Stop first, so a unit can be replaced (stop the old ratio, add the new one) in the same command.
  for stop_id in select (value #>> '{}')::uuid from jsonb_array_elements(stop_conversion_ids) loop
    select * into conversion from public.material_uom_conversions c where c.id = stop_id for update;
    if conversion.id is null or conversion.material_id is distinct from target_material_id then
      raise exception 'invalid_unit' using errcode = '22023';
    end if;
    if conversion.active then
      perform public.save_catalog_record('conversions', stop_id, target_branch_id, jsonb_build_object('active', false),
        jsonb_build_object('active', true), change_reason, md5(operation_id::text || ':stop:' || stop_id)::uuid);
    end if;
  end loop;

  for item, item_no in select value, ordinality from jsonb_array_elements(add_units) with ordinality loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) key
        where key <> all(array['uom_id', 'numerator', 'denominator', 'conversion_type', 'source_note'])) then
      raise exception 'invalid_unit' using errcode = '22023';
    end if;
    unit_uom := (item->>'uom_id')::uuid;
    unit_type := coalesce(item->>'conversion_type', 'EXACT');
    unit_numerator := (item->>'numerator')::numeric;
    unit_denominator := coalesce((item->>'denominator')::numeric, 1);
    if unit_uom is null or unit_uom = material.base_uom_id or unit_type not in ('EXACT', 'PACKAGING', 'ESTIMATED', 'MEASURED') then
      raise exception 'invalid_unit' using errcode = '22023';
    end if;
    -- The column keeps 6 decimals; refuse a ratio that would be rounded silently.
    perform private.require_exact_quantity(unit_numerator, false);
    perform private.require_exact_quantity(unit_denominator, false);
    if unit_type in ('ESTIMATED', 'MEASURED') and char_length(trim(coalesce(item->>'source_note', ''))) not between 3 and 500 then
      raise exception 'unit_source_note_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.units_of_measure u where u.id = unit_uom and u.active) then
      raise exception 'unit_inactive' using errcode = '22023';
    end if;
    if exists (select 1 from public.material_uom_conversions c where c.material_id = target_material_id and c.from_uom_id = unit_uom
        and c.to_uom_id = material.base_uom_id and c.active and (c.effective_to is null or c.effective_to > now())) then
      raise exception 'unit_already_exists' using errcode = '23505';
    end if;
    conversion_ids := conversion_ids || public.save_catalog_record('conversions', md5(operation_id::text || ':unit:' || item_no)::uuid,
      target_branch_id, jsonb_build_object('material_id', target_material_id, 'from_uom_id', unit_uom, 'to_uom_id', material.base_uom_id,
        'numerator', unit_numerator, 'denominator', unit_denominator, 'conversion_type', unit_type, 'settlement_allowed', true,
        'rounding_scale', 6, 'rounding_mode', 'HALF_UP', 'source_note', nullif(trim(item->>'source_note'), ''), 'active', true),
      null, change_reason, md5(operation_id::text || ':unitop:' || item_no)::uuid);
  end loop;

  if jsonb_array_length(prices) > 0 then
    -- A price may only be set for the base unit or a unit this material can be sold in after the changes above.
    select array_agg(uom) into sellable from (
      select material.base_uom_id uom
      union select c.from_uom_id from public.material_uom_conversions c where c.material_id = target_material_id
        and c.to_uom_id = material.base_uom_id and c.active and c.settlement_allowed
        and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())) units;
    for item in select value from jsonb_array_elements(prices) loop
      if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) key
          where key <> all(array['price_uom_id', 'unit_price_vnd', 'supersedes_id', 'expected_version'])) then
        raise exception 'invalid_price_item' using errcode = '22023';
      end if;
      if (item->>'price_uom_id') is null or not (item->>'price_uom_id')::uuid = any(sellable) then
        raise exception 'price_unit_not_sellable' using errcode = '22023';
      end if;
      batch := batch || jsonb_build_array(item || jsonb_build_object('material_id', target_material_id));
    end loop;
    batch_result := public.save_pricing_rules_batch(target_branch_id, batch, effective_from, change_reason, md5(operation_id::text || ':prices')::uuid);
  end if;

  insert into public.command_receipts values (operation_id, auth.uid(), 'save_material_units', payload_hash, 'material_units', target_material_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), target_branch_id, 'catalog.save_units', 'materials', target_material_id, operation_id,
    array_remove(array[case when jsonb_array_length(add_units) + jsonb_array_length(stop_conversion_ids) > 0 then 'units' end,
      case when jsonb_array_length(prices) > 0 then 'prices' end], null), change_reason);
  return jsonb_build_object('material_id', target_material_id, 'conversion_ids', to_jsonb(conversion_ids),
    'price_rule_ids', coalesce(batch_result->'rule_ids', '[]'), 'replayed', false);
end
$function$;

revoke all on function public.save_material_units(uuid, uuid, jsonb, jsonb, jsonb, timestamptz, text, uuid) from public, anon;
grant execute on function public.save_material_units(uuid, uuid, jsonb, jsonb, jsonb, timestamptz, text, uuid) to authenticated;

commit;
