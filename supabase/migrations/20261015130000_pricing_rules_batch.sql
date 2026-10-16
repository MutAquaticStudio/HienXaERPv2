-- Price book bulk save (owner decision D4, 2026-10-15): many general (DEFAULT-scope) prices in one
-- all-or-nothing transaction. Each item goes through public.save_pricing_rule, so permission, version,
-- scope and audit rules are exactly the single-rule ones. Item operation/rule IDs are derived from the
-- batch operation ID, so a repeated batch replays instead of writing twice.
begin;

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
  if (select count(*) from (select distinct value->>'material_id', value->>'price_uom_id' from jsonb_array_elements(items)) keys) <> jsonb_array_length(items) then
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
        where key <> all(array['material_id', 'price_uom_id', 'unit_price_vnd', 'supersedes_id', 'expected_version'])) then
      raise exception 'invalid_price_item' using errcode = '22023';
    end if;
    item_material := (item->>'material_id')::uuid;
    item_uom := (item->>'price_uom_id')::uuid;
    item_price := (item->>'unit_price_vnd')::bigint;
    item_supersedes := (item->>'supersedes_id')::uuid;
    item_operation := md5(operation_id::text || ':op:' || item_no)::uuid;
    item_target := md5(operation_id::text || ':rule:' || item_no)::uuid;
    if item_material is null or item_uom is null then raise exception 'invalid_price_item' using errcode = '22023'; end if;

    if item_supersedes is not null then
      -- The price book only edits general prices; customer-specific rules keep their own editor.
      select * into old_rule from public.pricing_rules p where p.id = item_supersedes and p.branch_id = target_branch_id;
      if old_rule.id is null or old_rule.scope_type <> 'DEFAULT' or old_rule.material_id is distinct from item_material
        or old_rule.price_uom_id <> item_uom then
        raise exception 'invalid_price_item' using errcode = '22023';
      end if;
      perform public.save_pricing_rule(item_target, target_branch_id, item_supersedes, (item->>'expected_version')::integer,
        jsonb_build_object('unit_price_vnd', item_price, 'source_type', old_rule.source_type, 'effective_from', effective_from),
        change_reason, item_operation);
    else
      perform public.save_pricing_rule(item_target, target_branch_id, null, null,
        jsonb_build_object('scope_type', 'DEFAULT', 'material_id', item_material, 'price_uom_id', item_uom,
          'unit_price_vnd', item_price, 'source_type', 'LIST', 'effective_from', effective_from),
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
