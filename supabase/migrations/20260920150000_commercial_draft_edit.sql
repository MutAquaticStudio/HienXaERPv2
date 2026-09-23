alter table public.sales_orders add column draft_version integer not null default 1 check (draft_version > 0);
alter table public.quotation_revisions add column draft_version integer not null default 1 check (draft_version > 0);

create or replace function public.update_sales_order_draft(
  target_order_id uuid, expected_version integer, requested_delivery_at timestamptz,
  commercial_terms text, order_lines jsonb, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  order_row public.sales_orders%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  item jsonb;
  checked record;
  line_no integer := 0;
begin
  select * into order_row from public.sales_orders where id = target_order_id for update;
  if not found then raise exception 'sales_order_not_found' using errcode = '22023'; end if;
  if not private.has_permission(order_row.branch_id, 'orders.create') then raise exception 'forbidden' using errcode = '42501'; end if;

  payload_hash := private.command_payload_hash(jsonb_build_object(
    'order_id', target_order_id, 'version', expected_version, 'delivery_at', requested_delivery_at,
    'terms', commercial_terms, 'lines', order_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_sales_order_draft.operation_id;
  if found then
    if receipt.command_name <> 'update_sales_order_draft' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;

  if order_row.commercial_state <> 'DRAFT' then raise exception 'sales_order_not_editable' using errcode = '23514'; end if;
  if order_row.draft_version <> expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if jsonb_typeof(order_lines) is distinct from 'array' then raise exception 'order_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(order_lines) not between 1 and 50 or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'invalid_draft_payload' using errcode = '22023'; end if;

  delete from public.sales_order_lines where sales_order_id = target_order_id;
  for item in select value from jsonb_array_elements(order_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_commercial_line(order_row.branch_id, order_row.customer_id, item, (select auth.uid()));
    insert into public.sales_order_lines(sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (target_order_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_price_vnd, checked.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason);
  end loop;
  update public.sales_orders set requested_delivery_at = update_sales_order_draft.requested_delivery_at,
    commercial_terms = update_sales_order_draft.commercial_terms, draft_version = draft_version + 1
  where id = target_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'update_sales_order_draft', payload_hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.draft.update', 'sales_order', target_order_id, operation_id,
    array['requested_delivery_at','commercial_terms','lines','draft_version']);
  return target_order_id;
end
$$;

create or replace function public.update_quote_draft(
  target_revision_id uuid, expected_version integer, expires_at timestamptz,
  commercial_terms text, quote_lines jsonb, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  revision public.quotation_revisions%rowtype;
  quote public.quotations%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  item jsonb;
  checked record;
  line_no integer := 0;
  total bigint := 0;
begin
  select * into revision from public.quotation_revisions where id = target_revision_id for update;
  if not found then raise exception 'quote_revision_not_found' using errcode = '22023'; end if;
  select * into quote from public.quotations where id = revision.quotation_id for update;
  if not private.has_permission(quote.branch_id, 'quotation.create') then raise exception 'forbidden' using errcode = '42501'; end if;

  payload_hash := private.command_payload_hash(jsonb_build_object(
    'revision_id', target_revision_id, 'version', expected_version, 'expires_at', expires_at,
    'terms', commercial_terms, 'lines', quote_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = update_quote_draft.operation_id;
  if found then
    if receipt.command_name <> 'update_quote_draft' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id <> (select auth.uid())
    then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;

  if quote.current_revision_id <> target_revision_id or revision.state <> 'DRAFT'
  then raise exception 'quote_revision_not_editable' using errcode = '23514'; end if;
  if revision.draft_version <> expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if expires_at is null or expires_at <= now() then raise exception 'invalid_quote_expiration' using errcode = '22023'; end if;
  if jsonb_typeof(quote_lines) is distinct from 'array' then raise exception 'quote_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(quote_lines) not between 1 and 50 or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'invalid_draft_payload' using errcode = '22023'; end if;

  delete from public.quotation_lines where revision_id = target_revision_id;
  for item in select value from jsonb_array_elements(quote_lines) loop
    line_no := line_no + 1;
    select * into checked from private.assert_commercial_line(quote.branch_id, quote.customer_id, item, (select auth.uid()));
    insert into public.quotation_lines(revision_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id,
      quantity, conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd,
      pricing_rule_id, pricing_rule_version, price_source_type, override_by, override_reason)
    values (target_revision_id, line_no, checked.material_id, checked.material_name, checked.ordered_uom_id, checked.base_uom_id,
      checked.quantity, checked.conversion_numerator, checked.conversion_denominator, checked.rounding_mode,
      checked.unit_price_vnd, checked.line_total_vnd, checked.pricing_rule_id, checked.pricing_rule_version,
      checked.price_source_type, checked.override_by, checked.override_reason);
    total := total + checked.line_total_vnd;
  end loop;
  update public.quotation_revisions set expires_at = update_quote_draft.expires_at,
    commercial_terms = update_quote_draft.commercial_terms, total_vnd = total, draft_version = draft_version + 1
  where id = target_revision_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'update_quote_draft', payload_hash, 'quotation_revision', target_revision_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), quote.branch_id, 'quotation.draft.update', 'quotation_revision', target_revision_id, operation_id,
    array['expires_at','commercial_terms','lines','total_vnd','draft_version']);
  return target_revision_id;
end
$$;

revoke all on function public.update_sales_order_draft(uuid, integer, timestamptz, text, jsonb, uuid) from public, anon;
revoke all on function public.update_quote_draft(uuid, integer, timestamptz, text, jsonb, uuid) from public, anon;
grant execute on function public.update_sales_order_draft(uuid, integer, timestamptz, text, jsonb, uuid) to authenticated;
grant execute on function public.update_quote_draft(uuid, integer, timestamptz, text, jsonb, uuid) to authenticated;
