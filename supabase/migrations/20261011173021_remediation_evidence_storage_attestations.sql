begin;
create table private.evidence_storage_attestations(namespace text not null check(namespace in('PORTAL','INTERNAL')),evidence_id uuid not null,checksum_sha256 text not null check(checksum_sha256 ~ '^[0-9a-f]{64}$'),byte_size bigint not null check(byte_size between 1 and 10485760),verified_by uuid not null references auth.users(id),verified_at timestamptz not null default now(),primary key(namespace,evidence_id));
alter table private.evidence_storage_attestations enable row level security;
revoke all on private.evidence_storage_attestations from public,anon,authenticated;
create trigger evidence_attestation_immutable before update or delete on private.evidence_storage_attestations for each row execute function private.reject_r7_posted_mutation();
create function private.record_storage_attestation(kind text,eid uuid,sha text,bytes bigint,actor uuid) returns void language plpgsql security definer set search_path='' as $f$
declare old private.evidence_storage_attestations%rowtype;
begin select * into old from private.evidence_storage_attestations where namespace=kind and evidence_id=eid;
 if found then if old.checksum_sha256 is distinct from sha or old.byte_size is distinct from bytes then raise exception 'evidence_attestation_conflict' using errcode='23505';end if;return;end if;
 insert into private.evidence_storage_attestations(namespace,evidence_id,checksum_sha256,byte_size,verified_by) values(kind,eid,sha,bytes,actor);end $f$;
revoke all on function private.record_storage_attestation(text,uuid,text,bigint,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.finalize_portal_evidence_verified(actor_uuid uuid, target_evidence_id uuid, target_checksum_sha256 text, target_byte_size bigint, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  evidence public.portal_evidence_objects%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into evidence from public.portal_evidence_objects e where e.id = target_evidence_id for update;
  if evidence.id is null or (evidence.uploaded_by <> actor_uuid and not(evidence.object_state='READY' and private.evidence_actor_has_permission(actor_uuid,coalesce((select branch_id from public.work_items where id=evidence.work_item_id),(select branch_id from public.customers where id=evidence.customer_id)),'evidence.manage'))) or not private.evidence_actor_portal_access(actor_uuid,evidence.id, false) then
    raise exception 'evidence_finalize_forbidden' using errcode = '42501';
  end if;
  if target_byte_size <> evidence.declared_byte_size or target_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'evidence_integrity_mismatch' using errcode = '22023';
  end if;
  if actor_uuid is null or operation_id is null or target_checksum_sha256 is null or target_byte_size is null or target_byte_size not between 1 and 10485760 or target_checksum_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_evidence_metadata' using errcode='22023';end if;
  if not private.evidence_storage_object_exists(evidence.bucket_id,evidence.object_path) then raise exception 'evidence_storage_object_unavailable' using errcode='55000';end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('evidence', target_evidence_id, 'checksum', target_checksum_sha256, 'bytes', target_byte_size));
  select * into receipt from public.command_receipts r where r.operation_id = finalize_portal_evidence_verified.operation_id;
  if found then
    if receipt.command_name <> 'finalize_portal_evidence' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    perform private.record_storage_attestation('PORTAL',evidence.id,target_checksum_sha256,target_byte_size,actor_uuid);
    return receipt.result_entity_id;
  end if;
  if evidence.object_state = 'READY' then
    if evidence.final_byte_size <> target_byte_size or evidence.checksum_sha256 <> target_checksum_sha256 then raise exception 'evidence_already_finalized' using errcode = '23505'; end if;
  elsif evidence.object_state = 'PENDING' then
    update public.portal_evidence_objects set
      final_byte_size = target_byte_size,
      checksum_sha256 = target_checksum_sha256,
      object_state = 'READY',
      finalized_at = now()
    where id = evidence.id;
  else
    raise exception 'evidence_revoked' using errcode = '42501';
  end if;
  insert into public.command_receipts
  values(operation_id, actor_uuid, 'finalize_portal_evidence', payload_hash, 'portal_evidence', evidence.id, now());
  perform private.record_storage_attestation('PORTAL',evidence.id,target_checksum_sha256,target_byte_size,actor_uuid);
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values(actor_uuid,coalesce((select branch_id from public.work_items where id=evidence.work_item_id),(select branch_id from public.customers where id=evidence.customer_id)),'evidence.storage_verified','portal_evidence',evidence.id,operation_id,array['stored_file','checksum_sha256','byte_size']);
  return evidence.id;
end $function$
;
CREATE OR REPLACE FUNCTION public.finalize_evidence_upload_verified(actor_uuid uuid, target_evidence_id uuid, checksum_sha256 text, byte_size bigint, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare evidence public.evidence_objects%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into evidence from public.evidence_objects where id = target_evidence_id for update;
  if evidence.id is null then raise exception 'evidence_not_found' using errcode = '23503'; end if;
  if not private.evidence_actor_has_permission(actor_uuid,evidence.branch_id, 'evidence.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if checksum_sha256 !~ '^[0-9a-f]{64}$' or byte_size <= 0 then raise exception 'invalid_evidence_metadata' using errcode = '22023'; end if;
  if actor_uuid is null or operation_id is null or checksum_sha256 is null or byte_size is null or byte_size not between 1 and 10485760 or checksum_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_evidence_metadata' using errcode='22023';end if;
  if not private.evidence_storage_object_exists(evidence.bucket_name,evidence.object_path) then raise exception 'evidence_storage_object_unavailable' using errcode='55000';end if;
  hash := private.command_payload_hash(jsonb_build_object('evidence_id', target_evidence_id, 'checksum', checksum_sha256, 'byte_size', byte_size));
  select * into receipt from public.command_receipts where command_receipts.operation_id = finalize_evidence_upload_verified.operation_id;
  if found then if receipt.command_name <> 'finalize_evidence_upload' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; perform private.record_storage_attestation('INTERNAL',evidence.id,checksum_sha256,byte_size,actor_uuid); return receipt.result_entity_id; end if;
  if evidence.upload_state = 'VERIFIED' and (evidence.checksum_sha256 <> checksum_sha256 or evidence.byte_size <> byte_size) then raise exception 'evidence_payload_conflict' using errcode = '23505'; end if;
  update public.evidence_objects set upload_state = 'VERIFIED', checksum_sha256 = finalize_evidence_upload_verified.checksum_sha256,
    byte_size = finalize_evidence_upload_verified.byte_size, verified_at = coalesce(verified_at, now()) where id = target_evidence_id;
  insert into public.command_receipts values (operation_id, actor_uuid, 'finalize_evidence_upload', hash, 'evidence_object', target_evidence_id, now());
  return target_evidence_id;
end
$function$
;
CREATE OR REPLACE FUNCTION private.assert_verified_evidence(target_evidence_id uuid, target_branch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if target_evidence_id is not null and not exists (
    select 1 from public.evidence_objects e where e.id = target_evidence_id
      and e.branch_id = target_branch_id and e.upload_state = 'VERIFIED'
      and private.evidence_storage_object_exists(e.bucket_name,e.object_path) and exists(select 1 from private.evidence_storage_attestations a where a.namespace='INTERNAL' and a.evidence_id=e.id and a.checksum_sha256=e.checksum_sha256 and a.byte_size=e.byte_size)
  ) then raise exception 'evidence_not_verified' using errcode = '23514'; end if;
end
$function$
;
CREATE OR REPLACE FUNCTION private.portal_evidence_access(target_evidence_id uuid, require_ready boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.portal_evidence_objects e
    where e.id = target_evidence_id
      and (not require_ready or(e.object_state='READY' and private.evidence_storage_object_exists(e.bucket_id,e.object_path) and exists(select 1 from private.evidence_storage_attestations a where a.namespace='PORTAL' and a.evidence_id=e.id and a.checksum_sha256=e.checksum_sha256 and a.byte_size=e.final_byte_size)))
      and e.object_state <> 'REVOKED'
      and (
        private.has_permission(
          coalesce(
            (select w.branch_id from public.work_items w where w.id = e.work_item_id),
            (select c.branch_id from public.customers c where c.id = e.customer_id)
          ),
          'evidence.manage'
        )
        or (e.context_type = 'WORK_RESULT' and private.is_current_work_assignee(e.work_item_id))
        or (
          e.context_type = 'WORK_RESULT'
          and exists (
            select 1
            from public.work_result_portal_evidence link
            join public.work_item_results wr on wr.id = link.work_result_id
            join public.work_items w on w.id = wr.work_item_id
            join public.delivery_results dr on dr.source_work_item_result_id = wr.id
            join public.deliveries d on d.id = dr.delivery_id
            where link.evidence_id = e.id
              and wr.work_item_id = e.work_item_id
              and w.delivery_id = d.id
              and w.branch_id = d.branch_id
              and private.has_permission(d.branch_id, 'delivery.read')
              and private.has_permission(d.branch_id, 'delivery.verify')
          )
        )
        or (
          e.context_type = 'PAYMENT_NOTICE'
          and private.portal_customer_role(e.customer_id) in ('OWNER','FINANCE_CONTACT')
        )
        or (
          e.context_type = 'PAYMENT_NOTICE'
          and private.has_permission((select c.branch_id from public.customers c where c.id = e.customer_id), 'finance.payment_notice.review')
        )
      )
  )
$function$
;
create function public.evidence_verified_storage_status(target_evidence_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $f$
declare e public.evidence_objects%rowtype;begin select * into e from public.evidence_objects where id=target_evidence_id;if e.id is null or not private.has_permission(e.branch_id,'evidence.manage') then raise exception 'forbidden' using errcode='42501';end if;
return e.upload_state='VERIFIED' and private.evidence_storage_object_exists(e.bucket_name,e.object_path) and exists(select 1 from private.evidence_storage_attestations a where a.namespace='INTERNAL' and a.evidence_id=e.id and a.checksum_sha256=e.checksum_sha256 and a.byte_size=e.byte_size);end $f$;
revoke all on function public.evidence_verified_storage_status(uuid) from public,anon;grant execute on function public.evidence_verified_storage_status(uuid) to authenticated;
commit;
