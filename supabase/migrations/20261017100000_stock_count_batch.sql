-- FB2 Đợt 5 (17/10/2026): stock count sheet entered in one go, and cancelling an open count.
-- record_stock_count_lines_batch records many counted lines in one transaction by calling record_stock_count_line for
-- each (same permission, cutoff, exact quantity, variance reason, basis fingerprint and observation history), with
-- nested operation ids derived from the batch's. cancel_stock_count closes an OPEN count without any stock movement.
begin;

create or replace function public.record_stock_count_lines_batch(target_stock_count_id uuid, count_lines jsonb, expected_count_version integer, operation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  count_row public.stock_counts%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  item jsonb;
  line_no integer := 0;
  version_now integer;
  line_ids uuid[] := '{}';
begin
  select * into count_row from public.stock_counts c where c.id = target_stock_count_id for update;
  if count_row.id is null or not private.has_permission(count_row.branch_id, 'inventory.count') then raise exception 'forbidden' using errcode = '42501'; end if;
  if count_lines is null or jsonb_typeof(count_lines) <> 'array' or jsonb_array_length(count_lines) = 0 or jsonb_array_length(count_lines) > 500
  then raise exception 'invalid_stock_count_lines' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(count_lines) x
      where jsonb_typeof(x) <> 'object' or nullif(x->>'material_id', '') is null or nullif(x->>'counted_base_quantity', '') is null)
  then raise exception 'invalid_stock_count_lines' using errcode = '22023'; end if;
  if (select count(distinct x->>'material_id') from jsonb_array_elements(count_lines) x) <> jsonb_array_length(count_lines)
  then raise exception 'duplicate_stock_count_line' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('count_id', target_stock_count_id, 'lines', count_lines, 'version', expected_count_version));
  select * into receipt from public.command_receipts r where r.operation_id = record_stock_count_lines_batch.operation_id;
  if found then
    if receipt.command_name <> 'record_stock_count_lines_batch' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return jsonb_build_object('stock_count_id', target_stock_count_id, 'version', count_row.version, 'replayed', true);
  end if;
  if expected_count_version is null or count_row.state <> 'OPEN' or count_row.version is distinct from expected_count_version
  then raise exception 'stock_count_version_conflict' using errcode = 'PT409'; end if;

  -- Each line bumps the count's version, so the next line is recorded against the version the previous one left.
  version_now := expected_count_version;
  for item in select x from jsonb_array_elements(count_lines) x loop
    line_no := line_no + 1;
    line_ids := line_ids || public.record_stock_count_line(
      target_stock_count_id,
      (item->>'material_id')::uuid,
      (item->>'counted_base_quantity')::numeric,
      nullif(item->>'adjustment_unit_cost_vnd', '')::numeric,
      coalesce(item->>'reason', ''),
      null,
      version_now,
      md5(record_stock_count_lines_batch.operation_id::text || ':line:' || line_no)::uuid);
    version_now := version_now + 1;
  end loop;

  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), count_row.branch_id, 'stock_count.lines_batch_recorded', 'stock_count', target_stock_count_id,
    record_stock_count_lines_batch.operation_id, array['stock_count_lines', 'version']);
  insert into public.command_receipts values (record_stock_count_lines_batch.operation_id, (select auth.uid()), 'record_stock_count_lines_batch', hash,
    'stock_count', target_stock_count_id, now());
  return jsonb_build_object('stock_count_id', target_stock_count_id, 'version', version_now, 'line_ids', to_jsonb(line_ids), 'replayed', false);
end
$function$;

create or replace function public.cancel_stock_count(target_stock_count_id uuid, expected_count_version integer, cancel_reason text, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare count_row public.stock_counts%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into count_row from public.stock_counts c where c.id = target_stock_count_id for update;
  if count_row.id is null or not private.has_permission(count_row.branch_id, 'inventory.count') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(cancel_reason, ''))) < 3 then raise exception 'cancel_reason_required' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('count_id', target_stock_count_id, 'version', expected_count_version, 'reason', trim(cancel_reason)));
  select * into receipt from public.command_receipts r where r.operation_id = cancel_stock_count.operation_id;
  if found then
    if receipt.command_name <> 'cancel_stock_count' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if expected_count_version is null or count_row.state <> 'OPEN' or count_row.version is distinct from expected_count_version
  then raise exception 'stock_count_version_conflict' using errcode = 'PT409'; end if;
  -- Recorded lines and their observations stay as history; nothing is posted to stock.
  update public.stock_counts set state = 'CANCELLED', version = version + 1 where id = target_stock_count_id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), count_row.branch_id, 'stock_count.cancelled', 'stock_count', target_stock_count_id,
    cancel_stock_count.operation_id, array['state', 'version'], trim(cancel_reason));
  insert into public.command_receipts values (cancel_stock_count.operation_id, (select auth.uid()), 'cancel_stock_count', hash, 'stock_count', target_stock_count_id, now());
  return target_stock_count_id;
end
$function$;

revoke all on function public.record_stock_count_lines_batch(uuid, jsonb, integer, uuid), public.cancel_stock_count(uuid, integer, text, uuid) from public, anon;
grant execute on function public.record_stock_count_lines_batch(uuid, jsonb, integer, uuid), public.cancel_stock_count(uuid, integer, text, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
