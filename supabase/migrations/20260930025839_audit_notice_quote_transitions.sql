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
  if notice.version <> expected_version then raise exception 'stale_payment_notice_version' using errcode = '40001'; end if;
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
