-- Customer price groups (owner decision D11, 2026-10-16): "Lẻ / Sỉ / Đại lý…" are named per branch instead of typed
-- as free text. customers.tier_code and pricing_rules.customer_tier_code keep storing the group code; composite foreign
-- keys make the database refuse a code that is not a group of the same branch. Existing codes become groups first.
-- save_pricing_rules_batch also saves group prices (CUSTOMER_TIER), still item by item through save_pricing_rule and
-- all-or-nothing. Price priority is unchanged (SPEC-PRI-001).
begin;

create table public.customer_price_groups (
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null check (char_length(code) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, code)
);
alter table public.customer_price_groups enable row level security;
create policy customer_price_groups_select on public.customer_price_groups for select to authenticated
  using ((select private.has_branch_access(branch_id)));
grant select on public.customer_price_groups to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.customer_price_groups from authenticated;
revoke all on public.customer_price_groups from anon;

insert into public.customer_price_groups(branch_id, code, name)
select branch_id, tier_code, tier_code from public.customers where tier_code is not null
union
select branch_id, customer_tier_code, customer_tier_code from public.pricing_rules where customer_tier_code is not null
on conflict do nothing;

alter table public.customers add constraint customers_price_group_fk
  foreign key (branch_id, tier_code) references public.customer_price_groups(branch_id, code) on update restrict on delete restrict;
alter table public.pricing_rules add constraint pricing_rules_price_group_fk
  foreign key (branch_id, customer_tier_code) references public.customer_price_groups(branch_id, code) on update restrict on delete restrict;

-- Create a group, or rename / stop / reuse an existing one. The code is the group's identity and never changes.
create or replace function public.save_customer_price_group(
  target_branch_id uuid,
  group_code text,
  group_name text,
  group_active boolean,
  change_reason text,
  operation_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  existing public.customer_price_groups%rowtype;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'pricing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if operation_id is null or group_active is null or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500
    or char_length(btrim(coalesce(group_name, ''))) not between 1 and 80 or group_code is null or char_length(group_code) not between 1 and 40 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'code', group_code,
    'name', btrim(group_name), 'active', group_active, 'reason', change_reason));
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_customer_price_group.operation_id;
  if found then
    if receipt.command_name <> 'save_customer_price_group' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return group_code;
  end if;

  select * into existing from public.customer_price_groups g where g.branch_id = target_branch_id and g.code = group_code for update;
  if existing.code is null then
    if group_code !~ '^[A-Z0-9_-]{2,40}$' then raise exception 'invalid_price_group_code' using errcode = '22023'; end if;
    insert into public.customer_price_groups(branch_id, code, name, active) values (target_branch_id, group_code, btrim(group_name), group_active);
  else
    update public.customer_price_groups set name = btrim(group_name), active = group_active, updated_at = now()
    where branch_id = target_branch_id and code = group_code;
  end if;

  insert into public.command_receipts values (operation_id, auth.uid(), 'save_customer_price_group', payload_hash, 'customer_price_group',
    md5(target_branch_id::text || ':' || group_code)::uuid, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), target_branch_id, case when existing.code is null then 'pricing.group_create' else 'pricing.group_update' end,
    'customer_price_group', md5(target_branch_id::text || ':' || group_code)::uuid, operation_id, array['name', 'active'], change_reason);
  return group_code;
end
$function$;

revoke all on function public.save_customer_price_group(uuid, text, text, boolean, text, uuid) from public, anon;
grant execute on function public.save_customer_price_group(uuid, text, text, boolean, text, uuid) to authenticated;

-- Price book bulk save, now also for a customer price group: an item with customer_tier_code saves that group's price
-- (CUSTOMER_TIER); without it, the general price (DEFAULT) as before. Item IDs stay derived from the batch operation.
create or replace function public.save_pricing_rules_batch(
  target_branch_id uuid,
  items jsonb,
  effective_from timestamptz,
  change_reason text,
  operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  max_items constant integer := 500;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  item jsonb;
  item_no integer;
  old_rule public.pricing_rules%rowtype;
  item_material uuid;
  item_uom uuid;
  item_price bigint;
  item_supersedes uuid;
  item_tier text;
  item_scope text;
  item_operation uuid;
  item_target uuid;
  rule_ids uuid[] := '{}';
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'pricing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if operation_id is null or effective_from is null or jsonb_typeof(items) <> 'array'
    or jsonb_array_length(items) = 0 or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > max_items then raise exception 'too_many_price_items' using errcode = '22023'; end if;
  if (select count(*) from (select distinct value->>'material_id', value->>'price_uom_id', value->>'customer_tier_code' from jsonb_array_elements(items)) keys) <> jsonb_array_length(items) then
    raise exception 'duplicate_price_item' using errcode = '22023';
  end if;

  payload_hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'items', items,
    'from', effective_from, 'reason', change_reason));
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_pricing_rules_batch.operation_id;
  if found then
    if receipt.command_name <> 'save_pricing_rules_batch' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    select array_agg(md5(operation_id::text || ':rule:' || n)::uuid order by n) into rule_ids
      from generate_series(1, jsonb_array_length(items)) n;
    return jsonb_build_object('count', jsonb_array_length(items), 'rule_ids', to_jsonb(rule_ids), 'replayed', true);
  end if;

  for item, item_no in select value, ordinality from jsonb_array_elements(items) with ordinality loop
    if jsonb_typeof(item) <> 'object' or exists (select 1 from jsonb_object_keys(item) key
        where key <> all(array['material_id', 'price_uom_id', 'unit_price_vnd', 'supersedes_id', 'expected_version', 'customer_tier_code'])) then
      raise exception 'invalid_price_item' using errcode = '22023';
    end if;
    item_material := (item->>'material_id')::uuid;
    item_uom := (item->>'price_uom_id')::uuid;
    item_price := (item->>'unit_price_vnd')::bigint;
    item_supersedes := (item->>'supersedes_id')::uuid;
    item_tier := nullif(item->>'customer_tier_code', '');
    item_scope := case when item_tier is null then 'DEFAULT' else 'CUSTOMER_TIER' end;
    item_operation := md5(operation_id::text || ':op:' || item_no)::uuid;
    item_target := md5(operation_id::text || ':rule:' || item_no)::uuid;
    if item_material is null or item_uom is null then raise exception 'invalid_price_item' using errcode = '22023'; end if;
    if item_tier is not null and not exists (select 1 from public.customer_price_groups g
        where g.branch_id = target_branch_id and g.code = item_tier and g.active) then
      raise exception 'price_group_inactive' using errcode = '22023';
    end if;

    if item_supersedes is not null then
      -- The price book edits general and group prices; customer-specific rules keep their own editor.
      select * into old_rule from public.pricing_rules p where p.id = item_supersedes and p.branch_id = target_branch_id;
      if old_rule.id is null or old_rule.scope_type <> item_scope or old_rule.material_id is distinct from item_material
        or old_rule.price_uom_id <> item_uom or old_rule.customer_tier_code is distinct from item_tier then
        raise exception 'invalid_price_item' using errcode = '22023';
      end if;
      perform public.save_pricing_rule(item_target, target_branch_id, item_supersedes, (item->>'expected_version')::integer,
        jsonb_build_object('unit_price_vnd', item_price, 'source_type', old_rule.source_type, 'effective_from', effective_from),
        change_reason, item_operation);
    else
      perform public.save_pricing_rule(item_target, target_branch_id, null, null,
        jsonb_build_object('scope_type', item_scope, 'material_id', item_material, 'price_uom_id', item_uom,
          'unit_price_vnd', item_price, 'source_type', 'LIST', 'effective_from', effective_from)
          || case when item_tier is null then '{}'::jsonb else jsonb_build_object('customer_tier_code', item_tier) end,
        change_reason, item_operation);
    end if;
    rule_ids := rule_ids || item_target;
  end loop;

  insert into public.command_receipts values (operation_id, auth.uid(), 'save_pricing_rules_batch', payload_hash, 'pricing_rule_batch', operation_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), target_branch_id, 'pricing.save_batch', 'pricing_rule_batch', operation_id, operation_id, array['unit_price_vnd'], change_reason);
  return jsonb_build_object('count', jsonb_array_length(items), 'rule_ids', to_jsonb(rule_ids), 'replayed', false);
end
$function$;

revoke all on function public.save_pricing_rules_batch(uuid, jsonb, timestamptz, text, uuid) from public, anon;
grant execute on function public.save_pricing_rules_batch(uuid, jsonb, timestamptz, text, uuid) to authenticated;

commit;
