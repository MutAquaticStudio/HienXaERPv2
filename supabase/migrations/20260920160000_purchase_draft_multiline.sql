alter table public.purchase_orders add column draft_version integer not null default 1 check (draft_version > 0);

create or replace view public.purchase_order_line_read with (security_barrier = true) as
select l.id, l.purchase_order_id, l.linked_sales_order_line_id, l.line_number,
  l.material_id, l.material_name_snapshot, l.ordered_uom_id, l.base_uom_id,
  l.quantity::text as quantity, l.conversion_numerator::text as conversion_numerator,
  l.conversion_denominator::text as conversion_denominator, l.rounding_mode,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.unit_cost_vnd::text else null end as unit_cost_vnd,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.line_total_cost_vnd::text else null end as line_total_cost_vnd,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.purchase_price_rule_id else null end as purchase_price_rule_id,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.purchase_price_rule_version else null end as purchase_price_rule_version,
  case when private.has_permission(p.branch_id, 'purchasing.price.read') then l.price_source_type else null end as price_source_type,
  case when private.has_permission(p.branch_id, 'purchasing.price.manage') then l.override_reason else null end as override_reason
from public.purchase_order_lines l join public.purchase_orders p on p.id = l.purchase_order_id
where private.has_permission(p.branch_id, 'purchasing.read');

create or replace function public.update_purchase_order_draft(
  target_purchase_order_id uuid, expected_version integer, expected_at timestamptz,
  commercial_terms text, purchase_lines jsonb, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  order_row public.purchase_orders%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  item jsonb;
  checked record;
  line_no integer := 0;
begin
  select * into order_row from public.purchase_orders where id = target_purchase_order_id for update;
  if not found then raise exception 'purchase_order_not_found' using errcode = '22023'; end if;
  if not private.has_permission(order_row.branch_id, 'purchasing.create') then raise exception 'forbidden' using errcode = '42501'; end if;

  payload_hash := private.command_payload_hash(jsonb_build_object(
    'purchase_order_id', target_purchase_order_id, 'version', expected_version,
    'expected_at', expected_at, 'terms', commercial_terms, 'lines', purchase_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_purchase_order_draft.operation_id;
  if found then
    if receipt.command_name <> 'update_purchase_order_draft' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;

  if order_row.state <> 'DRAFT' then raise exception 'purchase_order_not_editable' using errcode = '23514'; end if;
  if order_row.destination_type <> 'WAREHOUSE' or order_row.source_sales_order_id is not null
  then raise exception 'source_linked_purchase_requires_adjustment' using errcode = '23514'; end if;
  if order_row.draft_version <> expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if exists (select 1 from public.supply_allocations a join public.purchase_order_lines l on l.id = a.purchase_order_line_id where l.purchase_order_id = target_purchase_order_id)
  then raise exception 'purchase_order_has_allocations' using errcode = '23514'; end if;
  if jsonb_typeof(purchase_lines) is distinct from 'array' then raise exception 'purchase_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(purchase_lines) not between 1 and 50 or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'invalid_purchase_draft_payload' using errcode = '22023'; end if;

  delete from public.purchase_order_lines where purchase_order_id = target_purchase_order_id;
  for item in select value from jsonb_array_elements(purchase_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_purchase_line(order_row.branch_id, order_row.supplier_id, item, (select auth.uid()));
    insert into public.purchase_order_lines(purchase_order_id, line_number, material_id, material_name_snapshot,
      ordered_uom_id, base_uom_id, quantity, conversion_numerator, conversion_denominator, rounding_mode,
      unit_cost_vnd, line_total_cost_vnd, purchase_price_rule_id, purchase_price_rule_version,
      price_source_type, override_by, override_reason)
    values (target_purchase_order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_cost_vnd, checked.line_total_cost_vnd, checked.purchase_price_rule_id,
      checked.purchase_price_rule_version, checked.price_source_type, checked.override_by, checked.override_reason);
  end loop;
  update public.purchase_orders set expected_at = update_purchase_order_draft.expected_at,
    commercial_terms = update_purchase_order_draft.commercial_terms, draft_version = draft_version + 1
  where id = target_purchase_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'update_purchase_order_draft', payload_hash, 'purchase_order', target_purchase_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'purchase_order.draft.update', 'purchase_order', target_purchase_order_id, operation_id,
    array['expected_at','commercial_terms','lines','draft_version']);
  return target_purchase_order_id;
end
$$;

revoke all on function public.update_purchase_order_draft(uuid, integer, timestamptz, text, jsonb, uuid) from public, anon;
grant execute on function public.update_purchase_order_draft(uuid, integer, timestamptz, text, jsonb, uuid) to authenticated;
