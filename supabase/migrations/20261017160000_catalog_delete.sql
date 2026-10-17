-- FB3 P1 (17/10/2026, Owner): catalog records get a "Xóa" (delete) button next to "Ngừng dùng".
-- A record is deleted only while nothing uses it: documents, stock movements, debts and the like point at it through
-- foreign keys without ON DELETE CASCADE, so the delete fails with 23503 and nothing is removed. The record's own
-- set-up (selling units, prices, stock thresholds, a customer's unused sites) is removed with it. A record in use
-- stays and can be stopped instead. Same permission per kind as creating/editing it; one receipt per operation; audited.
begin;

create or replace function public.delete_catalog_record(kind text, target_id uuid, target_branch_id uuid, change_reason text, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  tab text;
  old_row jsonb;
  parent_branch uuid;
  hash text;
  receipt public.command_receipts%rowtype;
  label text;
begin
  -- Fixed table per kind; the table name never comes from the caller.
  tab := case kind
    when 'materials' then 'materials' when 'units' then 'units_of_measure' when 'groups' then 'material_groups'
    when 'customers' then 'customers' when 'suppliers' then 'suppliers' when 'sites' then 'customer_sites'
    when 'warehouses' then 'warehouses' when 'vehicles' then 'vehicles' when 'machines' then 'machines'
    when 'conversions' then 'material_uom_conversions' end;
  if tab is null then raise exception 'unsupported_catalog' using errcode = '22023'; end if;
  if auth.uid() is null or target_branch_id is null
    or not private.master_command_allowed((case when kind in ('customers', 'sites') then 'save_customer_site_profile' else 'save_catalog_record' end), kind, target_branch_id)
  then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_id is null or delete_catalog_record.operation_id is null or char_length(trim(coalesce(change_reason, ''))) not between 3 and 300 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  hash := private.command_payload_hash(jsonb_build_object('kind', kind, 'target', target_id, 'branch', target_branch_id, 'reason', trim(change_reason)));
  perform pg_advisory_xact_lock(hashtextextended(delete_catalog_record.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = delete_catalog_record.operation_id;
  if found then
    if receipt.command_name <> 'delete_catalog_record' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', tab) into old_row using target_id;
  if old_row is null then raise exception 'record_missing' using errcode = 'PT409'; end if;
  if tab in ('customers', 'suppliers', 'warehouses', 'vehicles', 'machines')
    and (old_row->>'branch_id')::uuid is distinct from target_branch_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if tab = 'customer_sites' then
    select c.branch_id into parent_branch from public.customers c where c.id = (old_row->>'customer_id')::uuid;
    if parent_branch is distinct from target_branch_id then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  -- The record's own set-up goes with it (selling units, prices, stock thresholds, a customer's sites and portal access,
  -- a supplier's purchase prices). Any of those already used by a document still blocks, and the subtransaction below
  -- then undoes every delete in it.
  begin
    if tab = 'materials' then
      delete from public.material_uom_conversions c where c.material_id = target_id;
      delete from public.pricing_rules r where r.material_id = target_id;
      delete from public.purchase_price_rules r where r.material_id = target_id;
      delete from public.inventory_stock_thresholds t where t.material_id = target_id;
    elsif tab = 'customers' then
      delete from public.pricing_rules r where r.customer_id = target_id;
      delete from public.customer_portal_memberships m where m.customer_id = target_id;
      delete from public.customer_sites s where s.customer_id = target_id;
    elsif tab = 'suppliers' then
      delete from public.purchase_price_rules r where r.supplier_id = target_id;
    elsif tab = 'material_groups' then
      delete from public.pricing_rules r where r.material_group_id = target_id;
    elsif tab = 'warehouses' then
      delete from public.inventory_stock_thresholds t where t.warehouse_id = target_id;
    end if;
    execute format('delete from public.%I t where t.id = $1', tab) using target_id;
  exception when foreign_key_violation then
    raise exception 'catalog_record_in_use' using errcode = '23503';
  end;

  -- The row is gone, so the audit reason keeps what it was.
  label := left(concat_ws(' ', old_row->>'code', coalesce(old_row->>'name', old_row->>'display_name', old_row->>'plate_number', old_row->>'symbol')), 150);
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), target_branch_id, 'catalog.delete', tab, target_id, delete_catalog_record.operation_id, array['deleted'],
    left(trim(change_reason) || ' · đã xóa ' || coalesce(nullif(label, ''), target_id::text), 500));
  insert into public.command_receipts values (delete_catalog_record.operation_id, auth.uid(), 'delete_catalog_record', hash, 'catalog_record', target_id, now());
  return target_id;
end
$function$;

revoke all on function public.delete_catalog_record(text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.delete_catalog_record(text, uuid, uuid, text, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
