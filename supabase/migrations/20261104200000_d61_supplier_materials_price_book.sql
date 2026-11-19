-- D61 (Owner 04/11/2026): bảng giá mua theo nhà cung cấp.
-- (1) supplier_materials: which materials each supplier sells, in which purchase unit — the rows of that supplier's
--     purchase price book. Assigning is not a document: deleting the supplier or the material drops it; unassigning only
--     hides the material from that supplier's book (prices and purchase orders stay as they are).
-- (2) save_purchase_price_book: one effective day, up to 500 prices, all or nothing, each through save_purchase_price_rule
--     (its version, scope lock, overlap and same-day rules unchanged). A price saved for a pair not yet assigned assigns it.
-- How a purchase order prices its lines and how auto-sourcing picks a supplier do not change: both still read
-- purchase_price_rules only.
begin;

create table public.supplier_materials (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  purchase_uom_id uuid not null references public.units_of_measure(id) on delete restrict,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, material_id)
);
create index supplier_materials_material_idx on public.supplier_materials(material_id);
create index supplier_materials_branch_idx on public.supplier_materials(branch_id, supplier_id) where active;

alter table public.supplier_materials enable row level security;
revoke all on public.supplier_materials from anon, authenticated;
grant select on public.supplier_materials to authenticated;
create policy supplier_materials_select on public.supplier_materials for select to authenticated
  using ((select private.has_permission(branch_id, 'purchasing.read')) or (select private.has_permission(branch_id, 'purchasing.price.read')));

-- The pairs that already have a price in effect (or later) become assignments, in the unit of their newest price.
insert into public.supplier_materials(branch_id, supplier_id, material_id, purchase_uom_id)
select distinct on (p.supplier_id, p.material_id) p.branch_id, p.supplier_id, p.material_id, p.purchase_uom_id
from public.purchase_price_rules p
where p.active and (p.effective_to is null or p.effective_to > now())
order by p.supplier_id, p.material_id, p.effective_from desc, p.version desc
on conflict (supplier_id, material_id) do nothing;

-- A unit the material is bought in: its base unit or a settlement conversion to it (the units the price editor offers).
create or replace function private.material_purchase_unit_ok(target_material uuid, target_uom uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.materials m where m.id = target_material and m.base_uom_id = target_uom)
    or exists (select 1 from public.material_uom_conversions c join public.materials m on m.id = c.material_id
      where c.material_id = target_material and c.from_uom_id = target_uom and c.to_uom_id = m.base_uom_id and c.active and c.settlement_allowed)
$$;
revoke all on function private.material_purchase_unit_ok(uuid, uuid) from public, anon;

create or replace function public.set_supplier_material_assignments(target_branch_id uuid, items jsonb, operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  hash text;
  receipt public.command_receipts%rowtype;
  item jsonb;
  supplier uuid; material uuid; uom uuid; turn_on boolean;
  saved integer := 0;
begin
  if me is null or target_branch_id is null or not private.has_permission(target_branch_id, 'purchasing.price.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if set_supplier_material_assignments.operation_id is null or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 200 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (select count(*) from (select distinct value->>'supplier_id', value->>'material_id' from jsonb_array_elements(items)) d) <> jsonb_array_length(items) then
    raise exception 'duplicate_assignment' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'items', items));
  perform pg_advisory_xact_lock(hashtextextended(set_supplier_material_assignments.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = set_supplier_material_assignments.operation_id;
  if found then
    if receipt.command_name <> 'set_supplier_material_assignments' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('count', jsonb_array_length(items), 'replayed', true);
  end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(item) key where key <> all(array['supplier_id', 'material_id', 'purchase_uom_id', 'active'])) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    supplier := (item->>'supplier_id')::uuid; material := (item->>'material_id')::uuid; uom := (item->>'purchase_uom_id')::uuid;
    turn_on := coalesce((item->>'active')::boolean, true);
    if not exists (select 1 from public.suppliers s where s.id = supplier and s.branch_id = target_branch_id and s.active) then
      raise exception 'supplier_outside_branch' using errcode = '42501';
    end if;
    if turn_on and (not exists (select 1 from public.materials m where m.id = material and m.active and m.purchase_enabled)
      or uom is null or not private.material_purchase_unit_ok(material, uom)) then
      raise exception 'material_or_uom_invalid' using errcode = '22023';
    end if;
    if turn_on then
      insert into public.supplier_materials(branch_id, supplier_id, material_id, purchase_uom_id, active, created_by)
      values (target_branch_id, supplier, material, uom, true, me)
      on conflict (supplier_id, material_id) do update set purchase_uom_id = excluded.purchase_uom_id, active = true, updated_at = now();
    else
      update public.supplier_materials sm set active = false, updated_at = now()
      where sm.supplier_id = supplier and sm.material_id = material and sm.branch_id = target_branch_id;
    end if;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (me, target_branch_id, case when turn_on then 'supplier_material.assigned' else 'supplier_material.unassigned' end, 'materials', material,
      set_supplier_material_assignments.operation_id, array['supplier_id', 'purchase_uom_id', 'active'],
      left('Nhà cung cấp: ' || coalesce((select s.name from public.suppliers s where s.id = supplier), '—'), 500));
    saved := saved + 1;
  end loop;
  insert into public.command_receipts values (set_supplier_material_assignments.operation_id, me, 'set_supplier_material_assignments', hash,
    'supplier', ((items->0)->>'supplier_id')::uuid, now());
  return jsonb_build_object('count', saved, 'replayed', false);
end
$function$;
revoke all on function public.set_supplier_material_assignments(uuid, jsonb, uuid) from public, anon;
grant execute on function public.set_supplier_material_assignments(uuid, jsonb, uuid) to authenticated;

create or replace function public.save_purchase_price_book(target_branch_id uuid, items jsonb, effective_from timestamptz, change_reason text, operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  hash text;
  receipt public.command_receipts%rowtype;
  item jsonb;
  item_no integer;
  old_rule public.purchase_price_rules%rowtype;
  rule_id uuid;
  values_json jsonb;
  ids jsonb := '[]'::jsonb;
begin
  if me is null or target_branch_id is null or not private.has_permission(target_branch_id, 'purchasing.price.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if save_purchase_price_book.operation_id is null or save_purchase_price_book.effective_from is null
    or jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 500 then raise exception 'too_many_price_items' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'items', items, 'from', save_purchase_price_book.effective_from, 'reason', change_reason));
  perform pg_advisory_xact_lock(hashtextextended(save_purchase_price_book.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_purchase_price_book.operation_id;
  if found then
    if receipt.command_name <> 'save_purchase_price_book' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('count', jsonb_array_length(items), 'rule_ids',
      (select jsonb_agg(md5(save_purchase_price_book.operation_id::text || ':rule:' || n)::uuid order by n) from generate_series(1, jsonb_array_length(items)) n), 'replayed', true);
  end if;
  for item, item_no in select value, ordinality from jsonb_array_elements(items) with ordinality loop
    if jsonb_typeof(item) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(item) key where key <> all(array['supplier_id', 'material_id', 'purchase_uom_id', 'unit_cost_vnd', 'supersedes_id', 'expected_version'])) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    rule_id := md5(save_purchase_price_book.operation_id::text || ':rule:' || item_no)::uuid;
    if item ? 'supersedes_id' then
      select * into old_rule from public.purchase_price_rules p where p.id = (item->>'supersedes_id')::uuid and p.branch_id = target_branch_id;
      if old_rule.id is null or old_rule.supplier_id is distinct from (item->>'supplier_id')::uuid or old_rule.material_id is distinct from (item->>'material_id')::uuid
        or old_rule.purchase_uom_id is distinct from (item->>'purchase_uom_id')::uuid then
        raise exception 'stale_price_rule' using errcode = 'PT409';
      end if;
      values_json := jsonb_build_object('unit_cost_vnd', item->>'unit_cost_vnd', 'source_type', old_rule.source_type, 'effective_from', save_purchase_price_book.effective_from);
      perform public.save_purchase_price_rule(rule_id, target_branch_id, old_rule.id, (item->>'expected_version')::integer, values_json, change_reason,
        md5(save_purchase_price_book.operation_id::text || ':op:' || item_no)::uuid);
    else
      values_json := jsonb_build_object('supplier_id', item->>'supplier_id', 'material_id', item->>'material_id', 'purchase_uom_id', item->>'purchase_uom_id',
        'unit_cost_vnd', item->>'unit_cost_vnd', 'source_type', 'LIST', 'effective_from', save_purchase_price_book.effective_from);
      perform public.save_purchase_price_rule(rule_id, target_branch_id, null, null, values_json, change_reason,
        md5(save_purchase_price_book.operation_id::text || ':op:' || item_no)::uuid);
    end if;
    -- A price for a pair makes it part of that supplier's book.
    insert into public.supplier_materials(branch_id, supplier_id, material_id, purchase_uom_id, active, created_by)
    select target_branch_id, p.supplier_id, p.material_id, p.purchase_uom_id, true, me from public.purchase_price_rules p where p.id = rule_id
    on conflict (supplier_id, material_id) do update set active = true, updated_at = now() where not public.supplier_materials.active;
    ids := ids || to_jsonb(rule_id);
  end loop;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, target_branch_id, 'purchase_pricing.save_book', 'purchase_price_book', save_purchase_price_book.operation_id, save_purchase_price_book.operation_id,
    array['unit_cost_vnd'], left(change_reason || ' · ' || jsonb_array_length(items) || ' giá', 500));
  insert into public.command_receipts values (save_purchase_price_book.operation_id, me, 'save_purchase_price_book', hash, 'purchase_price_rule', (ids->>0)::uuid, now());
  return jsonb_build_object('count', jsonb_array_length(ids), 'rule_ids', ids, 'replayed', false);
end
$function$;
revoke all on function public.save_purchase_price_book(uuid, jsonb, timestamptz, text, uuid) from public, anon;
grant execute on function public.save_purchase_price_book(uuid, jsonb, timestamptz, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
