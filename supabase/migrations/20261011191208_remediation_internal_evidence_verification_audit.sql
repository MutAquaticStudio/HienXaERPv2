begin;
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
  perform private.record_storage_attestation('INTERNAL',evidence.id,checksum_sha256,byte_size,actor_uuid);
  update public.evidence_objects set upload_state = 'VERIFIED', checksum_sha256 = finalize_evidence_upload_verified.checksum_sha256,
    byte_size = finalize_evidence_upload_verified.byte_size, verified_at = coalesce(verified_at, now()) where id = target_evidence_id;
  insert into public.command_receipts values (operation_id, actor_uuid, 'finalize_evidence_upload', hash, 'evidence_object', target_evidence_id, now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values(actor_uuid,evidence.branch_id,'evidence.storage_verified','evidence_object',evidence.id,operation_id,array['stored_file','checksum_sha256','byte_size']);
  return target_evidence_id;
end
$function$
;
revoke all on function public.finalize_evidence_upload_verified(uuid,uuid,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.finalize_evidence_upload_verified(uuid,uuid,text,bigint,uuid) to service_role;
commit;
