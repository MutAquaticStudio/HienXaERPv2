-- EXPERIMENTAL NATIVE-ONLY TARGET78 BRIDGE. Not a Production migration or deployment instruction.
-- Raw missing-version replay remains FAILED. This reconciles mechanisms on an owned reconstruction.
-- Eight historical ledger versions are NOT marked applied; actual target backup/recovery is still absent.
-- Keep 20261003063723 / 20261007022922 resolve-return safeguards and 20260930101520 PT409.
-- No business opening, activation, payment, inventory movement, Auth message or fixture is created.
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';
do $native_guard$
begin
 if current_database() !~ '^hx_remediation_target78_[a-z0-9_]+$'
 or current_setting('data_directory') <> '/Users/nox/Downloads/HienXaERP-GoLive-Private-20261012/target78-rehearsal/cluster-data'
 or inet_server_port() <> 49761
 then raise exception 'native_target78_only' using errcode='55000';end if;
 if md5(pg_get_functiondef('public.resolve_return_case(uuid,text,uuid,text,uuid,integer,uuid)'::regprocedure))<>'0c38633638835e825862a64116d8875d'
 then raise exception 'target78_return_forward_prestate_mismatch' using errcode='55000';end if;
 if to_regprocedure('public.cancel_planned_delivery(uuid,integer,text,uuid)') is not null
 or to_regprocedure('public.cancel_scheduled_service_job(uuid,integer,text,uuid)') is not null
 or to_regclass('public.inventory_opening_sources') is not null
 or to_regclass('public.cash_opening_balances') is not null
 or to_regclass('private.operational_import_receipts') is not null
 then raise exception 'target78_missing_mechanism_prestate_mismatch' using errcode='55000';end if;
end $native_guard$;

-- Mechanism source supabase/migrations/20260923162705_revoke_uat_worker_compensation_read.sql; source SHA-256 ca8bf947a0d3493dadf225042bf655341fbc3f7f13e6cd8a4547483ca2ab342d
-- Executed bridge SHA-256 ca8bf947a0d3493dadf225042bf655341fbc3f7f13e6cd8a4547483ca2ab342d; historical ledger is not written.
delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.code in ('uat_worker', 'hxqa_worker')
  and rp.permission_code = 'compensation.read';


-- Mechanism source supabase/migrations/20260930024101_cancel_planned_delivery_release_reservations.sql; source SHA-256 d9d8fe0a7fbe728952bc9bc4050e7d4bb08801454c885b1228fdc81523da5482
-- Executed bridge SHA-256 63ae854aa7be404ca3ae38545e653a92b9328537591944badf93bb21e1661170; historical ledger is not written.
-- Cancel only an unstarted delivery. Keep its history, release its stock holds,
-- and make its allocation available to a replacement delivery atomically.
create or replace function public.cancel_planned_delivery(
  target_delivery_id uuid,
  expected_version integer,
  cancellation_reason text,
  operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  delivery public.deliveries%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into delivery from public.deliveries where id = target_delivery_id for update;
  if delivery.id is null or not private.has_permission(delivery.branch_id, 'delivery.exception') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(cancellation_reason)), 0) < 3
    or char_length(trim(cancellation_reason)) > 500 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object(
    'delivery_id', target_delivery_id, 'version', expected_version,
    'reason', trim(cancellation_reason)));
  select * into receipt from public.command_receipts
    where command_receipts.operation_id = cancel_planned_delivery.operation_id;
  if found then
    if receipt.command_name <> 'cancel_planned_delivery' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if delivery.execution_state <> 'PLANNED' or delivery.version <> expected_version then
    raise exception 'delivery_cancel_version_conflict' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.delivery_lines where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_assignments where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_handoffs where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_results where delivery_id = delivery.id)
    or exists (select 1 from public.delivery_verifications where delivery_id = delivery.id) then
    raise exception 'delivery_cancel_not_safe' using errcode = '23514';
  end if;
  perform 1 from public.inventory_reservations reservation
    join public.delivery_lines line on line.id = reservation.delivery_line_id
    where line.delivery_id = delivery.id order by reservation.id for update of reservation;
  if exists (
    select 1 from public.delivery_lines line
    left join public.inventory_reservations reservation on reservation.delivery_line_id = line.id
    where line.delivery_id = delivery.id and (
      (line.source_mode in ('WAREHOUSE', 'SUPPLIER_TO_WAREHOUSE')
        and (reservation.id is null or reservation.state <> 'ACTIVE'))
      or (line.source_mode = 'SUPPLIER_DIRECT' and reservation.id is not null)
    )
  ) then
    raise exception 'delivery_reservation_state_conflict' using errcode = '23514';
  end if;
  update public.inventory_reservations reservation
    set state = 'RELEASED', version = version + 1, finalized_at = now()
    from public.delivery_lines line
    where line.id = reservation.delivery_line_id and line.delivery_id = delivery.id
      and reservation.state = 'ACTIVE';
  update public.deliveries set execution_state = 'CANCELLED', version = version + 1
    where id = delivery.id;
  insert into public.command_receipts values (
    operation_id, (select auth.uid()), 'cancel_planned_delivery', hash,
    'delivery', delivery.id, now());
  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason)
  values (
    (select auth.uid()), delivery.branch_id, 'delivery.cancel', 'delivery', delivery.id,
    operation_id, array['execution_state', 'inventory_reservations'], trim(cancellation_reason));
  return delivery.id;
end
$function$;

revoke all on function public.cancel_planned_delivery(uuid, integer, text, uuid) from public, anon;
grant execute on function public.cancel_planned_delivery(uuid, integer, text, uuid) to authenticated;


-- Mechanism source supabase/migrations/20260930025839_audit_notice_quote_transitions.sql; source SHA-256 e38d8b1e7f111e0faeb4ae7a28faf2f1fbfb1a7b02df0f7b2cef94acf6e25fc9
-- Executed bridge SHA-256 0dc344bc08f787ea9476551f2f65a532ea933f90093dd5712fbac0d4f0b0004f; historical ledger is not written.
-- Keep audit provenance in the same transaction as each reviewed/sent/accepted command.
create or replace function public.review_payment_notice(
  target_payment_notice_id uuid, target_state text, target_review_note text,
  expected_version integer, operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  notice public.payment_notices%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into notice from public.payment_notices n where n.id = target_payment_notice_id;
  if notice.id is null or not private.has_permission(notice.branch_id, 'finance.payment_notice.review') then
    raise exception 'payment_notice_review_forbidden' using errcode = '42501';
  end if;
  if target_state not in ('UNDER_REVIEW','ACCEPTED','REJECTED') then raise exception 'invalid_review_state' using errcode = '22023'; end if;
  if nullif(trim(target_review_note), '') is not null and char_length(trim(target_review_note)) not between 3 and 500 then raise exception 'invalid_review_note' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'notice', target_payment_notice_id, 'state', target_state, 'note', nullif(trim(target_review_note), ''), 'version', expected_version
  ));
  select * into receipt from public.command_receipts r where r.operation_id = review_payment_notice.operation_id;
  if found then
    if receipt.command_name <> 'review_payment_notice' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into notice from public.payment_notices n where n.id = target_payment_notice_id for update;
  if notice.version <> expected_version then raise exception 'stale_payment_notice_version' using errcode = 'PT409'; end if;
  insert into public.payment_notice_review_events(payment_notice_id, from_state, to_state, review_note, reviewed_by)
  values(notice.id, notice.review_state, target_state, nullif(trim(target_review_note), ''), (select auth.uid()));
  update public.payment_notices set
    review_state = target_state,
    version = version + 1,
    review_note = nullif(trim(target_review_note), ''),
    reviewed_by = case when target_state in ('ACCEPTED','REJECTED') then (select auth.uid()) else reviewed_by end,
    reviewed_at = case when target_state in ('ACCEPTED','REJECTED') then now() else reviewed_at end
  where id = notice.id;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'review_payment_notice', payload_hash, 'payment_notice', notice.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), notice.branch_id,
    case target_state when 'REJECTED' then 'payment_notice.rejected'
      when 'ACCEPTED' then 'payment_notice.accepted' else 'payment_notice.under_review' end,
    'payment_notice', notice.id, operation_id, array['review_state', 'review_note'], nullif(trim(target_review_note), ''));
  return notice.id;
end $function$;

create or replace function public.send_quote_revision(target_revision_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare revision public.quotation_revisions%rowtype; quote public.quotations%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select r.* into revision from public.quotation_revisions r where r.id = target_revision_id for update;
  select q.* into quote from public.quotations q where q.id = revision.quotation_id;
  if not private.has_permission(quote.branch_id, 'quotation.send') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('revision_id', target_revision_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = send_quote_revision.operation_id;
  if found then if receipt.command_name <> 'send_quote_revision' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if revision.state <> 'DRAFT' or revision.total_vnd <= 0 then raise exception 'quote_revision_not_sendable' using errcode = '23514'; end if;
  update public.quotation_revisions set state = 'SENT', sent_at = now() where id = target_revision_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'send_quote_revision', hash, 'quotation_revision', target_revision_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), quote.branch_id, 'quotation.send', 'quotation_revision', target_revision_id,
    operation_id, array['state', 'sent_at']);
  return target_revision_id;
end
$function$;

create or replace function public.accept_quote_revision(
  target_revision_id uuid, acceptance_channel text, confirmed_by_name text,
  evidence_object_path text, operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare revision public.quotation_revisions%rowtype; quote public.quotations%rowtype; hash text; receipt public.command_receipts%rowtype; acceptance_id uuid;
begin
  select r.* into revision from public.quotation_revisions r where r.id = target_revision_id for update;
  select q.* into quote from public.quotations q where q.id = revision.quotation_id;
  if not (private.has_permission(quote.branch_id, 'quotation.accept') or private.has_customer_membership(quote.customer_id, array['OWNER','FINANCE_CONTACT'])) then raise exception 'forbidden' using errcode = '42501'; end if;
  if acceptance_channel not in ('PORTAL','PHONE','ZALO','EMAIL','OTHER') then raise exception 'invalid_acceptance_channel' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('revision_id', target_revision_id, 'channel', acceptance_channel, 'confirmed_by', confirmed_by_name, 'evidence', evidence_object_path));
  select * into receipt from public.command_receipts where command_receipts.operation_id = accept_quote_revision.operation_id;
  if found then if receipt.command_name <> 'accept_quote_revision' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if revision.state <> 'SENT' or (revision.expires_at is not null and revision.expires_at <= now()) then raise exception 'quote_revision_not_acceptable' using errcode = '23514'; end if;
  insert into public.quotation_acceptances(revision_id, channel, confirmed_by_name, accepted_by_auth_user_id, evidence_object_path)
  values (target_revision_id, acceptance_channel, confirmed_by_name, (select auth.uid()), evidence_object_path) returning id into acceptance_id;
  update public.quotation_revisions set state = 'ACCEPTED', accepted_at = now() where id = target_revision_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'accept_quote_revision', hash, 'quotation_acceptance', acceptance_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), quote.branch_id, 'quotation.accept', 'quotation_revision', target_revision_id,
    operation_id, array['state', 'accepted_at']);
  return acceptance_id;
end
$function$;


-- Mechanism source supabase/migrations/20260930050137_cancel_scheduled_service_job.sql; source SHA-256 72645a2905ae1a3f2ec5f52441066345f6eef627c384d1be9ac995758eedd7b0
-- Executed bridge SHA-256 6095d8d395c6a7f623823b5ec80650b475213b0425f8449837b4ea5ba6bfefe1; historical ledger is not written.
create or replace function public.cancel_scheduled_service_job(
  target_service_job_id uuid,
  expected_version integer,
  cancellation_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  job public.service_jobs%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into job from public.service_jobs
    where id = target_service_job_id for update;
  if job.id is null or not private.has_permission(job.branch_id, 'service.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(cancellation_reason)), 0) < 3
    or char_length(trim(cancellation_reason)) > 500 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object(
    'service_job_id', target_service_job_id,
    'version', expected_version,
    'reason', trim(cancellation_reason)
  ));
  select * into receipt from public.command_receipts
    where command_receipts.operation_id = cancel_scheduled_service_job.operation_id;
  if found then
    if receipt.command_name <> 'cancel_scheduled_service_job' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if job.execution_state <> 'SCHEDULED' or job.version <> expected_version then
    raise exception 'service_cancel_version_conflict' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.work_items where service_job_id = job.id)
    or exists (select 1 from public.service_verifications where service_job_id = job.id) then
    raise exception 'service_cancel_has_execution' using errcode = '23514';
  end if;
  update public.service_jobs set execution_state = 'CANCELLED', version = version + 1
    where id = job.id;
  insert into public.command_receipts values (
    operation_id, (select auth.uid()), 'cancel_scheduled_service_job', hash,
    'service_job', job.id, now()
  );
  insert into public.audit_events(
    actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason
  ) values (
    (select auth.uid()), job.branch_id, 'service_job.cancel', 'service_job', job.id,
    operation_id, array['execution_state'], trim(cancellation_reason)
  );
  return job.id;
end
$function$;

revoke all on function public.cancel_scheduled_service_job(uuid, integer, text, uuid) from public, anon;
grant execute on function public.cancel_scheduled_service_job(uuid, integer, text, uuid) to authenticated;


-- Mechanism source supabase/migrations/20261002071813_index_quotation_and_customer_credit_lookups.sql; source SHA-256 cca7f71910a12e7e00e7a6e6d3cbe5bd67bcbf898b051d4ee75094ee2ed845a1
-- Executed bridge SHA-256 cca7f71910a12e7e00e7a6e6d3cbe5bd67bcbf898b051d4ee75094ee2ed845a1; historical ledger is not written.
-- Preserve query results, RLS, financial calculations and append-only ledgers.
-- Match quotation_read branch filtering and its deterministic newest-first page.
create index if not exists quotations_branch_created_id_idx
  on public.quotations (branch_id, created_at desc, id desc);

-- customer_credit_exposure restricts these child relations by customer_id.
-- Branch-leading and document-source unique indexes cannot cover that prefix.
create index if not exists receivable_obligations_customer_id_idx
  on public.receivable_obligations (customer_id);

create index if not exists credit_commitments_customer_id_idx
  on public.credit_commitments (customer_id);


-- Mechanism source supabase/migrations/20261008224033_operational_opening_sources.sql; source SHA-256 5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994
-- Executed bridge SHA-256 5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994; historical ledger is not written.
-- Operational opening sources. Never a receipt, stock count, payment or earning.
-- Internal operator commands only. No browser/Data API EXECUTE grant.


create table private.operational_import_receipts (
 operation_id uuid primary key,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 payload_hash text not null,
 actor_id uuid not null references auth.users(id),
 source_payload jsonb not null,
 result jsonb not null,
 recorded_at timestamptz not null default now()
);
revoke all on private.operational_import_receipts from public,anon,authenticated,service_role;
create trigger operational_import_receipts_immutable before update or delete
on private.operational_import_receipts for each row execute function private.reject_immutable_finance_mutation();

create table public.inventory_opening_sources (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id),
 warehouse_id uuid references public.warehouses(id),
 material_id uuid not null references public.materials(id),
 base_uom_id uuid not null references public.units_of_measure(id),
 location_kind text not null check(location_kind in ('WAREHOUSE','IN_TRANSIT')),
 custody_reference text,
 source_ref text not null check(char_length(source_ref) between 1 and 500),
 base_quantity numeric(20,6) not null check(base_quantity >= 0 and base_quantity::text not in ('NaN','Infinity','-Infinity')),
 unit_cost_vnd_per_base numeric(20,6) not null check(unit_cost_vnd_per_base > 0 and unit_cost_vnd_per_base::text not in ('NaN','Infinity','-Infinity')),
 value_vnd bigint not null check(value_vnd >= 0),
 cutover_at timestamptz not null,
 operation_id uuid not null,
 actor_id uuid not null references auth.users(id),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 unique(branch_id,source_ref),
 check((location_kind='WAREHOUSE' and warehouse_id is not null and custody_reference is null)
    or (location_kind='IN_TRANSIT' and warehouse_id is null and length(custody_reference)>0)),
 check(value_vnd=round(base_quantity*unit_cost_vnd_per_base,0)),
 check((base_quantity=0 and value_vnd=0) or (base_quantity>0 and value_vnd>0))
);
alter table public.inventory_opening_sources enable row level security;
revoke all on public.inventory_opening_sources from public,anon,authenticated,service_role;
grant select on public.inventory_opening_sources to authenticated;
create policy inventory_opening_sources_read on public.inventory_opening_sources for select to authenticated
 using(private.has_permission(branch_id,'inventory.cost.read'));
create trigger inventory_opening_sources_immutable before update or delete on public.inventory_opening_sources
for each row execute function private.reject_immutable_finance_mutation();

alter table public.inventory_movements
 add column source_inventory_opening_id uuid unique references public.inventory_opening_sources(id),
 drop constraint inventory_movements_movement_type_check,
 add constraint inventory_movements_movement_type_check check(movement_type in
 ('PURCHASE_RECEIPT','DELIVERY_HANDOFF','DELIVERY_VERIFIED','STOCK_ADJUSTMENT','RETURN_TRANSFER','CUSTOMER_RETURN','TRANSIT_LOSS','OPENING')),
 drop constraint inventory_movements_check2,
 add constraint inventory_movements_check2 check(num_nonnulls(source_purchase_receipt_line_id,source_delivery_handoff_line_id,
 source_delivery_verification_line_id,source_stock_count_line_id,source_return_case_id,source_inventory_opening_id)=1),
 drop constraint inventory_movements_check,
 add constraint inventory_movements_check check(
 (location_kind='WAREHOUSE' and warehouse_id is not null and delivery_id is null)
 or (location_kind='IN_TRANSIT' and warehouse_id is null and
 ((delivery_id is not null and source_inventory_opening_id is null)
 or (delivery_id is null and source_inventory_opening_id is not null)))),
 add constraint inventory_movements_opening_kind check((movement_type='OPENING')=(source_inventory_opening_id is not null));

alter table public.opening_balance_sources
 add column historical_original_amount_vnd bigint,
 add column outstanding_at_cutover_vnd bigint,
 add column cutover_at timestamptz,
 add column source_document_ref text,
 add column operation_id uuid,
 add column import_payload jsonb,
 add constraint opening_import_amounts check(import_payload is null or
 (historical_original_amount_vnd is not null and outstanding_at_cutover_vnd is not null
 and historical_original_amount_vnd>=outstanding_at_cutover_vnd and outstanding_at_cutover_vnd>=0
 and cutover_at is not null and source_document_ref is not null and operation_id is not null));
create trigger operational_opening_source_immutable before update or delete on public.opening_balance_sources
for each row execute function private.reject_immutable_finance_mutation();

create table public.cash_opening_balances (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id),
 account_id uuid not null references public.finance_accounts(id),
 source_ref text not null check(length(source_ref)>0),
 amount_vnd bigint not null,
 cutover_at timestamptz not null,
 actor_id uuid not null references auth.users(id),
 operation_id uuid not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 unique(branch_id,source_ref),
 unique(account_id,cutover_at)
);
alter table public.cash_opening_balances enable row level security;
revoke all on public.cash_opening_balances from public,anon,authenticated,service_role;
grant select on public.cash_opening_balances to authenticated;
create policy cash_opening_balances_read on public.cash_opening_balances for select to authenticated
 using(private.has_permission(branch_id,'finance.reconcile'));
create trigger cash_opening_balances_immutable before update or delete on public.cash_opening_balances
for each row execute function private.reject_immutable_finance_mutation();

create function private.post_inventory_opening(p jsonb, actor uuid, operation uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid=(p->>'branch_id')::uuid; m public.materials%rowtype; old public.inventory_opening_sources%rowtype; result uuid;
begin
 if actor is null or operation is null then raise exception 'opening_actor_operation_required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-opening:'||b||':'||(p->>'source_ref'),0));
 select * into old from public.inventory_opening_sources where branch_id=b and source_ref=p->>'source_ref';
 if found then
  if old.payload is distinct from p then raise exception 'opening_source_conflict' using errcode='PT409';end if;
  return old.id;
 end if;
 select * into strict m from public.materials where id=(p->>'material_id')::uuid;
 if m.base_uom_id is distinct from (p->>'base_uom_id')::uuid then raise exception 'opening_base_uom_mismatch' using errcode='23514';end if;
 if p->>'location_kind'='WAREHOUSE' and not exists(select 1 from public.warehouses where id=(p->>'warehouse_id')::uuid and branch_id=b)
 then raise exception 'opening_warehouse_branch_mismatch' using errcode='23514';end if;
 if (p->>'base_quantity')::numeric is distinct from (p->>'base_quantity')::numeric(20,6)
 or (p->>'unit_cost')::numeric is distinct from (p->>'unit_cost')::numeric(20,6)
 then raise exception 'opening_numeric_precision' using errcode='22003';end if;
 insert into public.inventory_opening_sources(branch_id,warehouse_id,material_id,base_uom_id,location_kind,custody_reference,
 source_ref,base_quantity,unit_cost_vnd_per_base,value_vnd,cutover_at,operation_id,actor_id,payload)
 values(b,(p->>'warehouse_id')::uuid,m.id,m.base_uom_id,p->>'location_kind',p->>'custody_reference',p->>'source_ref',
 (p->>'base_quantity')::numeric,(p->>'unit_cost')::numeric,(p->>'value_vnd')::bigint,(p->>'cutover_at')::timestamptz,operation,actor,p)
 returning id into result;
 if (p->>'base_quantity')::numeric>0 then
 insert into public.inventory_movements(branch_id,material_id,base_uom_id,location_kind,warehouse_id,movement_type,
 base_quantity_delta,inventory_value_delta_vnd,unit_cost_vnd_per_base,source_inventory_opening_id,occurred_at,recorded_by)
 values(b,m.id,m.base_uom_id,p->>'location_kind',(p->>'warehouse_id')::uuid,'OPENING',
 (p->>'base_quantity')::numeric,(p->>'value_vnd')::bigint,(p->>'unit_cost')::numeric,result,(p->>'cutover_at')::timestamptz,actor);
 end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(actor,b,'inventory.opening.posted','inventory_opening',result,operation,'Explicit operational opening source');
 return result;
end $$;
revoke all on function private.post_inventory_opening(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function private.post_finance_opening(p jsonb, actor uuid, operation uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid=(p->>'branch_id')::uuid; party uuid=(p->>'party_id')::uuid;
 kind text=p->>'party_kind'; side_value text; old public.opening_balance_sources%rowtype; result uuid;
 outstanding bigint=(p->>'outstanding_vnd')::bigint;
begin
 if actor is null or operation is null then raise exception 'opening_actor_operation_required' using errcode='22023';end if;
 if kind not in ('CUSTOMER','SUPPLIER','EMPLOYEE') then raise exception 'opening_party_kind' using errcode='22023';end if;
 side_value=case when kind='CUSTOMER' then 'RECEIVABLE' else 'PAYABLE' end;
 perform pg_advisory_xact_lock(hashtextextended('finance-opening:'||b||':'||side_value||':'||(p->>'source_ref'),0));
 select * into old from public.opening_balance_sources where branch_id=b and side=side_value and source_ref=p->>'source_ref';
 if found then
  if old.import_payload is distinct from p then raise exception 'opening_source_conflict' using errcode='PT409';end if;
  return old.id;
 end if;
 if kind='CUSTOMER' and not exists(select 1 from public.customers where id=party and branch_id=b)
 or kind='SUPPLIER' and not exists(select 1 from public.suppliers where id=party and branch_id=b)
 or kind='EMPLOYEE' and not exists(select 1 from public.employee_branch_access where employee_id=party and branch_id=b)
 then raise exception 'opening_party_branch_mismatch' using errcode='23514';end if;
 if p->>'site_id' is not null and (kind<>'CUSTOMER' or not exists(
 select 1 from public.customer_sites where id=(p->>'site_id')::uuid and customer_id=party))
 then raise exception 'opening_site_customer_mismatch' using errcode='23514';end if;
 insert into public.opening_balance_sources(branch_id,side,source_ref,note,recorded_at,historical_original_amount_vnd,
 outstanding_at_cutover_vnd,cutover_at,source_document_ref,operation_id,import_payload)
 values(b,side_value,p->>'source_ref','Operational opening; historical original retained, no fake settlement',
 (p->>'cutover_at')::timestamptz,(p->>'original_vnd')::bigint,outstanding,(p->>'cutover_at')::timestamptz,
 p->>'document_ref',operation,p) returning id into result;
 -- Zero outstanding is retained as source history, not a forbidden zero obligation.
 if outstanding>0 then
  if kind='CUSTOMER' then
   insert into public.receivable_obligations(branch_id,customer_id,site_id,opening_source_id,original_amount_vnd,due_date,recorded_at,recorded_by)
   values(b,party,(p->>'site_id')::uuid,result,outstanding,(p->>'due_date')::date,(p->>'cutover_at')::timestamptz,actor);
  else
   insert into public.payable_obligations(branch_id,supplier_id,employee_id,opening_source_id,original_amount_vnd,due_date,recorded_at,recorded_by)
   values(b,case when kind='SUPPLIER' then party end,case when kind='EMPLOYEE' then party end,result,outstanding,
   (p->>'due_date')::date,(p->>'cutover_at')::timestamptz,actor);
  end if;
 end if;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(actor,b,'finance.opening.posted','opening_balance_source',result,operation,'Opening outstanding only; original source history retained');
 return result;
end $$;
revoke all on function private.post_finance_opening(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function private.post_cash_opening(p jsonb, actor uuid, operation uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid=(p->>'branch_id')::uuid; old public.cash_opening_balances%rowtype; result uuid;
begin
 if actor is null or operation is null then raise exception 'opening_actor_operation_required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-opening:'||b||':'||(p->>'source_ref'),0));
 select * into old from public.cash_opening_balances where branch_id=b and source_ref=p->>'source_ref';
 if found then
  if old.payload is distinct from p then raise exception 'opening_source_conflict' using errcode='PT409';end if;
  return old.id;
 end if;
 if not exists(select 1 from public.finance_accounts where id=(p->>'account_id')::uuid and branch_id=b)
 then raise exception 'opening_account_branch_mismatch' using errcode='23514';end if;
 insert into public.cash_opening_balances(branch_id,account_id,source_ref,amount_vnd,cutover_at,actor_id,operation_id,payload)
 values(b,(p->>'account_id')::uuid,p->>'source_ref',(p->>'amount_vnd')::bigint,(p->>'cutover_at')::timestamptz,actor,operation,p)
 returning id into result;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,reason)
 values(actor,b,'cash.opening.posted','cash_opening_balance',result,operation,'Explicit cash opening; not a customer or supplier payment');
 return result;
end $$;
revoke all on function private.post_cash_opening(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create view public.cash_opening_read with(security_invoker=true) as
select id,branch_id,account_id,source_ref,amount_vnd::text amount_vnd,cutover_at from public.cash_opening_balances;
grant select on public.cash_opening_read to authenticated;
create view public.inventory_opening_transit_read with(security_invoker=true) as
select id,branch_id,material_id,base_uom_id,custody_reference,source_ref,
base_quantity::text base_quantity,value_vnd::text inventory_value_vnd,cutover_at
from public.inventory_opening_sources where location_kind='IN_TRANSIT';
grant select on public.inventory_opening_transit_read to authenticated;


-- Late opening foundation requires two guards before any authorized import run.
do $forward$
    declare t text;
    begin
      foreach t in array array['inventory_opening_sources','cash_opening_balances'] loop
        if to_regclass('public.'||t) is null or exists(
          select 1 from pg_trigger where tgrelid=to_regclass('public.'||t) and tgname='operational_posting_guard'
        ) then raise exception 'late_opening_gate_unexpected_prestate' using errcode='55000'; end if;
        execute format('create trigger operational_posting_guard before insert or update or delete on public.%I for each row execute function private.enforce_operational_write()',t);
      end loop;
      perform private.assert_operational_opening_writers_protected();
    end $forward$;

do $validator$
declare f record;
begin
 perform private.assert_operational_opening_writers_protected();
 select prosrc into f from pg_proc where oid='public.resolve_return_case(uuid,text,uuid,text,uuid,integer,uuid)'::regprocedure;
 if strpos(f.prosrc,'return_exceeds_transit_position')=0 or strpos(f.prosrc,'sum(sfl.payable_amount_vnd)')=0
 then raise exception 'return_forward_guard_lost' using errcode='55000';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('resolve_return_case','review_payment_notice','cancel_planned_delivery','cancel_scheduled_service_job')
 and p.prosrc ~* $pattern$errcode[[:space:]]*=[[:space:]]*'40001'$pattern$)
 then raise exception 'custom40001_reintroduced' using errcode='55000';end if;
 for f in select p.oid,p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proconfig
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('cancel_planned_delivery','cancel_scheduled_service_job') loop
  if not f.prosecdef or f.owner<>'postgres' or f.proconfig is distinct from array['search_path=""']::text[]
  or has_function_privilege('anon',f.oid,'EXECUTE') or not has_function_privilege('authenticated',f.oid,'EXECUTE')
  then raise exception 'cancellation_acl_precondition_mismatch' using errcode='55000';end if;
 end loop;
end $validator$;
commit;
