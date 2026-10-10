-- Forward correction: qualify observation columns against RPC parameter names.
begin;
CREATE OR REPLACE FUNCTION public.record_stock_count_line(target_stock_count_id uuid, target_material_id uuid, counted_base_quantity numeric, adjustment_unit_cost_vnd numeric, reason text, target_evidence_id uuid, expected_count_version integer, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if expected_count_version is null or expected_count_version <= 0 or count_row.state <> 'OPEN' or count_row.version <> expected_count_version or counted_base_quantity < 0 then raise exception 'stock_count_version_conflict' using errcode = 'PT409'; end if;
  if not exists (select 1 from public.materials where id = target_material_id and active) then raise exception 'material_not_found' using errcode = '23503'; end if;
  perform private.assert_verified_evidence(target_evidence_id, count_row.branch_id);
  perform 1 from public.warehouses where id=count_row.warehouse_id for update;
  if exists(select 1 from public.inventory_movements m
    where m.branch_id=count_row.branch_id and m.warehouse_id=count_row.warehouse_id
      and m.material_id=target_material_id
      and (m.occurred_at>count_row.cutoff_at or m.created_at>count_row.cutoff_at))
  then raise exception 'stock_count_cutoff_stale' using errcode='PT409'; end if;
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
  update public.stock_count_lines set
    basis_fingerprint=private.stock_count_basis(count_row.branch_id,count_row.warehouse_id,target_material_id),
    basis_count_version=count_row.version
    where id=line_id;
  insert into public.stock_count_observations(stock_count_line_id,count_version,expected_base_quantity,
    counted_base_quantity,basis_fingerprint,reason,evidence_object_id,recorded_by,operation_id)
  select l.id,count_row.version,l.expected_base_quantity,l.counted_base_quantity,l.basis_fingerprint,
    l.reason,l.evidence_object_id,(select auth.uid()),record_stock_count_line.operation_id
    from public.stock_count_lines l where l.id=line_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
  values((select auth.uid()),count_row.branch_id,'stock_count.line.recorded','stock_count_line',line_id,
    record_stock_count_line.operation_id,array['expected_base_quantity','counted_base_quantity','basis_count_version'],
    nullif(trim(record_stock_count_line.reason),''));
  update public.stock_counts set version = version + 1 where id = target_stock_count_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_stock_count_line', hash, 'stock_count_line', line_id, now());
  return line_id;
end
$function$;
commit;
