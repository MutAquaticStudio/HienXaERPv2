-- FB10 (4.6): "Trả hàng nhập" in one step, like KiotViet. Returning goods to a supplier took six separate steps
-- (open a case in base units, record the physical return, record the supplier's acceptance, approve the payable
-- reduction, then refund or offset), and the quantity box asked for base units while staff count in purchase units
-- (Production log: `return_quantity_exceeds_source`). Now one command takes the lines of a warehouse receipt in the
-- unit they were bought in, converts to base units with the receipt's own ratio, and runs the same existing steps in
-- one transaction: the goods leave the warehouse, the supplier's payable drops by the cost of what went back, and when
-- the purchase was already paid the supplier can refund the money into a chosen fund at once. Each step keeps its own
-- permission check, receipts and audit; the old step-by-step screens stay for cases opened before.
begin;

create or replace view public.supplier_return_receipt_line_read with(security_barrier=true) as
select pr.branch_id,p.supplier_id,s.name supplier_name,pr.id purchase_receipt_id,pr.receipt_number,pr.received_at,
  p.id purchase_order_id,p.purchase_order_number,l.id receipt_line_id,l.material_id,m.code material_code,m.name material_name,
  l.warehouse_id,w.name warehouse_name,u.symbol uom_symbol,bu.symbol base_uom_symbol,
  l.received_quantity::text received_quantity,l.received_base_quantity::text received_base_quantity,
  coalesce(used.qty,0)::text returned_base_quantity,
  round((l.received_base_quantity-coalesce(used.qty,0))*l.received_quantity/l.received_base_quantity,6)::text returnable_quantity,
  l.received_base_quantity>coalesce(used.qty,0) returnable,l.unit_cost_vnd
from public.purchase_receipt_lines l
join public.purchase_receipts pr on pr.id=l.purchase_receipt_id
join public.purchase_orders p on p.id=pr.purchase_order_id
join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id
join public.suppliers s on s.id=p.supplier_id
join public.materials m on m.id=l.material_id
join public.warehouses w on w.id=l.warehouse_id
join public.units_of_measure u on u.id=pl.ordered_uom_id
join public.units_of_measure bu on bu.id=pl.base_uom_id
left join lateral(select sum(case when c.dispatch_closed then coalesce((select sum(e.base_quantity) from public.supplier_return_events e
    where e.case_id=c.id and e.event_kind='PHYSICAL_RETURN'),0) else c.requested_base_quantity end) qty
  from public.supplier_return_cases c where c.source_receipt_line_id=l.id) used on true
where private.has_permission(pr.branch_id,'purchasing.read') or private.has_permission(pr.branch_id,'purchasing.create');
revoke all on public.supplier_return_receipt_line_read from anon,public;
grant select on public.supplier_return_receipt_line_read to authenticated;

-- Steps of one command get their own stable operation ids, so a retry replays every step.
create or replace function private.derived_operation_uuid(parent uuid,step text) returns uuid
language sql immutable set search_path='' as $function$
  select (substr(md5(parent::text||':'||step),1,8)||'-'||substr(md5(parent::text||':'||step),9,4)||'-4'||substr(md5(parent::text||':'||step),14,3)
    ||'-8'||substr(md5(parent::text||':'||step),18,3)||'-'||substr(md5(parent::text||':'||step),21,12))::uuid
$function$;
revoke all on function private.derived_operation_uuid(uuid,text) from public,anon,authenticated;

create or replace function public.complete_supplier_return(target_receipt_id uuid,return_lines jsonb,refund_account_id uuid,
  return_note text,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare pr public.purchase_receipts%rowtype;receipt public.command_receipts%rowtype;h text;item jsonb;n integer:=0;
  src record;qty numeric;base numeric;case_id uuid;first_case uuid;c public.supplier_return_cases%rowtype;event_id uuid;
  credit_id uuid;credit_value bigint;refundable bigint;account public.finance_accounts%rowtype;reason text;
begin
  select * into pr from public.purchase_receipts where id=target_receipt_id;
  if pr.id is null or not private.has_permission(pr.branch_id,'purchasing.create') then raise exception 'forbidden' using errcode='42501';end if;
  if operation_id is null or return_lines is null or jsonb_typeof(return_lines)<>'array' or jsonb_array_length(return_lines) not between 1 and 100
    or length(coalesce(return_note,''))>300 then raise exception 'invalid_supplier_return' using errcode='22023';end if;
  reason:=coalesce(nullif(trim(return_note),''),'Trả hàng nhập');
  if char_length(reason)<3 then reason:='Trả hàng nhập: '||reason;end if;
  h:=private.command_payload_hash(jsonb_build_array(target_receipt_id,return_lines,refund_account_id,reason));
  perform pg_advisory_xact_lock(hashtextextended('complete_supplier_return:'||operation_id::text,0));
  select * into receipt from public.command_receipts r where r.operation_id=complete_supplier_return.operation_id;
  if found then
    if receipt.command_name<>'complete_supplier_return' or receipt.payload_hash<>h or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode='23505';end if;
    return receipt.result_entity_id;
  end if;
  if refund_account_id is not null then
    select * into account from public.finance_accounts a where a.id=refund_account_id and a.branch_id=pr.branch_id and a.active;
    if account.id is null then raise exception 'invalid_finance_account' using errcode='23503';end if;
  end if;
  for item in select value from jsonb_array_elements(return_lines) loop
    n:=n+1;
    begin qty:=(item->>'quantity')::numeric; exception when others then raise exception 'invalid_supplier_return' using errcode='22023'; end;
    if qty is null or qty<=0 or scale(qty)>6 then raise exception 'invalid_supplier_return' using errcode='22023';end if;
    select l.id,l.received_quantity,l.received_base_quantity into src from public.purchase_receipt_lines l
      where l.id=(item->>'receipt_line_id')::uuid and l.purchase_receipt_id=pr.id;
    if src.id is null then raise exception 'supplier_return_source_missing_or_scope_mismatch' using errcode='23514';end if;
    -- The receipt's own ratio converts what staff count (bao, tấn) into base units.
    base:=round(qty*src.received_base_quantity/src.received_quantity,6);
    if base<=0 then raise exception 'invalid_supplier_return' using errcode='22023';end if;
    case_id:=public.create_supplier_return(pr.branch_id,src.id,null,null,base,reason,private.derived_operation_uuid(operation_id,'return:'||n));
    first_case:=coalesce(first_case,case_id);
    select * into c from public.supplier_return_cases where id=case_id;
    perform public.record_supplier_return_event(case_id,'PHYSICAL_RETURN',base,null,reason,c.version,private.derived_operation_uuid(operation_id,'out:'||n));
    select * into c from public.supplier_return_cases where id=case_id;
    event_id:=public.record_supplier_return_event(case_id,'SUPPLIER_ACCEPTANCE',base,c.return_number,reason,c.version,private.derived_operation_uuid(operation_id,'accept:'||n));
    select * into c from public.supplier_return_cases where id=case_id;
    select e.source_value_vnd into credit_value from public.supplier_return_events e where e.id=event_id;
    credit_id:=public.approve_supplier_return_credit(event_id,credit_value,reason,c.version,private.derived_operation_uuid(operation_id,'credit:'||n));
    if account.id is not null then
      refundable:=private.supplier_credit_remaining(credit_id);
      if refundable>0 then
        perform public.refund_supplier_credit(credit_id,account.id,refundable,now(),case account.account_kind when 'CASH' then 'CASH' else 'BANK_TRANSFER' end,
          c.return_number,private.derived_operation_uuid(operation_id,'refund:'||n));
      end if;
    end if;
  end loop;
  insert into public.command_receipts values(operation_id,auth.uid(),'complete_supplier_return',h,'supplier_return_case',first_case,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
    values(auth.uid(),pr.branch_id,'supplier_return.completed','purchase_receipt',pr.id,operation_id,array['lines','payable','refund']);
  return first_case;
end $function$;


revoke all on function public.complete_supplier_return(uuid,jsonb,uuid,text,uuid) from public,anon;
grant execute on function public.complete_supplier_return(uuid,jsonb,uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
