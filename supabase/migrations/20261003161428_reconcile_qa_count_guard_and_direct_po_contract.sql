-- SPEC-INVTRY-005: physical count/cost must be finite; retain zero-count support,
-- cutoff/evidence/approval and existing adjustment movement. No posted data is rewritten.
-- Direct PO restores the existing five-argument application RPC and its permission,
-- payload hash, row locks and allocation contract; unapproved terms overload is removed.
-- Owner disposition: CANONICAL_FORWARD_RECONCILIATION_WITH_INVARIANT_PRESERVATION.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preconditions$
declare stock_oid oid := to_regprocedure('public.record_stock_count_line(uuid,uuid,numeric,numeric,text,uuid,integer,uuid)');
  po_oid oid := to_regprocedure('public.create_direct_purchase_from_sales_order(uuid,uuid,jsonb,timestamptz,uuid)');
  extra_oid oid := to_regprocedure('public.create_direct_purchase_from_sales_order(uuid,uuid,jsonb,timestamptz,uuid,text)');
  f record; constraint_row record;
begin
  if stock_oid is null or (po_oid is null) = (extra_oid is null)
    or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='create_direct_purchase_from_sales_order') <> 1
  then raise exception 'qa_reconciliation_unexpected_rpc_overloads' using errcode='55000'; end if;
  if (select md5(prosrc) from pg_proc where oid=stock_oid) not in ('023a7909c71fdcc40057a1f5d24ca1d3','ad745fd2cbca113bb946b2f0794a1c4b','bfcb5d4f35cdca1af10d7a3622a71278')
    or (po_oid is not null and (select md5(prosrc) from pg_proc where oid=po_oid) <> '3ceecdec51a2a261cd19268fdee1570a')
    or (extra_oid is not null and ((select md5(prosrc) from pg_proc where oid=extra_oid) <> '1512980d343d9267d82a96351aa1d350'
      or (select pronargdefaults from pg_proc where oid=extra_oid) <> 1
      or (select pg_get_expr(proargdefaults,0) from pg_proc where oid=extra_oid) <> 'NULL::text'))
  then raise exception 'qa_reconciliation_unexpected_function_body_or_defaults' using errcode='55000'; end if;
  for f in select * from pg_proc where oid in (stock_oid,coalesce(po_oid,extra_oid)) loop
    if pg_get_userbyid(f.proowner) <> 'postgres' or not f.prosecdef
      or f.proconfig is distinct from array['search_path=""']::text[]
      or pg_get_function_result(f.oid) <> 'uuid'
      or has_function_privilege('anon',f.oid,'EXECUTE')
      or not has_function_privilege('authenticated',f.oid,'EXECUTE')
      or exists (select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
        where a.grantee not in (f.proowner,(select oid from pg_roles where rolname='authenticated')))
    then raise exception 'qa_reconciliation_unexpected_function_access' using errcode='55000'; end if;
  end loop;
  if extra_oid is not null and exists (select 1 from pg_depend where refclassid='pg_proc'::regclass and refobjid=extra_oid)
  then raise exception 'qa_reconciliation_po_dependency_requires_review' using errcode='2BP01'; end if;
  select convalidated,pg_get_constraintdef(oid) as definition into constraint_row
    from pg_constraint where conrelid='public.stock_count_lines'::regclass and conname='stock_count_lines_finite_count';
  if found and (constraint_row.convalidated or constraint_row.definition <>
    'CHECK (((counted_base_quantity >= (0)::numeric) AND (counted_base_quantity < ''Infinity''::numeric))) NOT VALID')
  then raise exception 'qa_reconciliation_unexpected_count_constraint' using errcode='55000'; end if;
end
$preconditions$;

create or replace function public.record_stock_count_line(target_stock_count_id uuid, target_material_id uuid, counted_base_quantity numeric, adjustment_unit_cost_vnd numeric, reason text, target_evidence_id uuid, expected_count_version integer, operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $stock_body$
declare count_row public.stock_counts%rowtype; expected numeric; hash text; receipt public.command_receipts%rowtype; line_id uuid;
begin
  select * into count_row from public.stock_counts where id = target_stock_count_id for update;
  if count_row.id is null or not private.has_permission(count_row.branch_id, 'inventory.count') then raise exception 'forbidden' using errcode = '42501'; end if;
  if counted_base_quantity is null or counted_base_quantity < 0 or counted_base_quantity >= 'Infinity'::numeric
  then raise exception 'invalid_stock_count_quantity' using errcode = '22023'; end if;
  if adjustment_unit_cost_vnd is not null and (adjustment_unit_cost_vnd < 0 or adjustment_unit_cost_vnd >= 'Infinity'::numeric)
  then raise exception 'invalid_stock_count_cost' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('count_id', target_stock_count_id, 'material_id', target_material_id, 'counted', counted_base_quantity, 'cost', adjustment_unit_cost_vnd, 'reason', nullif(trim(reason), ''), 'evidence_id', target_evidence_id, 'version', expected_count_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = record_stock_count_line.operation_id;
  if found then if receipt.command_name <> 'record_stock_count_line' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if count_row.state <> 'OPEN' or count_row.version <> expected_count_version or counted_base_quantity < 0 then raise exception 'stock_count_version_conflict' using errcode = 'PT409'; end if;
  if not exists (select 1 from public.materials where id = target_material_id and active) then raise exception 'material_not_found' using errcode = '23503'; end if;
  perform private.assert_verified_evidence(target_evidence_id, count_row.branch_id);
  select coalesce(sum(base_quantity_delta), 0) into expected from public.inventory_movements
    where warehouse_id = count_row.warehouse_id and material_id = target_material_id and occurred_at <= count_row.cutoff_at;
  if counted_base_quantity <> expected and char_length(trim(reason)) < 3 then raise exception 'variance_reason_required' using errcode = '22023'; end if;
  insert into public.stock_count_lines(stock_count_id, material_id, expected_base_quantity, counted_base_quantity,
    adjustment_unit_cost_vnd, reason, evidence_object_id, recorded_by)
  values (target_stock_count_id, target_material_id, expected, counted_base_quantity,
    adjustment_unit_cost_vnd, nullif(trim(reason), ''), target_evidence_id, (select auth.uid()))
  on conflict (stock_count_id, material_id) do update set expected_base_quantity = excluded.expected_base_quantity,
    counted_base_quantity = excluded.counted_base_quantity, adjustment_unit_cost_vnd = excluded.adjustment_unit_cost_vnd,
    reason = excluded.reason, evidence_object_id = excluded.evidence_object_id, recorded_by = excluded.recorded_by,
    recorded_at = now() returning id into line_id;
  update public.stock_counts set version = version + 1 where id = target_stock_count_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_stock_count_line', hash, 'stock_count_line', line_id, now());
  return line_id;
end
$stock_body$;

do $constraint$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.stock_count_lines'::regclass
    and conname='stock_count_lines_finite_count') then
    alter table public.stock_count_lines add constraint stock_count_lines_finite_count
      check(counted_base_quantity >= 0 and counted_base_quantity < 'Infinity'::numeric) not valid;
  end if;
end
$constraint$;

drop function if exists public.create_direct_purchase_from_sales_order(uuid,uuid,jsonb,timestamptz,uuid,text);
create or replace function public.create_direct_purchase_from_sales_order(target_sales_order_id uuid, target_supplier_id uuid, purchase_lines jsonb, expected_at timestamp with time zone, operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $po_body$
declare
  sale_order public.sales_orders%rowtype;
  sale_line public.sales_order_lines%rowtype;
  supplier public.suppliers%rowtype;
  receipt public.command_receipts%rowtype;
  checked record;
  payload_hash text;
  order_id uuid;
  purchase_line_id uuid;
  item jsonb;
  source_line_id uuid;
  seen_source_ids uuid[] := array[]::uuid[];
  line_no integer := 0;
  base_quantity numeric;
begin
  select * into sale_order from public.sales_orders where id = target_sales_order_id;
  if not found or not private.has_permission(sale_order.branch_id, 'purchasing.create')
  then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(purchase_lines) is distinct from 'array' then raise exception 'purchase_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(purchase_lines) not between 1 and 50 then raise exception 'purchase_lines_invalid' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('sales_order_id', target_sales_order_id,
    'supplier_id', target_supplier_id, 'lines', purchase_lines, 'expected_at', expected_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_direct_purchase_from_sales_order.operation_id;
  if found then
    if receipt.command_name <> 'create_direct_purchase_from_sales_order' or receipt.payload_hash <> payload_hash
      or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if sale_order.commercial_state not in ('DRAFT','CONFIRMED')
  then raise exception 'sales_order_not_sourceable' using errcode = '23514'; end if;
  select * into supplier from public.suppliers where id = target_supplier_id and branch_id = sale_order.branch_id and active;
  if supplier.id is null then raise exception 'supplier_invalid' using errcode = '23503'; end if;
  insert into public.purchase_orders(branch_id, purchase_order_number, supplier_id, destination_type, customer_id,
    site_id, source_sales_order_id, supplier_name_snapshot, supplier_address_snapshot,
    destination_name_snapshot, destination_address_snapshot, expected_at, created_by)
  values (sale_order.branch_id, 'PO-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    target_supplier_id, 'CUSTOMER_SITE', sale_order.customer_id, sale_order.site_id, sale_order.id,
    supplier.name, supplier.address_text, sale_order.site_name_snapshot, sale_order.delivery_address_snapshot,
    expected_at, (select auth.uid())) returning id into order_id;
  for item in select value from jsonb_array_elements(purchase_lines) loop
    source_line_id := nullif(item->>'linked_sales_order_line_id', '')::uuid;
    if source_line_id is null or source_line_id = any(seen_source_ids)
    then raise exception 'direct_purchase_source_line_invalid' using errcode = '22023'; end if;
    seen_source_ids := array_append(seen_source_ids, source_line_id);
    select * into sale_line from public.sales_order_lines where id = source_line_id and sales_order_id = target_sales_order_id for update;
    if not found then raise exception 'direct_purchase_source_line_invalid' using errcode = '23503'; end if;
    select * into checked from private.assert_purchase_line(sale_order.branch_id, target_supplier_id, item, (select auth.uid()));
    if checked.material_id <> sale_line.material_id or checked.base_uom_id <> sale_line.base_uom_id
    then raise exception 'direct_purchase_line_mismatch' using errcode = '22023'; end if;
    base_quantity := checked.quantity * checked.conversion_numerator / checked.conversion_denominator;
    perform private.assert_allocation_capacity(source_line_id, base_quantity);
    line_no := line_no + 1;
    insert into public.purchase_order_lines(purchase_order_id, linked_sales_order_line_id, line_number, material_id,
      material_name_snapshot, ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator,
      rounding_mode, unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
      price_source_type, override_by, override_reason)
    values (order_id, source_line_id, line_no, checked.material_id, checked.material_name,
      checked.ordered_uom_id, checked.base_uom_id, checked.quantity, checked.conversion_numerator,
      checked.conversion_denominator, checked.rounding_mode, checked.unit_cost_vnd, checked.line_total_cost_vnd,
      checked.purchase_price_rule_id, checked.purchase_price_rule_version, checked.price_source_type,
      checked.override_by, checked.override_reason)
    returning id into purchase_line_id;
    insert into public.supply_allocations(branch_id, sales_order_line_id, supply_mode, purchase_order_line_id,
      allocated_base_quantity, created_by)
    values (sale_order.branch_id, source_line_id, 'SUPPLIER_DIRECT', purchase_line_id, base_quantity, (select auth.uid()));
  end loop;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_direct_purchase_from_sales_order', payload_hash, 'purchase_order', order_id, now());
  return order_id;
end
$po_body$;
alter function public.create_direct_purchase_from_sales_order(uuid,uuid,jsonb,timestamptz,uuid) owner to postgres;
revoke all on function public.record_stock_count_line(uuid,uuid,numeric,numeric,text,uuid,integer,uuid),public.create_direct_purchase_from_sales_order(uuid,uuid,jsonb,timestamptz,uuid) from public,anon;
grant execute on function public.record_stock_count_line(uuid,uuid,numeric,numeric,text,uuid,integer,uuid),public.create_direct_purchase_from_sales_order(uuid,uuid,jsonb,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
