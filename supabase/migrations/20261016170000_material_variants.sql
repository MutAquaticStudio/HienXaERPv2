-- Material variants (owner decision D11, 2026-10-16): "hàng cùng loại" such as Xi măng Bút Sơn PCB30 / PCB40 or
-- Thép Hòa Phát phi 6 / 8 / 10. Every variant stays a full material (own code, stock, units and prices), so stock,
-- pricing, sales, purchasing and delivery are unchanged; the group only names the shared product and its attributes.
-- One command creates or edits a group, creates new variants from a template (base unit, material group, selling
-- units and optional prices) and attaches, re-labels or detaches existing materials. Materials are still created
-- through public.save_catalog_record and units/prices through public.save_material_units, with nested operation IDs
-- derived from this command's operation ID.
begin;

create table public.material_variant_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  attribute_names text[] not null check (cardinality(attribute_names) between 1 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.material_variant_groups enable row level security;
create policy material_variant_groups_select on public.material_variant_groups for select to authenticated
  using ((select private.current_employee_id()) is not null);
grant select on public.material_variant_groups to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.material_variant_groups from authenticated;
revoke all on public.material_variant_groups from anon;

alter table public.materials
  add column variant_group_id uuid references public.material_variant_groups(id) on delete restrict,
  add column variant_attributes jsonb,
  add constraint materials_variant_pair check ((variant_group_id is null) = (variant_attributes is null)),
  add constraint materials_variant_attributes_object check (variant_attributes is null or jsonb_typeof(variant_attributes) = 'object');
create unique index materials_variant_unique on public.materials(variant_group_id, variant_attributes) where variant_group_id is not null;

-- Attribute values are trimmed text of 1..40 characters, keyed exactly by the group's attribute names.
create function private.variant_attributes_valid(attributes jsonb, names text[]) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(attributes) = 'object'
    and (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(attributes) k)
      = (select coalesce(array_agg(n order by n), '{}') from unnest(names) n)
    and not exists (select 1 from jsonb_each(attributes) e
      where jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') not between 1 and 40
        or e.value #>> '{}' <> btrim(e.value #>> '{}'))
$$;
revoke all on function private.variant_attributes_valid(jsonb, text[]) from public, anon, authenticated, service_role;

create function private.trimmed_attributes(attributes jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(btrim(e.key), case when jsonb_typeof(e.value) = 'string' then to_jsonb(btrim(e.value #>> '{}')) else e.value end), '{}')
  from jsonb_each(attributes) e
$$;
revoke all on function private.trimmed_attributes(jsonb) from public, anon, authenticated, service_role;

create or replace function public.save_material_variant_group(
  target_branch_id uuid,
  target_group_id uuid,
  group_values jsonb,
  expected_group jsonb,
  template jsonb,
  variants jsonb,
  effective_from timestamptz,
  change_reason text,
  operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  max_variants constant integer := 60;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  existing public.material_variant_groups%rowtype;
  material public.materials%rowtype;
  group_name text;
  group_attributes text[];
  group_active boolean;
  item jsonb;
  item_no integer;
  item_attributes jsonb;
  item_material uuid;
  item_prices jsonb;
  template_units jsonb;
  new_ids uuid[] := '{}';
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'catalog.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  variants := coalesce(variants, '[]');
  if operation_id is null or target_group_id is null or jsonb_typeof(group_values) is distinct from 'object'
    or jsonb_typeof(variants) <> 'array' or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500
    or (expected_group is not null and jsonb_typeof(expected_group) <> 'object')
    or (template is not null and jsonb_typeof(template) <> 'object') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if jsonb_array_length(variants) > max_variants then raise exception 'too_many_variants' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(group_values) key where key <> all(array['name', 'attribute_names', 'active'])) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(variants) v where jsonb_typeof(v->'prices') = 'array' and jsonb_array_length(v->'prices') > 0)
    and not private.has_permission(target_branch_id, 'pricing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  payload_hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'group', target_group_id,
    'values', group_values, 'expected', expected_group, 'template', template, 'variants', variants, 'from', effective_from,
    'reason', change_reason));
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_material_variant_group.operation_id;
  if found then
    if receipt.command_name <> 'save_material_variant_group' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    select coalesce(array_agg(md5(operation_id::text || ':material:' || n)::uuid order by n), '{}') into new_ids
      from jsonb_array_elements(variants) with ordinality v(value, n) where not v.value ? 'material_id';
    return jsonb_build_object('group_id', target_group_id, 'material_ids', to_jsonb(new_ids), 'replayed', true);
  end if;

  -- The group: created once, then renamed / stopped against the version the editor read.
  select * into existing from public.material_variant_groups g where g.id = target_group_id for update;
  group_name := btrim(coalesce(group_values->>'name', existing.name));
  group_active := coalesce((group_values->>'active')::boolean, existing.active, true);
  if group_values ? 'attribute_names' then
    if jsonb_typeof(group_values->'attribute_names') <> 'array' then raise exception 'invalid_variant_attributes' using errcode = '22023'; end if;
    select array_agg(btrim(value) order by n) into group_attributes from jsonb_array_elements_text(group_values->'attribute_names') with ordinality a(value, n);
  else
    group_attributes := existing.attribute_names;
  end if;
  if group_attributes is null or cardinality(group_attributes) not between 1 and 3
    or exists (select 1 from unnest(group_attributes) a where char_length(a) not between 1 and 40)
    or (select count(distinct lower(a)) from unnest(group_attributes) a) <> cardinality(group_attributes) then
    raise exception 'invalid_variant_attributes' using errcode = '22023';
  end if;
  if group_name is null or char_length(group_name) not between 2 and 160 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if existing.id is null then
    if expected_group is not null then raise exception 'record_missing' using errcode = 'PT409'; end if;
    insert into public.material_variant_groups(id, name, attribute_names, active) values (target_group_id, group_name, group_attributes, group_active);
  else
    if expected_group is null then raise exception 'record_already_exists' using errcode = '23505'; end if;
    if expected_group->>'name' is distinct from existing.name or expected_group->'attribute_names' is distinct from to_jsonb(existing.attribute_names)
      or (expected_group->>'active')::boolean is distinct from existing.active then
      raise exception 'stale_record_reload' using errcode = 'PT409';
    end if;
    update public.material_variant_groups set name = group_name, attribute_names = group_attributes, active = group_active, updated_at = now()
    where id = target_group_id;
  end if;

  for item, item_no in select value, ordinality from jsonb_array_elements(variants) with ordinality loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) key
        where key <> all(array['material_id', 'attributes', 'code', 'name', 'prices', 'detach'])) then
      raise exception 'invalid_variant' using errcode = '22023';
    end if;
    item_material := (item->>'material_id')::uuid;
    if coalesce((item->>'detach')::boolean, false) then
      -- Leave the group: the material keeps its code, stock, units and prices.
      select * into material from public.materials m where m.id = item_material for update;
      if material.id is null or material.variant_group_id is distinct from target_group_id then raise exception 'invalid_variant' using errcode = '22023'; end if;
      update public.materials set variant_group_id = null, variant_attributes = null where id = item_material;
      continue;
    end if;
    if jsonb_typeof(item->'attributes') is distinct from 'object' then raise exception 'invalid_variant_attributes' using errcode = '22023'; end if;
    item_attributes := private.trimmed_attributes(item->'attributes');

    if item_material is not null then
      -- An existing material joins the group or gets new attribute values.
      select * into material from public.materials m where m.id = item_material for update;
      if material.id is null then raise exception 'material_missing' using errcode = 'PT409'; end if;
      if material.variant_group_id is not null and material.variant_group_id <> target_group_id then
        raise exception 'material_in_other_group' using errcode = '23505';
      end if;
      if material.variant_group_id is null and not material.active then raise exception 'material_inactive' using errcode = '22023'; end if;
      update public.materials set variant_group_id = target_group_id, variant_attributes = item_attributes where id = item_material;
    else
      -- A new variant from the template. Codes are upper case like every material code.
      if template is null or (template->>'group_id') is null or (template->>'base_uom_id') is null then
        raise exception 'variant_template_required' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_object_keys(template) key
          where key <> all(array['group_id', 'base_uom_id', 'specification', 'sale_enabled', 'purchase_enabled', 'units'])) then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
      item_material := md5(operation_id::text || ':material:' || item_no)::uuid;
      perform public.save_catalog_record('materials', item_material, target_branch_id,
        jsonb_build_object('code', upper(btrim(coalesce(item->>'code', ''))), 'name', btrim(coalesce(item->>'name', '')),
          'group_id', template->>'group_id', 'base_uom_id', template->>'base_uom_id',
          'specification', nullif(btrim(coalesce(template->>'specification', '')), ''),
          'sale_enabled', coalesce((template->>'sale_enabled')::boolean, true),
          'purchase_enabled', coalesce((template->>'purchase_enabled')::boolean, true), 'active', true),
        null, change_reason, md5(operation_id::text || ':materialop:' || item_no)::uuid);
      update public.materials set variant_group_id = target_group_id, variant_attributes = item_attributes where id = item_material;
      template_units := coalesce(template->'units', '[]');
      item_prices := coalesce(item->'prices', '[]');
      if jsonb_typeof(template_units) <> 'array' or jsonb_typeof(item_prices) <> 'array' then raise exception 'invalid_variant' using errcode = '22023'; end if;
      if jsonb_array_length(template_units) + jsonb_array_length(item_prices) > 0 then
        perform public.save_material_units(target_branch_id, item_material, template_units, '[]', item_prices, effective_from,
          change_reason, md5(operation_id::text || ':units:' || item_no)::uuid);
      end if;
      new_ids := new_ids || item_material;
    end if;
  end loop;

  -- Every member is labelled by exactly the group's attributes (also after the attribute names change).
  if exists (select 1 from public.materials m where m.variant_group_id = target_group_id
      and not private.variant_attributes_valid(m.variant_attributes, group_attributes)) then
    raise exception 'invalid_variant_attributes' using errcode = '22023';
  end if;

  insert into public.command_receipts values (operation_id, auth.uid(), 'save_material_variant_group', payload_hash, 'material_variant_group', target_group_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), target_branch_id, case when existing.id is null then 'catalog.variant_group_create' else 'catalog.variant_group_update' end,
    'material_variant_groups', target_group_id, operation_id,
    array_remove(array['name', 'attribute_names', 'active', case when jsonb_array_length(variants) > 0 then 'variants' end], null), change_reason);
  return jsonb_build_object('group_id', target_group_id, 'material_ids', to_jsonb(new_ids), 'replayed', false);
end
$function$;

revoke all on function public.save_material_variant_group(uuid, uuid, jsonb, jsonb, jsonb, jsonb, timestamptz, text, uuid) from public, anon;
grant execute on function public.save_material_variant_group(uuid, uuid, jsonb, jsonb, jsonb, jsonb, timestamptz, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
