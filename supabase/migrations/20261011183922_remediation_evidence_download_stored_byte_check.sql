begin;
create or replace function public.get_portal_evidence_for_signing(target_evidence_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare evidence public.portal_evidence_objects%rowtype;
begin
  if not private.portal_evidence_access(target_evidence_id,true) then raise exception 'evidence_access_denied' using errcode='42501';end if;
  select * into evidence from public.portal_evidence_objects where id=target_evidence_id;
  return jsonb_build_object('id',evidence.id,'bucket_id',evidence.bucket_id,'object_path',evidence.object_path,
    'mime_type',evidence.mime_type,'checksum_sha256',evidence.checksum_sha256,'byte_size',evidence.final_byte_size);
end $f$;
revoke all on function public.get_portal_evidence_for_signing(uuid) from public,anon;
grant execute on function public.get_portal_evidence_for_signing(uuid) to authenticated;
commit;
