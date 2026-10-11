begin;
CREATE OR REPLACE FUNCTION public.submit_payment_notice(target_customer_id uuid, target_evidence_id uuid, declared_amount_vnd bigint, paid_on date, payment_reference text, customer_note text, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  customer_branch_id uuid;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  notice_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('portal_notice:'||operation_id::text,0));
  if coalesce(private.portal_customer_role(target_customer_id), '') not in ('OWNER','FINANCE_CONTACT') then
    raise exception 'payment_notice_forbidden' using errcode = '42501';
  end if;
  if declared_amount_vnd is null or declared_amount_vnd <= 0 or paid_on is null then raise exception 'invalid_payment_notice' using errcode = '22023'; end if;
  if nullif(trim(payment_reference), '') is not null and char_length(trim(payment_reference)) not between 3 and 120 then raise exception 'invalid_payment_reference' using errcode = '22023'; end if;
  if nullif(trim(customer_note), '') is not null and char_length(trim(customer_note)) not between 3 and 500 then raise exception 'invalid_payment_note' using errcode = '22023'; end if;
  select c.branch_id into customer_branch_id from public.customers c where c.id = target_customer_id;
  if not exists (
    select 1 from public.portal_evidence_objects e
    where e.id = target_evidence_id
      and e.context_type = 'PAYMENT_NOTICE'
      and e.customer_id = target_customer_id
      and e.object_state = 'READY'
      and e.uploaded_by = (select auth.uid())
  ) then
    raise exception 'payment_notice_evidence_invalid' using errcode = '42501';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object(
    'customer', target_customer_id, 'evidence', target_evidence_id, 'amount', declared_amount_vnd,
    'paid_on', paid_on, 'reference', nullif(trim(payment_reference), ''), 'note', nullif(trim(customer_note), '')
  ));
  select * into receipt from public.command_receipts r where r.operation_id = submit_payment_notice.operation_id;
  if found then
    if receipt.command_name <> 'submit_payment_notice' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  insert into public.payment_notices(
    branch_id, customer_id, evidence_id, declared_amount_vnd, paid_on, payment_reference, customer_note, submitted_by
  ) values(
    customer_branch_id, target_customer_id, target_evidence_id, declared_amount_vnd, paid_on,
    nullif(trim(payment_reference), ''), nullif(trim(customer_note), ''), (select auth.uid())
  ) returning id into notice_id;
  insert into public.command_receipts
  values(operation_id, (select auth.uid()), 'submit_payment_notice', payload_hash, 'payment_notice', notice_id, now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values(auth.uid(),customer_branch_id,'payment_notice.submitted','payment_notice',notice_id,operation_id,array['customer_id','evidence_id','declared_amount','document_notice']);
  return notice_id;
end $function$
;
notify pgrst,'reload schema';
commit;
