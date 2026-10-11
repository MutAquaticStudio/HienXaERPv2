-- G02/G03: validate manual quantities before storage; split returns use source-line cumulative rounding.
begin;
CREATE OR REPLACE FUNCTION public.record_compensation_basis(target_branch_id uuid, target_employee_id uuid, basis_type text, basis_quantity numeric, period_start date, period_end date, description text, adjusts_earning_event_id uuid, target_evidence_id uuid, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid;
begin
  if not private.has_permission(target_branch_id,'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if basis_type not in ('FIXED_MONTHLY','PER_SHIFT','PER_DAY','BONUS','ADJUSTMENT') or basis_quantity=0 or period_end<period_start or char_length(trim(description)) not between 3 and 500 or ((basis_type='ADJUSTMENT')<>(adjusts_earning_event_id is not null)) then raise exception 'invalid_compensation_basis' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'employee',target_employee_id,'type',basis_type,'quantity',basis_quantity,'from',period_start,'to',period_end,'description',trim(description),'adjusts',adjusts_earning_event_id,'evidence',target_evidence_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id=record_compensation_basis.operation_id;
  if found then if receipt.command_name<>'record_compensation_basis' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  perform private.require_exact_quantity(abs(basis_quantity),false);
  perform 1 from public.employee_branch_access where employee_id=target_employee_id and branch_id=target_branch_id and active; if not found then raise exception 'invalid_basis_employee' using errcode='23503'; end if;
  if adjusts_earning_event_id is not null then perform 1 from public.earning_events where id=adjusts_earning_event_id and employee_id=target_employee_id and approval_state='APPROVED'; if not found then raise exception 'invalid_adjusted_earning' using errcode='23503'; end if; end if;
  if target_evidence_id is not null then perform 1 from public.evidence_objects where id=target_evidence_id and branch_id=target_branch_id and upload_state='VERIFIED'; if not found then raise exception 'evidence_not_verified' using errcode='23503'; end if; end if;
  insert into public.compensation_manual_bases(branch_id,employee_id,basis_type,basis_quantity,period_start,period_end,description,adjusts_earning_event_id,evidence_object_id,recorded_by) values(target_branch_id,target_employee_id,basis_type,basis_quantity,period_start,period_end,trim(description),adjusts_earning_event_id,target_evidence_id,(select auth.uid())) returning id into entity_id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'record_compensation_basis',payload_hash,'compensation_basis',entity_id,now());
  return entity_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.adjust_return_receivable(target_return_case_id uuid, credit_amount_vnd bigint, adjustment_reason text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare case_row public.return_cases%rowtype; vl public.delivery_verification_lines%rowtype; l public.delivery_lines%rowtype;
 obligation public.receivable_obligations%rowtype; receipt public.command_receipts%rowtype; hash text;
 payment_ids uuid[]; credit_id uuid:=gen_random_uuid(); adjustment_id uuid; source record; release_id uuid;
 outstanding bigint; owed bigint; left_to_fund bigint; available bigint; part bigint; source_max bigint; prior_credits bigint; prior_return_quantity numeric; customer_id uuid;
begin
 perform private.lock_saved_command_intent(operation_id,'adjust_return_receivable');
 select * into case_row from public.return_cases where id=target_return_case_id for update;
 select * into vl from public.delivery_verification_lines where id=case_row.delivery_verification_line_id;
 select * into l from public.delivery_lines where id=vl.delivery_line_id;
 select o.customer_id into customer_id from public.sales_orders o join public.deliveries d on d.sales_order_id=o.id where d.id=l.delivery_id;
 select * into obligation from public.receivable_obligations where delivery_verification_id=vl.delivery_verification_id;
 if case_row.id is null or case_row.case_kind<>'CUSTOMER_RETURN' or case_row.state<>'RETURNED'
  or not private.has_permission(case_row.branch_id,'finance.ar.adjust') then raise exception 'return_not_adjustable' using errcode='42501';end if;
 hash:=private.command_payload_hash(jsonb_build_object('return_case_id',target_return_case_id,'amount',credit_amount_vnd,'reason',trim(adjustment_reason)));
 select * into receipt from public.command_receipts where command_receipts.operation_id=adjust_return_receivable.operation_id;
 if found then if receipt.command_name<>'adjust_return_receivable' or receipt.payload_hash<>hash then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;end if;
 if credit_amount_vnd is null or credit_amount_vnd<0 or coalesce(length(trim(adjustment_reason)),0) not between 3 and 500
 then raise exception 'invalid_return_credit' using errcode='22023';end if;
 if exists(select 1 from public.customer_credits c where c.return_case_id=case_row.id)
 then raise exception 'return_credit_already_decided' using errcode='55000';end if;
 if exists(select 1 from public.receivable_adjustments a where a.return_case_id=case_row.id)
 then raise exception 'legacy_return_credit_requires_reconciliation' using errcode='55000';end if;
 -- Lock the receipts first, then the debt. A new payment appearing in that interval requires a clean retry.
 select coalesce(array_agg(distinct a.payment_id),array[]::uuid[]) into payment_ids from public.payment_allocations a
  where a.receivable_obligation_id=obligation.id and a.amount_delta_vnd>0;
 perform 1 from public.payments p where p.id=any(payment_ids) order by p.id for update;
 perform 1 from public.receivable_obligations o where o.id=obligation.id for update;
 if exists(select 1 from public.payment_allocations a where a.receivable_obligation_id=obligation.id
   and a.amount_delta_vnd>0 and not(a.payment_id=any(payment_ids)))
 then raise exception 'return_payment_sources_changed_retry' using errcode='PT409';end if;
 select coalesce(sum(c.approved_credit_vnd),0)::bigint,coalesce(sum(r.base_quantity),0) into prior_credits,prior_return_quantity
  from public.customer_credits c join public.return_cases r on r.id=c.return_case_id where r.delivery_verification_line_id=vl.id;
 source_max:=least(greatest(0,vl.receivable_amount_vnd-prior_credits),greatest(0,round((prior_return_quantity+case_row.base_quantity)*l.unit_price_vnd*l.conversion_denominator/l.conversion_numerator)::bigint-prior_credits));
 if credit_amount_vnd>source_max or prior_credits+credit_amount_vnd>vl.receivable_amount_vnd
 then raise exception 'return_credit_exceeds_source' using errcode='23514';end if;
 outstanding:=case when obligation.id is null then 0 else private.current_receivable_outstanding(obligation.id) end;
 if outstanding<0 then raise exception 'legacy_negative_receivable_requires_reconciliation' using errcode='55000';end if;
 owed:=greatest(0,credit_amount_vnd-outstanding);left_to_fund:=owed;
 if credit_amount_vnd>0 then
  insert into public.receivable_adjustments(obligation_id,amount_delta_vnd,reason,recorded_by,return_case_id,adjustment_kind)
   values(obligation.id,-credit_amount_vnd,trim(adjustment_reason),(select auth.uid()),case_row.id,'RETURN') returning id into adjustment_id;
 end if;
 insert into public.customer_credits(id,branch_id,customer_id,return_case_id,obligation_id,receivable_adjustment_id,approved_credit_vnd,amount_vnd,reason,approved_by)
 values(credit_id,case_row.branch_id,customer_id,case_row.id,obligation.id,adjustment_id,credit_amount_vnd,owed,trim(adjustment_reason),(select auth.uid()));
 for source in select a.* from public.payment_allocations a join public.payments p on p.id=a.payment_id
  where a.receivable_obligation_id=obligation.id and a.amount_delta_vnd>0 and p.direction='RECEIPT'
  and p.reversal_of_payment_id is null and not exists(select 1 from public.payments r where r.reversal_of_payment_id=p.id)
  order by a.payment_id,a.id loop
  exit when left_to_fund=0;
  select(source.amount_delta_vnd+coalesce(sum(a.amount_delta_vnd),0))::bigint into available from public.payment_allocations a where a.reversal_of_allocation_id=source.id;
  part:=least(left_to_fund,available);if part<=0 then continue;end if;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by,source_customer_credit_id)
   values(source.payment_id,obligation.id,-part,source.id,(select auth.uid()),credit_id) returning id into release_id;
  insert into public.customer_credit_funds(credit_id,source_payment_id,released_allocation_id,amount_vnd) values(credit_id,source.payment_id,release_id,part);
  left_to_fund:=left_to_fund-part;
 end loop;
 if left_to_fund<>0 then raise exception 'return_credit_payment_source_missing' using errcode='23514';end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),case_row.branch_id,'customer.credit_approved','customer_credit',credit_id,operation_id,
   array['source_return','receivable_adjustment','released_allocations','credit_funds'],trim(adjustment_reason));
 insert into public.command_receipts values(operation_id,(select auth.uid()),'adjust_return_receivable',hash,
  case when adjustment_id is null then 'customer_credit' else 'receivable_adjustment' end,coalesce(adjustment_id,credit_id),now());
 return coalesce(adjustment_id,credit_id);
end $function$
;
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
CREATE OR REPLACE FUNCTION private.assert_purchase_line(target_branch_id uuid, target_supplier_id uuid, line jsonb, actor_auth_user_id uuid)
 RETURNS TABLE(material_id uuid, material_name text, ordered_uom_id uuid, base_uom_id uuid, quantity numeric, conversion_numerator numeric, conversion_denominator numeric, rounding_mode text, unit_cost_vnd bigint, line_total_cost_vnd bigint, purchase_price_rule_id uuid, purchase_price_rule_version integer, price_source_type text, override_by uuid, override_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare selected_rule public.purchase_price_rules%rowtype;
begin
  material_id := (line->>'material_id')::uuid;
  ordered_uom_id := (line->>'ordered_uom_id')::uuid;
  perform private.require_quantity_lines(jsonb_build_array(line),array['quantity','conversion_numerator','conversion_denominator'],false);
  quantity := (line->>'quantity')::numeric;
  conversion_numerator := (line->>'conversion_numerator')::numeric;
  conversion_denominator := (line->>'conversion_denominator')::numeric;
  rounding_mode := line->>'rounding_mode';
  unit_cost_vnd := (line->>'unit_cost_vnd')::bigint;
  purchase_price_rule_id := nullif(line->>'purchase_price_rule_id', '')::uuid;
  purchase_price_rule_version := nullif(line->>'purchase_price_rule_version', '')::integer;
  price_source_type := line->>'price_source_type';
  override_reason := nullif(line->>'override_reason', '');
  override_by := case when price_source_type = 'MANUAL_APPROVED' then actor_auth_user_id else null end;

  select m.name, m.base_uom_id into material_name, base_uom_id
  from public.materials m where m.id = assert_purchase_line.material_id and m.active and m.purchase_enabled;
  if not found or quantity <= 0 or unit_cost_vnd <= 0 or conversion_numerator <= 0 or conversion_denominator <= 0
    or rounding_mode not in ('HALF_UP','DOWN') then
    raise exception 'invalid_purchase_line' using errcode = '22023';
  end if;
  if ordered_uom_id = base_uom_id and (conversion_numerator <> 1 or conversion_denominator <> 1) then
    raise exception 'base_uom_conversion_must_be_one' using errcode = '22023';
  end if;
  if ordered_uom_id <> base_uom_id and not exists (
    select 1 from public.material_uom_conversions c
    where c.material_id = assert_purchase_line.material_id
      and c.from_uom_id = assert_purchase_line.ordered_uom_id
      and c.to_uom_id = assert_purchase_line.base_uom_id
      and c.numerator = assert_purchase_line.conversion_numerator
      and c.denominator = assert_purchase_line.conversion_denominator
      and c.active and c.settlement_allowed and c.effective_from <= now()
      and (c.effective_to is null or c.effective_to > now())
  ) then raise exception 'invalid_purchase_conversion' using errcode = '22023'; end if;

  if price_source_type = 'MANUAL_APPROVED' then
    if override_reason is null or char_length(override_reason) < 3
      or not private.has_permission(target_branch_id, 'purchasing.price.manage') then
      raise exception 'manual_purchase_price_requires_permission_and_reason' using errcode = '42501';
    end if;
  else
    select * into selected_rule from public.purchase_price_rules r
    where r.id = assert_purchase_line.purchase_price_rule_id
      and r.branch_id = target_branch_id and r.supplier_id = target_supplier_id
      and r.material_id = assert_purchase_line.material_id
      and r.purchase_uom_id = assert_purchase_line.ordered_uom_id
      and r.unit_cost_vnd = assert_purchase_line.unit_cost_vnd
      and r.version = assert_purchase_line.purchase_price_rule_version
      and r.source_type = assert_purchase_line.price_source_type and r.active
      and r.effective_from <= now() and (r.effective_to is null or r.effective_to > now());
    if not found then raise exception 'purchase_price_snapshot_mismatch' using errcode = '22023'; end if;
  end if;
  perform private.require_exact_quantity(quantity*conversion_numerator/conversion_denominator,false);
  line_total_cost_vnd := round(quantity * unit_cost_vnd)::bigint;
  return next;
end
$function$
;
notify pgrst,'reload schema';
commit;
