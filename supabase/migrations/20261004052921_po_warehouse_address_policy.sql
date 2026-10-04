-- Owner-approved SPEC-PUR-001 / UX-REC-003. No historical rows are changed.
create or replace function private.normalize_po_warehouse_address(value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(value, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '')
$$;
revoke all on function private.normalize_po_warehouse_address(text) from public, anon, authenticated;

create or replace function public.create_purchase_order_draft(
  target_branch_id uuid, target_supplier_id uuid, target_warehouse_id uuid,
  expected_at timestamptz, commercial_terms text, purchase_lines jsonb, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare payload jsonb; hash text; receipt public.command_receipts%rowtype;
  supplier public.suppliers%rowtype; warehouse public.warehouses%rowtype;
  order_id uuid; item jsonb; checked record; line_no integer := 0;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'purchasing.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(purchase_lines) <> 'array' or jsonb_array_length(purchase_lines) = 0 then raise exception 'purchase_lines_required' using errcode = '22023'; end if;
  payload := jsonb_build_object('branch_id', target_branch_id, 'supplier_id', target_supplier_id, 'warehouse_id', target_warehouse_id, 'expected_at', expected_at, 'terms', commercial_terms, 'lines', purchase_lines);
  hash := private.command_payload_hash(payload);
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_purchase_order_draft.operation_id;
  if found then if receipt.command_name <> 'create_purchase_order_draft' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  select * into supplier from public.suppliers where id = target_supplier_id and branch_id = target_branch_id and active;
  select * into warehouse from public.warehouses where id = target_warehouse_id and branch_id = target_branch_id and active for share;
  if supplier.id is null or warehouse.id is null then raise exception 'supplier_or_warehouse_invalid' using errcode = '23503'; end if;
  if private.normalize_po_warehouse_address(warehouse.address_text) is null then raise exception 'warehouse_address_required' using errcode = '22023'; end if;
  insert into public.purchase_orders(branch_id, purchase_order_number, supplier_id, destination_type, warehouse_id,
    supplier_name_snapshot, supplier_address_snapshot, destination_name_snapshot, destination_address_snapshot,
    expected_at, commercial_terms, created_by)
  values (target_branch_id, 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    target_supplier_id, 'WAREHOUSE', target_warehouse_id, supplier.name, supplier.address_text,
    warehouse.name, private.normalize_po_warehouse_address(warehouse.address_text), expected_at, commercial_terms, (select auth.uid())) returning id into order_id;
  for item in select value from jsonb_array_elements(purchase_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_purchase_line(target_branch_id, target_supplier_id, item, (select auth.uid()));
    insert into public.purchase_order_lines(purchase_order_id, line_number, material_id, material_name_snapshot,
      ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode,
      unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
      price_source_type, override_by, override_reason)
    values (order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_cost_vnd, checked.line_total_cost_vnd, checked.purchase_price_rule_id,
      checked.purchase_price_rule_version, checked.price_source_type, checked.override_by, checked.override_reason);
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_purchase_order_draft', hash, 'purchase_order', order_id, now());
  return order_id;
end
$$;
create or replace function private.guard_purchase_order_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'purchase_order_is_not_deletable' using errcode = '55000'; end if;
  if old.state <> 'DRAFT' and (to_jsonb(new) - array['state','cancelled_at']::text[]) <> (to_jsonb(old) - array['state','cancelled_at']::text[]) then raise exception 'confirmed_purchase_order_is_immutable' using errcode = '55000'; end if;
  if old.state = 'DRAFT' and new.state not in ('DRAFT','CONFIRMED','CANCELLED') then raise exception 'invalid_purchase_order_transition' using errcode = '23514'; end if;
  if old.state = 'CONFIRMED' and new.state not in ('CONFIRMED','CLOSED','CANCELLED') then raise exception 'invalid_purchase_order_transition' using errcode = '23514'; end if;
  if old.state in ('CLOSED','CANCELLED') and new.state <> old.state then raise exception 'terminal_purchase_order_transition' using errcode = '23514'; end if;
  if old.state = 'DRAFT' and new.state = 'CONFIRMED' and new.destination_type = 'WAREHOUSE'
    and private.normalize_po_warehouse_address(new.destination_address_snapshot) is null then
    raise exception 'purchase_order_destination_address_required' using errcode = '22023';
  end if;
  return new;
end
$$;

create or replace function public.update_purchase_order_warehouse(
  target_purchase_order_id uuid, expected_version integer, target_warehouse_id uuid,
  change_reason text, operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  order_row public.purchase_orders%rowtype; warehouse_row public.warehouses%rowtype;
  receipt public.command_receipts%rowtype; hash text; address text;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if not found then raise exception 'purchase_order_missing' using errcode = '22023'; end if;
  if auth.uid() is null or not private.has_permission(order_row.branch_id, 'purchasing.create') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('purchase_order_id', target_purchase_order_id, 'version', expected_version, 'warehouse_id', target_warehouse_id, 'reason', change_reason));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_purchase_order_warehouse.operation_id;
  if found then
    if receipt.command_name <> 'update_purchase_order_warehouse' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if order_row.state <> 'DRAFT' or order_row.destination_type <> 'WAREHOUSE' then raise exception 'purchase_order_not_editable' using errcode = '23514'; end if;
  if expected_version is null or order_row.draft_version <> expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if exists(select 1 from public.supply_allocations a join public.purchase_order_lines l on l.id = a.purchase_order_line_id where l.purchase_order_id = order_row.id) then raise exception 'purchase_order_has_allocations' using errcode = '23514'; end if;
  if operation_id is null or char_length(trim(coalesce(change_reason, ''))) not between 3 and 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into warehouse_row from public.warehouses where id = target_warehouse_id and branch_id = order_row.branch_id and active for share;
  if not found then raise exception 'supplier_or_warehouse_invalid' using errcode = '23503'; end if;
  address := private.normalize_po_warehouse_address(warehouse_row.address_text);
  if address is null then raise exception 'warehouse_address_required' using errcode = '22023'; end if;
  update public.purchase_orders set warehouse_id = warehouse_row.id, destination_name_snapshot = warehouse_row.name,
    destination_address_snapshot = address, draft_version = draft_version + 1 where id = order_row.id;
  insert into public.command_receipts values(operation_id, auth.uid(), 'update_purchase_order_warehouse', hash, 'purchase_order', order_row.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values(auth.uid(), order_row.branch_id, 'purchase_order.draft.destination.update', 'purchase_order', order_row.id, operation_id,
    array['warehouse_id','destination_name_snapshot','destination_address_snapshot','draft_version'], change_reason);
  return order_row.id;
end $$;
revoke all on function public.update_purchase_order_warehouse(uuid,integer,uuid,text,uuid) from public, anon;
grant execute on function public.update_purchase_order_warehouse(uuid,integer,uuid,text,uuid) to authenticated;
