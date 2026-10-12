-- Metadata reconciliation only. Supplier invoice/credit-note registration never posts AR/AP/cash again.
begin;
create table public.supplier_documents(
 id uuid primary key default gen_random_uuid(),branch_id uuid not null references public.branches(id),supplier_id uuid not null references public.suppliers(id),
 document_kind text not null check(document_kind in('INVOICE','CREDIT_NOTE')),document_number text not null check(char_length(trim(document_number)) between 2 and 100),document_date date not null,
 declared_value_vnd bigint not null check(declared_value_vnd>=0),source_value_vnd bigint not null check(source_value_vnd>=0),
 match_state text not null check(match_state in('MATCHED','VARIANCE_OPEN')),business_state text not null default 'DRAFT' check(business_state in('DRAFT','BUSINESS_APPROVED','CANCELLED')),
 legal_state text not null default 'EXTERNAL_DOCUMENT_UNVERIFIED' check(legal_state='EXTERNAL_DOCUMENT_UNVERIFIED'),version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),reviewed_by uuid references auth.users(id),reviewed_at timestamptz,review_reason text
);
create unique index supplier_document_active_reference on public.supplier_documents(branch_id,supplier_id,document_kind,document_number,document_date) where business_state<>'CANCELLED';
create table public.supplier_document_lines(
 id uuid primary key default gen_random_uuid(),document_id uuid not null references public.supplier_documents(id),line_number integer not null check(line_number>0),
 source_kind text not null check(source_kind in('RECEIPT_LINE','FULFILLMENT_LINE','RETURN_CREDIT')),source_id uuid not null,purchase_order_line_id uuid not null references public.purchase_order_lines(id),
 material_id uuid not null references public.materials(id),document_uom_id uuid not null references public.units_of_measure(id),
 source_quantity numeric(20,6) not null check(source_quantity>0),document_quantity numeric(20,6) not null check(document_quantity>0),source_unit_cost numeric(20,6) not null check(source_unit_cost>0),document_unit_cost numeric(20,6) not null check(document_unit_cost>=0),
 source_value_vnd bigint not null check(source_value_vnd>=0),document_value_vnd bigint not null check(document_value_vnd>=0),approved_return_charge_vnd bigint not null default 0 check(approved_return_charge_vnd>=0),
 match_result text not null check(match_result in('MATCHED','MATCHED_APPROVED_RETURN_CHARGE','QUANTITY_VARIANCE','PRICE_VARIANCE','VALUE_VARIANCE','ARITHMETIC_VARIANCE')),
 covered boolean not null default true,unique(document_id,line_number)
);
create unique index supplier_document_source_coverage on public.supplier_document_lines(source_kind,source_id) where covered;
alter table public.supplier_documents enable row level security;alter table public.supplier_document_lines enable row level security;
create policy supplier_document_read on public.supplier_documents for select to authenticated using(private.has_permission(branch_id,'finance.ap.read'));
create policy supplier_document_line_read on public.supplier_document_lines for select to authenticated using(exists(select 1 from public.supplier_documents d where d.id=document_id and private.has_permission(d.branch_id,'finance.ap.read')));
grant select on public.supplier_documents,public.supplier_document_lines to authenticated;
revoke insert,update,delete on public.supplier_documents,public.supplier_document_lines from authenticated,anon;
create function private.guard_supplier_document_line() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if tg_op='UPDATE' and old.covered and not new.covered and to_jsonb(new)-'covered'=to_jsonb(old)-'covered'
 and exists(select 1 from public.supplier_documents d where d.id=old.document_id and d.business_state='CANCELLED') then return new;end if;
 raise exception 'supplier_document_source_snapshot_immutable' using errcode='55000';
end $fn$;
revoke all on function private.guard_supplier_document_line() from public,anon,authenticated,service_role;
create trigger supplier_document_line_immutable before update or delete on public.supplier_document_lines for each row execute function private.guard_supplier_document_line();

create function private.supplier_document_source(target_kind text,target_id uuid,target_branch_id uuid,target_supplier_id uuid)
 returns table(purchase_line_id uuid,material_id uuid,uom_id uuid,quantity numeric,unit_cost numeric,value_vnd bigint,return_charge_vnd bigint)
 language plpgsql stable security definer set search_path='' as $fn$
begin
 if target_kind='RECEIPT_LINE' then
  return query select pl.id,l.material_id,pl.ordered_uom_id,l.received_quantity,l.unit_cost_vnd::numeric,l.inventory_value_vnd,0::bigint
   from public.purchase_receipt_lines l join public.purchase_receipts r on r.id=l.purchase_receipt_id join public.purchase_orders p on p.id=r.purchase_order_id
   join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id where l.id=target_id and r.branch_id=target_branch_id and p.supplier_id=target_supplier_id;
 elsif target_kind='FULFILLMENT_LINE' then
  return query select pl.id,pl.material_id,pl.ordered_uom_id,l.supplier_quantity,pl.unit_cost_vnd::numeric,l.payable_amount_vnd,0::bigint
   from public.supplier_fulfillment_lines l join public.supplier_fulfillments f on f.id=l.supplier_fulfillment_id join public.purchase_orders p on p.id=f.purchase_order_id
   join public.purchase_order_lines pl on pl.id=l.purchase_order_line_id where l.id=target_id and f.branch_id=target_branch_id and p.supplier_id=target_supplier_id;
 elsif target_kind='RETURN_CREDIT' then
  return query select pl.id,c.material_id,c.base_uom_id,e.base_quantity,round(pl.unit_cost_vnd::numeric*pl.conversion_denominator/pl.conversion_numerator,6),credit.approved_credit_vnd,e.source_value_vnd-credit.approved_credit_vnd
   from public.supplier_return_credits credit join public.supplier_return_cases c on c.id=credit.case_id join public.supplier_return_events e on e.id=credit.acceptance_event_id
   left join public.purchase_receipt_lines rl on rl.id=c.source_receipt_line_id left join public.supplier_fulfillment_lines fl on fl.id=c.source_fulfillment_line_id
   join public.purchase_order_lines pl on pl.id=coalesce(rl.purchase_order_line_id,fl.purchase_order_line_id)
   where credit.id=target_id and credit.branch_id=target_branch_id and credit.supplier_id=target_supplier_id;
 end if;
end $fn$;
revoke all on function private.supplier_document_source(text,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.register_supplier_document(target_branch_id uuid,target_supplier_id uuid,target_document_kind text,target_document_number text,target_document_date date,declared_total_vnd bigint,document_lines jsonb,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
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
  perform private.require_exact_quantity(qty);perform private.require_exact_quantity(price,target_document_kind='CREDIT_NOTE');
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
end $fn$;

create function public.review_supplier_document(target_document_id uuid,review_decision text,review_reason text,expected_version integer,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
declare d public.supplier_documents%rowtype;r public.command_receipts%rowtype;h text;
begin
 select * into d from public.supplier_documents where id=target_document_id;
 if d.id is null or not private.has_permission(d.branch_id,case when review_decision='CANCEL' then 'finance.ap.adjust' else 'finance.reconcile' end) then raise exception 'forbidden' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'review_supplier_document');perform pg_advisory_xact_lock(hashtextextended('supplier_document:'||operation_id::text,0));
 h:=private.command_payload_hash(jsonb_build_array(target_document_id,review_decision,trim(review_reason),expected_version));select * into r from public.command_receipts where command_receipts.operation_id=review_supplier_document.operation_id;
 if found then if r.command_name<>'review_supplier_document' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 select * into d from public.supplier_documents where id=target_document_id for update;
 if d.version is distinct from expected_version or d.business_state<>'DRAFT' then raise exception 'supplier_document_version_conflict' using errcode='PT409';end if;
 if operation_id is null or review_decision is null or review_decision not in('APPROVE_MATCH','CANCEL') or review_reason is null or char_length(trim(review_reason)) not between 3 and 500 then raise exception 'invalid_supplier_document_review' using errcode='22023';end if;
 if review_decision='APPROVE_MATCH' and d.match_state<>'MATCHED' then raise exception 'supplier_document_variance_requires_correct_sources_or_document' using errcode='23514';end if;
 update public.supplier_documents set business_state=case when review_decision='CANCEL' then 'CANCELLED' else 'BUSINESS_APPROVED' end,version=version+1,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=trim(review_supplier_document.review_reason) where id=d.id;
 if review_decision='CANCEL' then update public.supplier_document_lines set covered=false where document_id=d.id;end if;
 insert into public.command_receipts values(operation_id,auth.uid(),'review_supplier_document',h,'supplier_document',d.id,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values(auth.uid(),d.branch_id,'supplier_document.'||lower(review_decision),'supplier_document',d.id,operation_id,array['business_state','version','source_coverage'],trim(review_reason));return d.id;
end $fn$;
revoke all on function public.register_supplier_document(uuid,uuid,text,text,date,bigint,jsonb,uuid),public.review_supplier_document(uuid,text,text,integer,uuid) from public,anon;
grant execute on function public.register_supplier_document(uuid,uuid,text,text,date,bigint,jsonb,uuid),public.review_supplier_document(uuid,text,text,integer,uuid) to authenticated;
create view public.supplier_document_read with(security_invoker=true) as select d.id,d.branch_id,d.supplier_id,s.name supplier_name,d.document_kind,d.document_number,d.document_date,d.declared_value_vnd::text,d.source_value_vnd::text,d.match_state,d.business_state,d.legal_state,d.version,d.created_at,d.reviewed_at,d.review_reason from public.supplier_documents d join public.suppliers s on s.id=d.supplier_id;
create view public.supplier_document_line_read with(security_invoker=true) as select l.id,l.document_id,l.line_number,l.source_kind,l.source_id,l.purchase_order_line_id,l.material_id,m.name material_name,l.document_uom_id,u.symbol uom_symbol,l.source_quantity::text,l.document_quantity::text,l.source_unit_cost::text,l.document_unit_cost::text,l.source_value_vnd::text,l.document_value_vnd::text,l.approved_return_charge_vnd::text,l.match_result,l.covered from public.supplier_document_lines l join public.materials m on m.id=l.material_id join public.units_of_measure u on u.id=l.document_uom_id;
grant select on public.supplier_document_read,public.supplier_document_line_read to authenticated;
notify pgrst,'reload schema';
commit;
