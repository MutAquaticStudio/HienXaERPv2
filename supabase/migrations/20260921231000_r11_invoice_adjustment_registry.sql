create table public.invoice_adjustment_drafts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  invoice_intent_id uuid not null references public.invoice_intents(id) on delete restrict,
  receivable_adjustment_id uuid not null unique references public.receivable_adjustments(id) on delete restrict,
  amount_delta_vnd bigint not null check (amount_delta_vnd <> 0),
  reason_snapshot text not null,
  status text not null default 'BUSINESS_REVIEW_REQUIRED' check (status = 'BUSINESS_REVIEW_REQUIRED'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  operation_id uuid not null unique
);

create index invoice_adjustments_invoice_idx on public.invoice_adjustment_drafts(invoice_intent_id, created_at desc);

create table public.purchase_invoice_registry (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  payable_obligation_id uuid not null unique references public.payable_obligations(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_name_snapshot text not null,
  source_type text not null check (source_type in ('PURCHASE_RECEIPT','SUPPLIER_FULFILLMENT')),
  source_id uuid not null,
  source_amount_vnd bigint not null check (source_amount_vnd > 0),
  supplier_document_number text,
  supplier_document_date date,
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  document_state text not null check (document_state in ('PENDING_DOCUMENT','SOURCE_EVIDENCE_ATTACHED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  operation_id uuid not null unique,
  check (supplier_document_number is null or char_length(supplier_document_number) between 2 and 100)
);

create index purchase_invoice_registry_branch_idx on public.purchase_invoice_registry(branch_id, created_at desc, id desc);

alter table public.invoice_adjustment_drafts enable row level security;
alter table public.purchase_invoice_registry enable row level security;
revoke all on public.invoice_adjustment_drafts, public.purchase_invoice_registry from anon, authenticated;
grant select on public.invoice_adjustment_drafts, public.purchase_invoice_registry to authenticated;
create policy invoice_adjustment_drafts_select on public.invoice_adjustment_drafts for select to authenticated
  using ((select private.has_permission(branch_id, 'finance.ar.read')));
create policy purchase_invoice_registry_select on public.purchase_invoice_registry for select to authenticated
  using ((select private.has_permission(branch_id, 'finance.ap.read')));

create or replace function public.create_invoice_adjustment_draft(
  target_invoice_id uuid,
  target_receivable_adjustment_id uuid,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.invoice_intents%rowtype;
  adjustment public.receivable_adjustments%rowtype;
  draft_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into invoice from public.invoice_intents i where i.id = target_invoice_id for update;
  if invoice.id is null or not private.has_permission(invoice.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'invoice_id', target_invoice_id, 'adjustment_id', target_receivable_adjustment_id
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_invoice_adjustment_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_invoice_adjustment_draft' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into adjustment from public.receivable_adjustments a where a.id = target_receivable_adjustment_id;
  if invoice.status <> 'BUSINESS_APPROVED' or adjustment.id is null
    or adjustment.obligation_id <> invoice.source_obligation_id or adjustment.amount_delta_vnd = 0 then
    raise exception 'invoice_adjustment_source_invalid' using errcode = '23514';
  end if;
  insert into public.invoice_adjustment_drafts(
    branch_id, invoice_intent_id, receivable_adjustment_id, amount_delta_vnd,
    reason_snapshot, created_by, operation_id
  ) values (
    invoice.branch_id, invoice.id, adjustment.id, adjustment.amount_delta_vnd,
    adjustment.reason, (select auth.uid()), operation_id
  ) returning id into draft_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_invoice_adjustment_draft', payload_hash, 'invoice_adjustment_draft', draft_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), invoice.branch_id, 'invoice_adjustment_draft.created', 'invoice_adjustment_draft', draft_id, operation_id,
    array['source_adjustment','amount_delta','reason']);
  return draft_id;
end
$$;

create or replace function public.register_purchase_invoice_source(
  target_payable_obligation_id uuid,
  target_document_number text,
  target_document_date date,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  obligation public.payable_obligations%rowtype;
  supplier_name text;
  source_type text;
  source_id uuid;
  evidence_id uuid;
  registry_id uuid;
  normalized_number text;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into obligation from public.payable_obligations o where o.id = target_payable_obligation_id for update;
  if obligation.id is null or not private.has_permission(obligation.branch_id, 'finance.ap.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if obligation.supplier_id is null or (obligation.purchase_receipt_id is null and obligation.supplier_fulfillment_id is null) then
    raise exception 'purchase_invoice_source_invalid' using errcode = '23514';
  end if;
  normalized_number := nullif(trim(target_document_number), '');
  if normalized_number is not null and char_length(normalized_number) not between 2 and 100 then
    raise exception 'purchase_invoice_number_invalid' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'obligation_id', target_payable_obligation_id, 'document_number', normalized_number, 'document_date', target_document_date
  ));
  select * into receipt from public.command_receipts where command_receipts.operation_id = register_purchase_invoice_source.operation_id;
  if found then
    if receipt.command_name <> 'register_purchase_invoice_source' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  select s.name into supplier_name from public.suppliers s where s.id = obligation.supplier_id and s.branch_id = obligation.branch_id;
  if supplier_name is null then raise exception 'purchase_invoice_supplier_invalid' using errcode = '23503'; end if;
  if obligation.purchase_receipt_id is not null then
    source_type := 'PURCHASE_RECEIPT';
    source_id := obligation.purchase_receipt_id;
    select r.evidence_object_id into evidence_id from public.purchase_receipts r
      where r.id = source_id and r.branch_id = obligation.branch_id;
  else
    source_type := 'SUPPLIER_FULFILLMENT';
    source_id := obligation.supplier_fulfillment_id;
    select f.evidence_object_id into evidence_id from public.supplier_fulfillments f
      where f.id = source_id and f.branch_id = obligation.branch_id;
  end if;
  if evidence_id is not null and not exists (
    select 1 from public.evidence_objects e
    where e.id = evidence_id and e.branch_id = obligation.branch_id and e.upload_state = 'VERIFIED'
  ) then evidence_id := null; end if;
  insert into public.purchase_invoice_registry(
    branch_id, payable_obligation_id, supplier_id, supplier_name_snapshot,
    source_type, source_id, source_amount_vnd, supplier_document_number,
    supplier_document_date, evidence_object_id, document_state, created_by, operation_id
  ) values (
    obligation.branch_id, obligation.id, obligation.supplier_id, supplier_name,
    source_type, source_id, obligation.original_amount_vnd, normalized_number,
    target_document_date, evidence_id,
    case when evidence_id is null then 'PENDING_DOCUMENT' else 'SOURCE_EVIDENCE_ATTACHED' end,
    (select auth.uid()), operation_id
  ) returning id into registry_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'register_purchase_invoice_source', payload_hash, 'purchase_invoice_registry', registry_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), obligation.branch_id, 'purchase_invoice_source.registered', 'purchase_invoice_registry', registry_id, operation_id,
    array['source','supplier_document','evidence_state']);
  return registry_id;
end
$$;

revoke all on function public.create_invoice_adjustment_draft(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.register_purchase_invoice_source(uuid,text,date,uuid) from public, anon, authenticated;
grant execute on function public.create_invoice_adjustment_draft(uuid,uuid,uuid) to authenticated;
grant execute on function public.register_purchase_invoice_source(uuid,text,date,uuid) to authenticated;

comment on table public.purchase_invoice_registry is 'Supplier document source registry, not legal validation or automatic tax filing.';
