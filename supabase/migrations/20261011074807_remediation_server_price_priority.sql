-- G04: the server chooses the existing scope/version priority for a newly selected price.
begin;
create function private.preferred_commercial_price_rule(b uuid,c uuid,m uuid,u uuid) returns uuid
 language plpgsql stable security definer set search_path='' as $price$
declare chosen uuid; candidates uuid[];
begin
 with eligible as (
  select p.id,p.version,case p.scope_type when 'CUSTOMER_MATERIAL' then 4 when 'CUSTOMER_GROUP' then 3 when 'CUSTOMER_TIER' then 2 else 1 end priority
  from public.pricing_rules p join public.customers customer on customer.id=c and customer.branch_id=b and customer.active
   join public.materials material on material.id=m and material.active and material.sale_enabled
  where p.branch_id=b and p.price_uom_id=u and p.active
   and p.effective_from<=now() and(p.effective_to is null or p.effective_to>now())
   and((p.scope_type='CUSTOMER_MATERIAL' and p.customer_id=c and p.material_id=m)
    or(p.scope_type='CUSTOMER_GROUP' and p.customer_id=c and p.material_group_id=material.group_id)
    or(p.scope_type='CUSTOMER_TIER' and p.customer_tier_code is not distinct from customer.tier_code and p.material_id=m)
    or(p.scope_type='DEFAULT' and p.material_id=m))
 ), first_priority as(select priority,version from eligible order by priority desc,version desc limit 1)
 select array_agg(e.id) into candidates from eligible e join first_priority p on p.priority=e.priority and p.version=e.version;
 if coalesce(cardinality(candidates),0)=0 then raise exception 'pricing_rule_not_available' using errcode='22023';end if;
 if cardinality(candidates)>1 then raise exception 'pricing_priority_ambiguous' using errcode='22023';end if;
 chosen:=candidates[1];return chosen;
end $price$;
revoke all on function private.preferred_commercial_price_rule(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.assert_commercial_line(target_branch_id uuid, target_customer_id uuid, line jsonb, actor_auth_user_id uuid)
 RETURNS TABLE(material_id uuid, material_name text, ordered_uom_id uuid, base_uom_id uuid, quantity numeric, conversion_numerator numeric, conversion_denominator numeric, rounding_mode text, unit_price_vnd bigint, line_total_vnd bigint, pricing_rule_id uuid, pricing_rule_version integer, price_source_type text, override_by uuid, override_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested_rule public.pricing_rules%rowtype;
  selected_material_group_id uuid;
  selected_customer_tier_code text;
begin
  material_id := (line->>'material_id')::uuid;
  ordered_uom_id := (line->>'ordered_uom_id')::uuid;
  perform private.require_quantity_lines(jsonb_build_array(line),array['quantity','conversion_numerator','conversion_denominator'],false);
  quantity := (line->>'quantity')::numeric;
  conversion_numerator := (line->>'conversion_numerator')::numeric;
  conversion_denominator := (line->>'conversion_denominator')::numeric;
  rounding_mode := line->>'rounding_mode';
  unit_price_vnd := (line->>'unit_price_vnd')::bigint;
  pricing_rule_id := nullif(line->>'pricing_rule_id', '')::uuid;
  pricing_rule_version := nullif(line->>'pricing_rule_version', '')::integer;
  price_source_type := line->>'price_source_type';
  override_reason := nullif(line->>'override_reason', '');
  override_by := case when price_source_type = 'MANUAL_APPROVED' then actor_auth_user_id else null end;

  select m.name, m.base_uom_id, m.group_id into material_name, base_uom_id, selected_material_group_id
  from public.materials m where m.id = material_id and m.active and m.sale_enabled;
  if not found or quantity <= 0 or unit_price_vnd <= 0 or conversion_numerator <= 0 or conversion_denominator <= 0
    or rounding_mode not in ('HALF_UP','DOWN') then
    raise exception 'invalid_commercial_line' using errcode = '22023';
  end if;

  if ordered_uom_id <> base_uom_id and not exists (
    select 1 from public.material_uom_conversions c
    where c.material_id = assert_commercial_line.material_id
      and c.from_uom_id = assert_commercial_line.ordered_uom_id
      and c.to_uom_id = assert_commercial_line.base_uom_id
      and c.active and c.settlement_allowed and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
      and c.numerator = assert_commercial_line.conversion_numerator
      and c.denominator = assert_commercial_line.conversion_denominator
  ) then
    raise exception 'invalid_or_non_settlement_conversion' using errcode = '22023';
  end if;

  if ordered_uom_id = base_uom_id and (conversion_numerator <> 1 or conversion_denominator <> 1) then
    raise exception 'base_uom_conversion_must_be_one' using errcode = '22023';
  end if;

  if price_source_type = 'MANUAL_APPROVED' then
    if override_reason is null or char_length(override_reason) < 3 or not private.has_permission(target_branch_id, 'pricing.manage') then
      raise exception 'manual_price_requires_permission_and_reason' using errcode = '42501';
    end if;
  else
    select * into requested_rule from public.pricing_rules p
    where p.id = assert_commercial_line.pricing_rule_id
      and p.branch_id = target_branch_id
      and p.version = assert_commercial_line.pricing_rule_version
      and p.price_uom_id = assert_commercial_line.ordered_uom_id
      and p.unit_price_vnd = assert_commercial_line.unit_price_vnd
      and p.active
      and p.effective_from <= now() and (p.effective_to is null or p.effective_to > now());
    if not found then raise exception 'pricing_rule_snapshot_mismatch' using errcode = '22023'; end if;
    if requested_rule.source_type is distinct from price_source_type then raise exception 'pricing_source_snapshot_mismatch' using errcode='22023';end if;
    if private.preferred_commercial_price_rule(target_branch_id,target_customer_id,material_id,ordered_uom_id) is distinct from pricing_rule_id
    then raise exception 'pricing_rule_priority_mismatch' using errcode='22023';end if;
    select c.tier_code into selected_customer_tier_code
    from public.customers c where c.id = target_customer_id and c.branch_id = target_branch_id and c.active;
    if not found then raise exception 'invalid_customer' using errcode = '22023'; end if;
    if requested_rule.scope_type = 'CUSTOMER_MATERIAL' and (requested_rule.customer_id <> target_customer_id or requested_rule.material_id <> material_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'CUSTOMER_GROUP' and (requested_rule.customer_id <> target_customer_id or requested_rule.material_group_id <> selected_material_group_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'CUSTOMER_TIER' and (requested_rule.customer_tier_code is distinct from selected_customer_tier_code or requested_rule.material_id <> material_id) then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    elsif requested_rule.scope_type = 'DEFAULT' and requested_rule.material_id <> material_id then
      raise exception 'pricing_scope_mismatch' using errcode = '22023';
    end if;
  end if;

  perform private.require_exact_quantity(quantity*conversion_numerator/conversion_denominator,false);
  line_total_vnd := round(quantity * unit_price_vnd)::bigint;
  return next;
end
$function$
;

create function private.commercial_snapshot_matches(line jsonb,original jsonb) returns boolean language sql immutable set search_path='' as $matches$
select coalesce(original is not null and line->>'source_line_id'=original->>'id'
 and line->>'material_id' is not distinct from original->>'material_id'
 and line->>'ordered_uom_id' is not distinct from original->>'ordered_uom_id'
 and line->>'unit_price_vnd' is not distinct from original->>'unit_price_vnd'
 and line->>'price_source_type' is not distinct from original->>'price_source_type'
 and nullif(line->>'pricing_rule_id','') is not distinct from original->>'pricing_rule_id'
 and nullif(line->>'pricing_rule_version','') is not distinct from original->>'pricing_rule_version'
 and nullif(line->>'override_reason','') is not distinct from original->>'override_reason'
 and (line->>'conversion_numerator')::numeric is not distinct from (original->>'conversion_numerator')::numeric
 and (line->>'conversion_denominator')::numeric is not distinct from (original->>'conversion_denominator')::numeric
 and line->>'rounding_mode' is not distinct from original->>'rounding_mode',false)
$matches$;
revoke all on function private.commercial_snapshot_matches(jsonb,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.assert_preserved_commercial_line(line jsonb, original jsonb)
 RETURNS TABLE(material_id uuid, material_name text, ordered_uom_id uuid, base_uom_id uuid, quantity numeric, conversion_numerator numeric, conversion_denominator numeric, rounding_mode text, unit_price_vnd bigint, line_total_vnd bigint, pricing_rule_id uuid, pricing_rule_version integer, price_source_type text, override_by uuid, override_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.commercial_snapshot_matches(line,original) then raise exception 'commercial_snapshot_not_preserved' using errcode='22023';end if;
 perform private.require_quantity_lines(jsonb_build_array(line),array['quantity','conversion_numerator','conversion_denominator'],false);
 material_id:=(original->>'material_id')::uuid;material_name:=original->>'material_name_snapshot';
 ordered_uom_id:=(original->>'ordered_uom_id')::uuid;base_uom_id:=(original->>'base_uom_id')::uuid;
 quantity:=(line->>'quantity')::numeric;conversion_numerator:=(original->>'conversion_numerator')::numeric;conversion_denominator:=(original->>'conversion_denominator')::numeric;
 rounding_mode:=original->>'rounding_mode';unit_price_vnd:=(original->>'unit_price_vnd')::bigint;
 pricing_rule_id:=nullif(original->>'pricing_rule_id','')::uuid;pricing_rule_version:=nullif(original->>'pricing_rule_version','')::integer;
 price_source_type:=original->>'price_source_type';override_by:=nullif(original->>'override_by','')::uuid;override_reason:=original->>'override_reason';
 perform private.require_exact_quantity(quantity*conversion_numerator/conversion_denominator,false);
 line_total_vnd:=round(quantity*unit_price_vnd)::bigint;
 if line_total_vnd<=0 then raise exception 'invalid_preserved_commercial_total' using errcode='22023';end if;
 return next;
end
$function$;
revoke all on function private.assert_preserved_commercial_line(jsonb,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.update_quote_draft(target_revision_id uuid, expected_version integer, expires_at timestamp with time zone, commercial_terms text, quote_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  revision public.quotation_revisions%rowtype;
  quote public.quotations%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  original_lines jsonb;
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
  perform private.require_quantity_lines(quote_lines,array['quantity'],false);

  if quote.current_revision_id <> target_revision_id or revision.state <> 'DRAFT'
  then raise exception 'quote_revision_not_editable' using errcode = '23514'; end if;
  if revision.draft_version  IS DISTINCT FROM expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if expires_at is null or expires_at <= now() then raise exception 'invalid_quote_expiration' using errcode = '22023'; end if;
  if jsonb_typeof(quote_lines) is distinct from 'array' then raise exception 'quote_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(quote_lines) not between 1 and 50 or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'invalid_draft_payload' using errcode = '22023'; end if;

  select coalesce(jsonb_object_agg(l.id::text, to_jsonb(l)), '{}'::jsonb) into original_lines
  from public.quotation_lines l where l.revision_id = target_revision_id;
  delete from public.quotation_lines where revision_id = target_revision_id;
  for item in select value from jsonb_array_elements(quote_lines) loop
    line_no := line_no + 1;
    if private.commercial_snapshot_matches(item,original_lines -> (item->>'source_line_id')) then
      select * into checked from private.assert_preserved_commercial_line(item, original_lines -> (item->>'source_line_id'));
    else
      select * into checked from private.assert_commercial_line(quote.branch_id, quote.customer_id, item, (select auth.uid()));
    end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_sales_order_draft(target_order_id uuid, expected_version integer, requested_delivery_at timestamp with time zone, commercial_terms text, order_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  order_row public.sales_orders%rowtype;
  receipt public.command_receipts%rowtype;
  payload_hash text;
  original_lines jsonb;
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
  perform private.require_quantity_lines(order_lines,array['quantity'],false);

  if order_row.commercial_state <> 'DRAFT' then raise exception 'sales_order_not_editable' using errcode = '23514'; end if;
  if order_row.draft_version  IS DISTINCT FROM expected_version then raise exception 'draft_version_conflict' using errcode = 'PT409'; end if;
  if jsonb_typeof(order_lines) is distinct from 'array' then raise exception 'order_lines_required' using errcode = '22023'; end if;
  if jsonb_array_length(order_lines) not between 1 and 50 or char_length(coalesce(commercial_terms, '')) > 1000
  then raise exception 'invalid_draft_payload' using errcode = '22023'; end if;

  select coalesce(jsonb_object_agg(l.id::text, to_jsonb(l)), '{}'::jsonb) into original_lines
  from public.sales_order_lines l where l.sales_order_id = target_order_id;
  delete from public.sales_order_lines where sales_order_id = target_order_id;
  for item in select value from jsonb_array_elements(order_lines) loop
    line_no := line_no + 1;
    if private.commercial_snapshot_matches(item,original_lines -> (item->>'source_line_id')) then
      select * into checked from private.assert_preserved_commercial_line(item, original_lines -> (item->>'source_line_id'));
    else
      select * into checked from private.assert_commercial_line(order_row.branch_id, order_row.customer_id, item, (select auth.uid()));
    end if;
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
$function$
;
notify pgrst,'reload schema';
commit;
