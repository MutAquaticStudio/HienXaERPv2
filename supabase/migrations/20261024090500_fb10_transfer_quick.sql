-- FB10 (5.2): warehouse transfers like KiotViet. A transfer took one material per form in base units, then separate
-- forms per shipment lot ("Đợt xuất") with raw ids. Now:
-- * create_warehouse_transfers: several materials at once, each quantity in a unit of the material (bao, tấn…) converted
--   to the base unit by the material's own conversions; optionally shipped at once ("Xuất kho ngay"). One transfer per
--   material as before (same numbering, permissions, stock checks); a retry replays every step.
-- * quick_warehouse_transfer_step: one tap "Xuất kho" (ship what is left of the plan) or "Nhận đủ" (receive everything
--   still on the way, lot by lot). Shortage reports and loss approval keep their own forms.
begin;

create or replace function public.create_warehouse_transfers(target_branch_id uuid,from_warehouse_id uuid,to_warehouse_id uuid,
  transfer_lines jsonb,ship_now boolean,transfer_note text,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare receipt public.command_receipts%rowtype;h text;item jsonb;n integer:=0;material public.materials%rowtype;qty numeric;factor numeric;
  base numeric;transfer_id uuid;first_transfer uuid;t public.warehouse_transfers%rowtype;note text;
begin
  if not private.has_permission(target_branch_id,'inventory.reserve') then raise exception 'forbidden' using errcode='42501';end if;
  if operation_id is null or transfer_lines is null or jsonb_typeof(transfer_lines)<>'array' or jsonb_array_length(transfer_lines) not between 1 and 50
    or length(coalesce(transfer_note,''))>300 then raise exception 'invalid_warehouse_transfer' using errcode='22023';end if;
  note:=coalesce(nullif(trim(transfer_note),''),'Chuyển kho');
  if char_length(note)<3 then note:='Chuyển kho: '||note;end if;
  h:=private.command_payload_hash(jsonb_build_array(target_branch_id,from_warehouse_id,to_warehouse_id,transfer_lines,coalesce(ship_now,false),note));
  perform pg_advisory_xact_lock(hashtextextended('create_warehouse_transfers:'||operation_id::text,0));
  select * into receipt from public.command_receipts r where r.operation_id=create_warehouse_transfers.operation_id;
  if found then
    if receipt.command_name<>'create_warehouse_transfers' or receipt.payload_hash<>h or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode='23505';end if;
    return receipt.result_entity_id;
  end if;
  for item in select value from jsonb_array_elements(transfer_lines) loop
    n:=n+1;
    begin qty:=(item->>'quantity')::numeric; exception when others then raise exception 'invalid_warehouse_transfer' using errcode='22023'; end;
    select * into material from public.materials m where m.id=(item->>'material_id')::uuid and m.active;
    if material.id is null or qty is null or qty<=0 or scale(qty)>6 then raise exception 'invalid_warehouse_transfer' using errcode='22023';end if;
    -- The unit staff count in (bao, tấn) converts with the material's own conversions.
    factor:=case when coalesce((item->>'uom_id')::uuid,material.base_uom_id)=material.base_uom_id then 1
      else private.capacity_factor(material.id,(item->>'uom_id')::uuid,material.base_uom_id,now()) end;
    if factor is null or factor<=0 then raise exception 'transfer_unit_conversion_missing' using errcode='22023';end if;
    base:=round(qty*factor,6);
    transfer_id:=public.create_warehouse_transfer(target_branch_id,from_warehouse_id,to_warehouse_id,material.id,base,note,
      private.derived_operation_uuid(operation_id,'transfer:'||n));
    first_transfer:=coalesce(first_transfer,transfer_id);
    if coalesce(ship_now,false) then
      select * into t from public.warehouse_transfers where id=transfer_id;
      perform public.record_warehouse_transfer_event(transfer_id,'DISPATCH',null,null,base,'Xuất kho',t.version,
        private.derived_operation_uuid(operation_id,'ship:'||n));
    end if;
  end loop;
  insert into public.command_receipts values(operation_id,auth.uid(),'create_warehouse_transfers',h,'warehouse_transfer',first_transfer,now());
  return first_transfer;
end $function$;

create or replace function public.quick_warehouse_transfer_step(target_transfer_id uuid,step text,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare t public.warehouse_transfers%rowtype;receipt public.command_receipts%rowtype;h text;shipped numeric;lot record;n integer:=0;left_qty numeric;
begin
  select * into t from public.warehouse_transfers where id=target_transfer_id;
  if t.id is null or step not in ('DISPATCH_ALL','RECEIVE_ALL')
    or not private.has_permission(t.branch_id,case step when 'DISPATCH_ALL' then 'inventory.reserve' else 'inventory.receive' end) then
    raise exception 'forbidden' using errcode='42501';end if;
  if operation_id is null then raise exception 'invalid_warehouse_transfer' using errcode='22023';end if;
  h:=private.command_payload_hash(jsonb_build_array(target_transfer_id,step));
  perform pg_advisory_xact_lock(hashtextextended('quick_warehouse_transfer_step:'||operation_id::text,0));
  select * into receipt from public.command_receipts r where r.operation_id=quick_warehouse_transfer_step.operation_id;
  if found then
    if receipt.command_name<>'quick_warehouse_transfer_step' or receipt.payload_hash<>h or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode='23505';end if;
    return receipt.result_entity_id;
  end if;
  if step='DISPATCH_ALL' then
    select coalesce(sum(e.base_quantity),0) into shipped from public.warehouse_transfer_events e where e.transfer_id=t.id and e.event_kind='DISPATCH';
    if t.dispatch_closed or shipped>=t.planned_base_quantity then raise exception 'transfer_nothing_to_ship' using errcode='23514';end if;
    perform public.record_warehouse_transfer_event(t.id,'DISPATCH',null,null,t.planned_base_quantity-shipped,'Xuất kho',t.version,
      private.derived_operation_uuid(operation_id,'ship'));
  else
    for lot in select e.id,e.base_quantity-coalesce((select sum(x.base_quantity) from public.warehouse_transfer_events x
        where x.source_dispatch_id=e.id and x.event_kind in ('RECEIVE','APPROVE_LOSS')),0)
        -- An open shortage report keeps its part out of "Nhận đủ" until it is received or written off by its own form.
        -coalesce((select sum(greatest(s.base_quantity-coalesce((select sum(y.base_quantity) from public.warehouse_transfer_events y
          where y.source_issue_id=s.id and y.event_kind in ('RECEIVE','APPROVE_LOSS')),0),0)) from public.warehouse_transfer_events s
        where s.source_dispatch_id=e.id and s.event_kind='REPORT_SHORTAGE'),0) remaining
      from public.warehouse_transfer_events e where e.transfer_id=t.id and e.event_kind='DISPATCH' order by e.recorded_at,e.id loop
      continue when lot.remaining<=0;
      n:=n+1;
      select * into t from public.warehouse_transfers where id=target_transfer_id;
      perform public.record_warehouse_transfer_event(t.id,'RECEIVE',lot.id,null,lot.remaining,'Nhận đủ',t.version,
        private.derived_operation_uuid(operation_id,'receive:'||n));
    end loop;
    if n=0 then raise exception 'transfer_nothing_to_receive' using errcode='23514';end if;
  end if;
  insert into public.command_receipts values(operation_id,auth.uid(),'quick_warehouse_transfer_step',h,'warehouse_transfer',t.id,now());
  return t.id;
end $function$;

revoke all on function public.create_warehouse_transfers(uuid,uuid,uuid,jsonb,boolean,text,uuid),public.quick_warehouse_transfer_step(uuid,text,uuid) from public,anon;
grant execute on function public.create_warehouse_transfers(uuid,uuid,uuid,jsonb,boolean,text,uuid),public.quick_warehouse_transfer_step(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
