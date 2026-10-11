-- G21: audit missing source/work commands in the same transaction as their durable receipt.
-- Record identifiers and field names only; no price, cost, payload or financial values.
begin;
create function private.audit_source_command_receipt() returns trigger
 language plpgsql security definer set search_path='' as $audit$
declare b uuid; source_table text;
begin
 if new.command_name not in (
  'create_sales_order_draft','create_sales_order_from_quote','create_quote_draft','create_quote_revision',
  'create_purchase_order_draft','create_direct_purchase_from_sales_line','create_direct_purchase_from_sales_order',
  'create_linked_direct_drafts','upsert_supply_allocation','reserve_inventory','release_inventory_reservation',
  'create_delivery_from_allocations','create_delivery_from_allocation','verify_supplier_fulfillment',
  'record_compensation_basis','calculate_earning_event','assign_work_item','claim_work_item','start_work_item',
  'submit_work_result','submit_portal_work_result','verify_delivery_work_item','mark_delivery_arrived')
 then return new;end if;
 source_table:=case new.result_entity_type
  when 'sales_order' then 'sales_orders' when 'quotation' then 'quotations'
  when 'purchase_order' then 'purchase_orders' when 'supply_allocation' then 'supply_allocations'
  when 'inventory_reservation' then 'inventory_reservations' when 'delivery' then 'deliveries'
  when 'supplier_fulfillment' then 'supplier_fulfillments' when 'compensation_basis' then 'compensation_manual_bases'
  when 'earning_event' then 'earning_events' when 'work_item' then 'work_items' else null end;
 if source_table is not null then
  execute format('select branch_id from public.%I where id=$1',source_table) into b using new.result_entity_id;
 elsif new.result_entity_type='quotation_revision' then
  select q.branch_id into b from public.quotation_revisions r join public.quotations q on q.id=r.quotation_id where r.id=new.result_entity_id;
 elsif new.result_entity_type='work_item_result' then
  select w.branch_id into b from public.work_item_results r join public.work_items w on w.id=r.work_item_id where r.id=new.result_entity_id;
 elsif new.result_entity_type='work_item_verification' then
  select w.branch_id into b from public.work_item_verifications v join public.work_items w on w.id=v.work_item_id where v.id=new.result_entity_id;
 end if;
 if b is null then raise exception 'command_audit_source_missing' using errcode='23514';end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
 values(new.actor_auth_user_id,b,'command.'||new.command_name,new.result_entity_type,new.result_entity_id,new.operation_id,array['command_result']);
 return new;
end $audit$;
revoke all on function private.audit_source_command_receipt() from public,anon,authenticated,service_role;
create trigger audit_source_command_receipt after insert on public.command_receipts
 for each row execute function private.audit_source_command_receipt();
notify pgrst,'reload schema';
commit;
