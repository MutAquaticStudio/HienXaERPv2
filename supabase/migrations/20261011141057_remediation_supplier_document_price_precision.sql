begin;
drop view public.supplier_document_line_read;
alter table public.supplier_document_lines alter column source_unit_cost type numeric(32,6),alter column document_unit_cost type numeric(32,6);
CREATE OR REPLACE FUNCTION public.register_supplier_document(target_branch_id uuid, target_supplier_id uuid, target_document_kind text, target_document_number text, target_document_date date, declared_total_vnd bigint, document_lines jsonb, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.command_receipts%rowtype;h text;did uuid;item jsonb;src record;kind text;sid uuid;qty numeric;price numeric;value_amount bigint;computed bigint;result text;line_index integer:=0;sum_declared bigint:=0;sum_source bigint:=0;has_variance boolean:=false;
begin
 if not private.has_permission(target_branch_id,'finance.ap.adjust') then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'register_supplier_document');perform pg_advisory_xact_lock(hashtextextended('supplier_document:'||operation_id::text,0));
 if operation_id is null or target_document_kind is null or target_document_kind not in('INVOICE','CREDIT_NOTE') or target_document_number is null or char_length(trim(target_document_number)) not between 2 and 100 or target_document_date is null
 or declared_total_vnd is null or declared_total_vnd<0 or document_lines is null or jsonb_typeof(document_lines)<>'array' or jsonb_array_length(document_lines) not between 1 and 100
 then raise exception 'invalid_supplier_document' using errcode='22023';end if;
 h:=private.command_payload_hash(jsonb_build_array(target_branch_id,target_supplier_id,target_document_kind,trim(target_document_number),target_document_date,declared_total_vnd,document_lines));
 select * into r from public.command_receipts where command_receipts.operation_id=register_supplier_document.operation_id;
 if found then if r.command_name<>'register_supplier_document' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 perform 1 from public.suppliers where id=target_supplier_id and branch_id=target_branch_id;if not found then raise exception 'supplier_document_party_scope_mismatch' using errcode='42501';end if;
 insert into public.supplier_documents(branch_id,supplier_id,document_kind,document_number,document_date,declared_value_vnd,source_value_vnd,match_state,created_by)
 values(target_branch_id,target_supplier_id,target_document_kind,trim(target_document_number),target_document_date,declared_total_vnd,0,'VARIANCE_OPEN',auth.uid()) returning id into did;
 for item in select v from jsonb_array_elements(document_lines) v loop
  kind:=item->>'source_kind';sid:=(item->>'source_id')::uuid;qty:=(item->>'document_quantity')::numeric;price:=(item->>'document_unit_cost')::numeric;value_amount:=(item->>'document_value_vnd')::bigint;
  perform private.require_exact_quantity(qty);if price is null or price<0 or price>=100000000000000000000000000 or price>= 'Infinity'::numeric or(target_document_kind='INVOICE' and price=0) or price<>trunc(price,6) then raise exception 'document_price_invalid_or_precision_exceeds_six' using errcode='22023';end if;
  if kind is null or sid is null or value_amount is null or value_amount<0 or (target_document_kind='CREDIT_NOTE') is distinct from(kind='RETURN_CREDIT') then raise exception 'supplier_document_line_kind_invalid' using errcode='22023';end if;
  select * into src from private.supplier_document_source(kind,sid,target_branch_id,target_supplier_id);
  if src.purchase_line_id is null then raise exception 'supplier_document_source_scope_mismatch' using errcode='42501';end if;
  perform 1 from public.purchase_order_lines where id=src.purchase_line_id for update;
  computed:=round(qty*price)::bigint;
  result:=case when qty<>src.quantity then 'QUANTITY_VARIANCE'
   when target_document_kind='CREDIT_NOTE' and value_amount=src.value_vnd and((price=src.unit_cost and abs(computed-value_amount-src.return_charge_vnd)<=1) or computed=value_amount)
    then case when src.return_charge_vnd>0 then 'MATCHED_APPROVED_RETURN_CHARGE' else 'MATCHED' end
   when price<>src.unit_cost then 'PRICE_VARIANCE' when value_amount<>src.value_vnd then 'VALUE_VARIANCE' when abs(computed-value_amount)>1 then 'ARITHMETIC_VARIANCE' else 'MATCHED' end;
  has_variance:=has_variance or result not in('MATCHED','MATCHED_APPROVED_RETURN_CHARGE');line_index:=line_index+1;
  insert into public.supplier_document_lines(document_id,line_number,source_kind,source_id,purchase_order_line_id,material_id,document_uom_id,source_quantity,document_quantity,source_unit_cost,document_unit_cost,source_value_vnd,document_value_vnd,approved_return_charge_vnd,match_result)
  values(did,line_index,kind,sid,src.purchase_line_id,src.material_id,src.uom_id,src.quantity,qty,src.unit_cost,price,src.value_vnd,value_amount,src.return_charge_vnd,result);
  sum_declared:=sum_declared+value_amount;sum_source:=sum_source+src.value_vnd;
 end loop;
 if sum_declared<>declared_total_vnd then raise exception 'supplier_document_total_must_equal_lines' using errcode='23514';end if;
 update public.supplier_documents set source_value_vnd=sum_source,match_state=case when has_variance then 'VARIANCE_OPEN' else 'MATCHED' end where id=did;
 insert into public.command_receipts values(operation_id,auth.uid(),'register_supplier_document',h,'supplier_document',did,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values(auth.uid(),target_branch_id,'supplier_document.registered','supplier_document',did,operation_id,array['supplier_id','document_reference','source_line_coverage','match_state']);return did;
end $function$
;
create view public.supplier_document_line_read with(security_invoker=true) as
 SELECT l.id,
    l.document_id,
    l.line_number,
    l.source_kind,
    l.source_id,
    l.purchase_order_line_id,
    l.material_id,
    m.name AS material_name,
    l.document_uom_id,
    u.symbol AS uom_symbol,
    l.source_quantity::text AS source_quantity,
    l.document_quantity::text AS document_quantity,
    l.source_unit_cost::text AS source_unit_cost,
    l.document_unit_cost::text AS document_unit_cost,
    l.source_value_vnd::text AS source_value_vnd,
    l.document_value_vnd::text AS document_value_vnd,
    l.approved_return_charge_vnd::text AS approved_return_charge_vnd,
    l.match_result,
    l.covered
   FROM supplier_document_lines l
     JOIN materials m ON m.id = l.material_id
     JOIN units_of_measure u ON u.id = l.document_uom_id;;
grant select on public.supplier_document_line_read to authenticated;
notify pgrst,'reload schema';
commit;
