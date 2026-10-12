begin;
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
  if evidence.id is null or evidence.uploaded_by <> actor_uuid or not private.evidence_actor_portal_access(actor_uuid,evidence.id, false) then
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
  if found then if receipt.command_name <> 'finalize_evidence_upload' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if evidence.upload_state = 'VERIFIED' and (evidence.checksum_sha256 <> checksum_sha256 or evidence.byte_size <> byte_size) then raise exception 'evidence_payload_conflict' using errcode = '23505'; end if;
  update public.evidence_objects set upload_state = 'VERIFIED', checksum_sha256 = finalize_evidence_upload_verified.checksum_sha256,
    byte_size = finalize_evidence_upload_verified.byte_size, verified_at = coalesce(verified_at, now()) where id = target_evidence_id;
  insert into public.command_receipts values (operation_id, actor_uuid, 'finalize_evidence_upload', hash, 'evidence_object', target_evidence_id, now());
  return target_evidence_id;
end
$function$
;
create function private.can_read_internal_evidence_storage(target_bucket text,target_path text) returns boolean language sql stable security definer set search_path='' as $f$
 select exists(select 1 from public.evidence_objects e where e.bucket_name=target_bucket and e.object_path=target_path and private.has_permission(e.branch_id,'evidence.manage'))
$f$;
create function private.can_write_internal_evidence_storage(target_bucket text,target_path text) returns boolean language sql stable security definer set search_path='' as $f$
 select exists(select 1 from public.evidence_objects e where e.bucket_name=target_bucket and e.object_path=target_path and e.upload_state='PENDING' and private.has_permission(e.branch_id,'evidence.manage'))
$f$;
revoke all on function private.can_read_internal_evidence_storage(text,text),private.can_write_internal_evidence_storage(text,text) from public,anon;
grant execute on function private.can_read_internal_evidence_storage(text,text),private.can_write_internal_evidence_storage(text,text) to authenticated;
do $migration$ begin if to_regclass('storage.objects') is not null then
 execute 'drop policy if exists r6_evidence_insert on storage.objects';
 execute 'drop policy if exists r6_evidence_select on storage.objects';
 execute 'create policy r6_evidence_insert on storage.objects for insert to authenticated with check(bucket_id in (''delivery-proofs'',''inventory-evidence'') and private.can_write_internal_evidence_storage(bucket_id,name))';
 execute 'create policy r6_evidence_select on storage.objects for select to authenticated using(bucket_id in (''delivery-proofs'',''inventory-evidence'') and private.can_read_internal_evidence_storage(bucket_id,name))';
end if;end $migration$;
commit;
