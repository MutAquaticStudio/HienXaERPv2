-- G21: count provenance is append-only, including creation.
begin;
create trigger stock_count_observations_immutable before update or delete on public.stock_count_observations
 for each row execute function private.reject_r6_posted_mutation();
CREATE OR REPLACE FUNCTION public.open_stock_count(target_branch_id uuid, target_warehouse_id uuid, cutoff_at timestamp with time zone, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare hash text; receipt public.command_receipts%rowtype; count_id uuid;
begin
  if not private.has_permission(target_branch_id, 'inventory.count') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from public.warehouses where id = target_warehouse_id and branch_id = target_branch_id and active for update;
  if not found or cutoff_at is null or cutoff_at > now() then raise exception 'invalid_stock_count_scope' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'warehouse_id', target_warehouse_id, 'cutoff_at', cutoff_at));
  select * into receipt from public.command_receipts where command_receipts.operation_id = open_stock_count.operation_id;
  if found then if receipt.command_name <> 'open_stock_count' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  insert into public.stock_counts(branch_id, warehouse_id, count_number, cutoff_at, created_by)
  values (target_branch_id, target_warehouse_id, 'SC-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.stock_count_number_seq')::text, 6, '0'), cutoff_at, (select auth.uid())) returning id into count_id;
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values((select auth.uid()),target_branch_id,'stock_count.opened','stock_count',count_id,
    open_stock_count.operation_id,array['warehouse_id','cutoff_at','state','version']);
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'open_stock_count', hash, 'stock_count', count_id, now());
  return count_id;
end
$function$
;
commit;
