create table public.invoice_intents (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_name_snapshot text not null,
  source_obligation_id uuid not null references public.receivable_obligations(id) on delete restrict,
  source_type text not null check (source_type in ('DELIVERY_VERIFICATION','SERVICE_VERIFICATION')),
  source_id uuid not null,
  source_amount_vnd bigint not null check (source_amount_vnd > 0),
  billing_verified_at timestamptz not null,
  invoice_due_at timestamptz,
  policy_state text not null default 'AWAITING_POLICY' check (policy_state in ('AWAITING_POLICY','POLICY_CONFIRMED')),
  status text not null default 'DRAFT' check (status in ('DRAFT','BUSINESS_APPROVED','CANCELLED')),
  provider_state text not null default 'NOT_CONFIGURED' check (provider_state = 'NOT_CONFIGURED'),
  provider_reference text,
  legal_invoice_number text,
  issued_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  create_operation_id uuid not null unique,
  review_operation_id uuid unique,
  cancel_operation_id uuid unique,
  check (provider_reference is null and legal_invoice_number is null and issued_at is null),
  check (invoice_due_at is null or policy_state = 'POLICY_CONFIRMED')
);

create index invoice_intents_branch_created_idx on public.invoice_intents(branch_id, created_at desc, id desc);
create index invoice_intents_customer_idx on public.invoice_intents(customer_id, created_at desc);

create table public.invoice_coverage (
  id uuid primary key default gen_random_uuid(),
  source_obligation_id uuid not null references public.receivable_obligations(id) on delete restrict,
  invoice_intent_id uuid not null unique references public.invoice_intents(id) on delete restrict,
  covered_amount_vnd bigint not null check (covered_amount_vnd > 0),
  covered_at timestamptz not null default now(),
  released_at timestamptz
);

create unique index invoice_coverage_one_active_source on public.invoice_coverage(source_obligation_id) where released_at is null;

create table public.invoice_draft_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_intent_id uuid not null references public.invoice_intents(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  source_line_id uuid not null,
  description_snapshot text not null,
  quantity_snapshot numeric(20,6) not null check (quantity_snapshot > 0),
  source_amount_vnd bigint not null check (source_amount_vnd > 0),
  unique (invoice_intent_id, line_number),
  unique (invoice_intent_id, source_line_id)
);

alter table public.invoice_intents enable row level security;
alter table public.invoice_coverage enable row level security;
alter table public.invoice_draft_lines enable row level security;
revoke all on public.invoice_intents, public.invoice_coverage, public.invoice_draft_lines from anon, authenticated;
grant select on public.invoice_intents, public.invoice_coverage, public.invoice_draft_lines to authenticated;

create policy invoice_intents_select on public.invoice_intents for select to authenticated
  using ((select private.has_permission(branch_id, 'finance.ar.read')));
create policy invoice_coverage_select on public.invoice_coverage for select to authenticated
  using (exists (select 1 from public.invoice_intents i where i.id = invoice_intent_id));
create policy invoice_draft_lines_select on public.invoice_draft_lines for select to authenticated
  using (exists (select 1 from public.invoice_intents i where i.id = invoice_intent_id));

create or replace function public.invoice_eligible_sources(target_branch_id uuid, page_size integer)
returns table(
  obligation_id uuid,
  customer_id uuid,
  customer_name text,
  source_type text,
  source_id uuid,
  source_amount_vnd bigint,
  billing_verified_at timestamptz,
  invoice_due_at timestamptz,
  policy_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare bounded_size integer;
begin
  if not private.has_permission(target_branch_id, 'finance.ar.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  bounded_size := least(100, greatest(1, coalesce(page_size, 50)));
  return query
    select o.id, o.customer_id, c.display_name,
      case when o.delivery_verification_id is not null then 'DELIVERY_VERIFICATION' else 'SERVICE_VERIFICATION' end,
      coalesce(o.delivery_verification_id, o.service_verification_id), o.original_amount_vnd,
      coalesce(dv.verified_at, sv.verified_at), null::timestamptz, 'AWAITING_POLICY'::text
    from public.receivable_obligations o
    join public.customers c on c.id = o.customer_id
    left join public.delivery_verifications dv on dv.id = o.delivery_verification_id
    left join public.service_verifications sv on sv.id = o.service_verification_id
    where o.branch_id = target_branch_id
      and (o.delivery_verification_id is not null or o.service_verification_id is not null)
      and not exists (select 1 from public.invoice_coverage ic where ic.source_obligation_id = o.id and ic.released_at is null)
    order by coalesce(dv.verified_at, sv.verified_at) asc, o.id
    limit bounded_size;
end
$$;

create or replace function public.create_invoice_draft(target_obligation_id uuid, operation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  obligation public.receivable_obligations%rowtype;
  source_type text;
  source_id uuid;
  verified_at timestamptz;
  customer_name text;
  invoice_id uuid;
  line_total bigint;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into obligation from public.receivable_obligations o where o.id = target_obligation_id for update;
  if obligation.id is null or not private.has_permission(obligation.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if obligation.opening_source_id is not null or obligation.original_amount_vnd <= 0 then
    raise exception 'invoice_source_ineligible' using errcode = '23514';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('source_obligation_id', target_obligation_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_invoice_draft.operation_id;
  if found then
    if receipt.command_name <> 'create_invoice_draft' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if exists (select 1 from public.invoice_coverage c where c.source_obligation_id = obligation.id and c.released_at is null) then
    raise exception 'invoice_source_already_covered' using errcode = '23505';
  end if;
  select c.display_name into customer_name from public.customers c where c.id = obligation.customer_id;
  if obligation.delivery_verification_id is not null then
    source_type := 'DELIVERY_VERIFICATION';
    source_id := obligation.delivery_verification_id;
    select v.verified_at into verified_at from public.delivery_verifications v where v.id = source_id;
  else
    source_type := 'SERVICE_VERIFICATION';
    source_id := obligation.service_verification_id;
    select v.verified_at into verified_at from public.service_verifications v where v.id = source_id;
  end if;
  if verified_at is null or customer_name is null then
    raise exception 'invoice_source_unverified' using errcode = '23514';
  end if;

  insert into public.invoice_intents(
    branch_id, customer_id, customer_name_snapshot, source_obligation_id,
    source_type, source_id, source_amount_vnd, billing_verified_at, created_by, create_operation_id
  ) values (
    obligation.branch_id, obligation.customer_id, customer_name, obligation.id,
    source_type, source_id, obligation.original_amount_vnd, verified_at, (select auth.uid()), operation_id
  ) returning id into invoice_id;

  if source_type = 'DELIVERY_VERIFICATION' then
    insert into public.invoice_draft_lines(
      invoice_intent_id, line_number, source_line_id, description_snapshot, quantity_snapshot, source_amount_vnd
    )
    select invoice_id, row_number() over(order by vl.id)::integer, vl.id,
      sol.material_name_snapshot, vl.billable_base_quantity, vl.receivable_amount_vnd
    from public.delivery_verification_lines vl
    join public.delivery_lines dl on dl.id = vl.delivery_line_id
    join public.sales_order_lines sol on sol.id = dl.sales_order_line_id
    where vl.delivery_verification_id = source_id
      and vl.billable_base_quantity > 0 and vl.receivable_amount_vnd > 0;
  else
    insert into public.invoice_draft_lines(
      invoice_intent_id, line_number, source_line_id, description_snapshot, quantity_snapshot, source_amount_vnd
    )
    select invoice_id, 1, sv.id, sj.service_type, sv.billable_quantity, sv.billable_amount_vnd
    from public.service_verifications sv
    join public.service_jobs sj on sj.id = sv.service_job_id
    where sv.id = source_id and sv.billable_quantity > 0 and sv.billable_amount_vnd > 0;
  end if;
  select coalesce(sum(l.source_amount_vnd), 0)::bigint into line_total
    from public.invoice_draft_lines l where l.invoice_intent_id = invoice_id;
  if line_total <> obligation.original_amount_vnd then
    raise exception 'invoice_source_amount_mismatch' using errcode = '23514';
  end if;
  insert into public.invoice_coverage(source_obligation_id, invoice_intent_id, covered_amount_vnd)
  values (obligation.id, invoice_id, obligation.original_amount_vnd);
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_invoice_draft', payload_hash, 'invoice_intent', invoice_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), obligation.branch_id, 'invoice_draft.created', 'invoice_intent', invoice_id, operation_id,
    array['source','source_amount','coverage','billing_verified_at']);
  return invoice_id;
end
$$;

create or replace function public.approve_invoice_business(
  target_invoice_id uuid,
  expected_version integer,
  review_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.invoice_intents%rowtype;
  line_total bigint;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into invoice from public.invoice_intents i where i.id = target_invoice_id for update;
  if invoice.id is null or not private.has_permission(invoice.branch_id, 'finance.reconcile') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('invoice_id', target_invoice_id, 'version', expected_version, 'reason', trim(review_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = approve_invoice_business.operation_id;
  if found then
    if receipt.command_name <> 'approve_invoice_business' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if invoice.status <> 'DRAFT' or invoice.version <> expected_version then
    raise exception 'invoice_version_conflict' using errcode = '40001';
  end if;
  if char_length(trim(review_reason)) not between 3 and 500 then
    raise exception 'invoice_review_reason_required' using errcode = '22023';
  end if;
  select coalesce(sum(l.source_amount_vnd), 0)::bigint into line_total from public.invoice_draft_lines l where l.invoice_intent_id = invoice.id;
  if line_total <> invoice.source_amount_vnd or not exists (
    select 1 from public.invoice_coverage c where c.invoice_intent_id = invoice.id and c.released_at is null
  ) then raise exception 'invoice_coverage_invalid' using errcode = '23514'; end if;
  update public.invoice_intents i
    set status = 'BUSINESS_APPROVED', version = i.version + 1,
        reviewed_by = (select auth.uid()), reviewed_at = now(), review_reason = trim(approve_invoice_business.review_reason),
        review_operation_id = approve_invoice_business.operation_id
    where i.id = invoice.id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'approve_invoice_business', payload_hash, 'invoice_intent', invoice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), invoice.branch_id, 'invoice_business.approved', 'invoice_intent', invoice.id, operation_id,
    array['status','reviewed_by'], trim(review_reason));
  return invoice.id;
end
$$;

create or replace function public.cancel_invoice_draft(
  target_invoice_id uuid,
  expected_version integer,
  cancel_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.invoice_intents%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into invoice from public.invoice_intents i where i.id = target_invoice_id for update;
  if invoice.id is null or not private.has_permission(invoice.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('invoice_id', target_invoice_id, 'version', expected_version, 'reason', trim(cancel_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = cancel_invoice_draft.operation_id;
  if found then
    if receipt.command_name <> 'cancel_invoice_draft' or receipt.payload_hash <> payload_hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if invoice.status <> 'DRAFT' or invoice.version <> expected_version then
    raise exception 'invoice_version_conflict' using errcode = '40001';
  end if;
  if char_length(trim(cancel_reason)) not between 3 and 500 then
    raise exception 'invoice_cancel_reason_required' using errcode = '22023';
  end if;
  update public.invoice_intents i
    set status = 'CANCELLED', version = i.version + 1,
        cancelled_by = (select auth.uid()), cancelled_at = now(), cancel_reason = trim(cancel_invoice_draft.cancel_reason),
        cancel_operation_id = cancel_invoice_draft.operation_id
    where i.id = invoice.id;
  update public.invoice_coverage c set released_at = now() where c.invoice_intent_id = invoice.id and c.released_at is null;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'cancel_invoice_draft', payload_hash, 'invoice_intent', invoice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), invoice.branch_id, 'invoice_draft.cancelled', 'invoice_intent', invoice.id, operation_id,
    array['status','coverage'], trim(cancel_reason));
  return invoice.id;
end
$$;

revoke all on function public.invoice_eligible_sources(uuid,integer) from public, anon, authenticated;
revoke all on function public.create_invoice_draft(uuid,uuid) from public, anon, authenticated;
revoke all on function public.approve_invoice_business(uuid,integer,text,uuid) from public, anon, authenticated;
revoke all on function public.cancel_invoice_draft(uuid,integer,text,uuid) from public, anon, authenticated;
grant execute on function public.invoice_eligible_sources(uuid,integer) to authenticated;
grant execute on function public.create_invoice_draft(uuid,uuid) to authenticated;
grant execute on function public.approve_invoice_business(uuid,integer,text,uuid) to authenticated;
grant execute on function public.cancel_invoice_draft(uuid,integer,text,uuid) to authenticated;

comment on table public.invoice_intents is 'Provider-neutral business review only. No tax/legal form defaults, no issue command, no AR/revenue side effect.';
