create or replace function public.pricing_config_options(target_branch_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'pricing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'customers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name), '[]'::jsonb) from (select id, display_name from public.customers where branch_id = target_branch_id and active order by display_name limit 500) c),
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from (select id, name from public.materials where active and sale_enabled order by name limit 500) m),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from (select id, name from public.material_groups where active order by name limit 500) g),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', symbol) order by symbol), '[]'::jsonb) from (select id, symbol from public.units_of_measure where active order by symbol limit 500) u)
  );
end $$;
revoke all on function public.pricing_config_options(uuid) from public, anon;
grant execute on function public.pricing_config_options(uuid) to authenticated;

create or replace function public.save_pricing_rule(
  target_id uuid, target_branch_id uuid, supersedes_id uuid, expected_version integer,
  values_json jsonb, change_reason text, operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  old_rule public.pricing_rules%rowtype;
  field_name text; rule_scope text; rule_customer uuid; rule_material uuid; rule_group uuid;
  rule_tier text; rule_uom uuid; rule_price bigint; rule_source text;
  rule_from timestamptz; rule_to timestamptz; next_version integer;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'pricing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_id is null or operation_id is null or jsonb_typeof(values_json) <> 'object'
    or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for field_name in select jsonb_object_keys(values_json) loop
    if field_name <> all(array['scope_type','customer_id','material_id','material_group_id','customer_tier_code','price_uom_id','unit_price_vnd','source_type','effective_from','effective_to']) then
      raise exception 'field_not_editable' using errcode = '42501';
    end if;
  end loop;
  rule_price := (values_json->>'unit_price_vnd')::bigint;
  rule_source := values_json->>'source_type';
  rule_from := (values_json->>'effective_from')::timestamptz;
  rule_to := (values_json->>'effective_to')::timestamptz;
  if rule_price is null or rule_price <= 0 or rule_source not in ('LIST','CONTRACT') or rule_from is null
    or (rule_to is not null and rule_to <= rule_from) then
    raise exception 'invalid_price_rule' using errcode = '22023';
  end if;
  if supersedes_id is not null then
    select * into old_rule from public.pricing_rules where id = supersedes_id and branch_id = target_branch_id for update;
    if old_rule.id is null or expected_version is null or old_rule.version <> expected_version or not old_rule.active then
      raise exception 'stale_price_rule' using errcode = 'PT409';
    end if;
    if values_json ?| array['scope_type','customer_id','material_id','material_group_id','customer_tier_code','price_uom_id'] then
      raise exception 'scope_immutable' using errcode = '22023';
    end if;
    rule_scope := old_rule.scope_type; rule_customer := old_rule.customer_id;
    rule_material := old_rule.material_id; rule_group := old_rule.material_group_id;
    rule_tier := old_rule.customer_tier_code; rule_uom := old_rule.price_uom_id;
    if rule_from < old_rule.effective_from then raise exception 'effective_date_before_previous' using errcode = '22023'; end if;
  else
    if expected_version is not null then raise exception 'unexpected_version' using errcode = '22023'; end if;
    rule_scope := values_json->>'scope_type';
    rule_customer := (values_json->>'customer_id')::uuid;
    rule_material := (values_json->>'material_id')::uuid;
    rule_group := (values_json->>'material_group_id')::uuid;
    rule_tier := nullif(trim(values_json->>'customer_tier_code'), '');
    rule_uom := (values_json->>'price_uom_id')::uuid;
  end if;
  if not ((rule_scope = 'CUSTOMER_MATERIAL' and rule_customer is not null and rule_material is not null and rule_group is null and rule_tier is null)
    or (rule_scope = 'CUSTOMER_GROUP' and rule_customer is not null and rule_material is null and rule_group is not null and rule_tier is null)
    or (rule_scope = 'CUSTOMER_TIER' and rule_customer is null and rule_material is not null and rule_group is null and rule_tier is not null and char_length(rule_tier) <= 40)
    or (rule_scope = 'DEFAULT' and rule_customer is null and rule_material is not null and rule_group is null and rule_tier is null)) then
    raise exception 'invalid_price_scope' using errcode = '22023';
  end if;
  if rule_customer is not null and not exists (select 1 from public.customers where id = rule_customer and branch_id = target_branch_id and active) then
    raise exception 'customer_outside_branch' using errcode = '42501';
  end if;
  if rule_material is not null and not exists (select 1 from public.materials where id = rule_material and active and sale_enabled) then raise exception 'material_inactive' using errcode = '22023'; end if;
  if rule_group is not null and not exists (select 1 from public.material_groups where id = rule_group and active) then raise exception 'group_inactive' using errcode = '22023'; end if;
  if not exists (select 1 from public.units_of_measure where id = rule_uom and active) then raise exception 'uom_inactive' using errcode = '22023'; end if;
  if supersedes_id is null and exists (
    select 1 from public.pricing_rules p where p.branch_id = target_branch_id and p.active and p.scope_type = rule_scope
      and p.customer_id is not distinct from rule_customer and p.material_id is not distinct from rule_material
      and p.material_group_id is not distinct from rule_group and p.customer_tier_code is not distinct from rule_tier
      and p.price_uom_id = rule_uom
  ) then raise exception 'active_rule_exists' using errcode = 'PT409'; end if;
  select coalesce(max(p.version), 0) + 1 into next_version from public.pricing_rules p
    where p.scope_type = rule_scope and p.customer_id is not distinct from rule_customer
      and p.material_id is not distinct from rule_material and p.material_group_id is not distinct from rule_group
      and p.customer_tier_code is not distinct from rule_tier and p.price_uom_id = rule_uom;
  if supersedes_id is not null then
    update public.pricing_rules set
      effective_to = case when effective_to is null or effective_to > rule_from then rule_from else effective_to end,
      active = case when effective_from = rule_from then false else active end
    where id = supersedes_id;
  end if;
  insert into public.pricing_rules(id, branch_id, scope_type, customer_id, material_id, material_group_id,
    customer_tier_code, price_uom_id, unit_price_vnd, version, source_type,
    effective_from, effective_to, active, created_by)
  values(target_id, target_branch_id, rule_scope, rule_customer, rule_material, rule_group,
    rule_tier, rule_uom, rule_price, next_version, rule_source,
    rule_from, rule_to, true, auth.uid());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values(auth.uid(), target_branch_id, 'pricing.save', 'pricing_rules', target_id, operation_id,
    array(select jsonb_object_keys(values_json)), change_reason);
  return target_id;
end $$;
revoke all on function public.save_pricing_rule(uuid,uuid,uuid,integer,jsonb,text,uuid) from public, anon;
grant execute on function public.save_pricing_rule(uuid,uuid,uuid,integer,jsonb,text,uuid) to authenticated;

create or replace function public.deactivate_pricing_rule(
  target_id uuid, target_branch_id uuid, expected_version integer, change_reason text, operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare old_rule public.pricing_rules%rowtype;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'pricing.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_id is null or operation_id is null or expected_version is null or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into old_rule from public.pricing_rules where id = target_id and branch_id = target_branch_id for update;
  if old_rule.id is null or old_rule.version <> expected_version or not old_rule.active then raise exception 'stale_price_rule' using errcode = 'PT409'; end if;
  update public.pricing_rules set active = false where id = target_id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values(auth.uid(), target_branch_id, 'pricing.deactivate', 'pricing_rules', target_id, operation_id, array['active'], change_reason);
  return target_id;
end $$;
revoke all on function public.deactivate_pricing_rule(uuid,uuid,integer,text,uuid) from public, anon;
grant execute on function public.deactivate_pricing_rule(uuid,uuid,integer,text,uuid) to authenticated;
