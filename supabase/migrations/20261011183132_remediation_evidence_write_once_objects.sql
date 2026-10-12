begin;

-- Immutable objects keep the download-to-finalize interval stable, including
-- requests holding an old PENDING result. Signed uploads never allow upsert.
do $migration$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists r9_portal_evidence_update on storage.objects';
    execute 'create policy evidence_no_authenticated_replace on storage.objects as restrictive for update to authenticated using (bucket_id not in (''portal-evidence'',''inventory-evidence'',''delivery-proofs'')) with check (bucket_id not in (''portal-evidence'',''inventory-evidence'',''delivery-proofs''))';
    execute 'create policy evidence_no_authenticated_delete on storage.objects as restrictive for delete to authenticated using (bucket_id not in (''portal-evidence'',''inventory-evidence'',''delivery-proofs''))';
  end if;
end $migration$;

-- An administrator's replacement/deletion must invalidate the old proof even
-- though its application metadata and checksum did not change. No backfill.
create table private.evidence_storage_bindings (
  namespace text not null,
  evidence_id uuid not null,
  object_id uuid not null,
  object_version text not null check(length(object_version)>0),
  primary key(namespace,evidence_id),
  foreign key(namespace,evidence_id) references private.evidence_storage_attestations(namespace,evidence_id)
);
alter table private.evidence_storage_bindings enable row level security;
revoke all on private.evidence_storage_bindings from public,anon,authenticated;
create trigger evidence_storage_binding_immutable before update or delete on private.evidence_storage_bindings for each row execute function private.reject_r7_posted_mutation();

create function private.evidence_storage_identity(bucket text,path text) returns jsonb
language plpgsql stable security definer set search_path='' as $f$
declare identity jsonb;
begin
  if to_regclass('storage.objects') is null then return null;end if;
  execute 'select jsonb_build_object(''id'',id,''version'',version) from storage.objects where bucket_id=$1 and name=$2 and version is not null' into identity using bucket,path;
  return identity;
end $f$;
revoke all on function private.evidence_storage_identity(text,text) from public,anon,authenticated;

create function private.evidence_storage_binding_current(kind text,eid uuid,bucket text,path text) returns boolean
language sql stable security definer set search_path='' as $f$
  select exists(select 1 from private.evidence_storage_bindings b
    where b.namespace=kind and b.evidence_id=eid
      and jsonb_build_object('id',b.object_id,'version',b.object_version)=private.evidence_storage_identity(bucket,path));
$f$;
revoke all on function private.evidence_storage_binding_current(text,uuid,text,text) from public,anon,authenticated;

create or replace function private.record_storage_attestation(kind text,eid uuid,sha text,bytes bigint,actor uuid) returns void
language plpgsql security definer set search_path='' as $f$
declare
  old private.evidence_storage_attestations%rowtype;
  binding private.evidence_storage_bindings%rowtype;
  bucket text;path text;identity jsonb;
begin
  if kind='PORTAL' then select bucket_id,object_path into bucket,path from public.portal_evidence_objects where id=eid;
  elsif kind='INTERNAL' then select bucket_name,object_path into bucket,path from public.evidence_objects where id=eid;
  else raise exception 'invalid_evidence_namespace' using errcode='22023';end if;
  if to_regclass('storage.objects') is null then raise exception 'evidence_storage_object_unavailable' using errcode='55000';end if;
  execute 'select jsonb_build_object(''id'',id,''version'',version) from storage.objects where bucket_id=$1 and name=$2 and version is not null for share' into identity using bucket,path;
  if identity is null then raise exception 'evidence_storage_object_unavailable' using errcode='55000';end if;
  select * into old from private.evidence_storage_attestations where namespace=kind and evidence_id=eid;
  if found then
    if old.checksum_sha256 is distinct from sha or old.byte_size is distinct from bytes then raise exception 'evidence_attestation_conflict' using errcode='23505';end if;
  else
    insert into private.evidence_storage_attestations(namespace,evidence_id,checksum_sha256,byte_size,verified_by) values(kind,eid,sha,bytes,actor);
  end if;
  select * into binding from private.evidence_storage_bindings where namespace=kind and evidence_id=eid;
  if found then
    if jsonb_build_object('id',binding.object_id,'version',binding.object_version) is distinct from identity then raise exception 'evidence_storage_object_changed' using errcode='23505';end if;
  else
    insert into private.evidence_storage_bindings(namespace,evidence_id,object_id,object_version) values(kind,eid,(identity->>'id')::uuid,identity->>'version');
  end if;
end $f$;
revoke all on function private.record_storage_attestation(text,uuid,text,bigint,uuid) from public,anon,authenticated;

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
      and private.evidence_storage_binding_current('INTERNAL',e.id,e.bucket_name,e.object_path) and exists(select 1 from private.evidence_storage_attestations a where a.namespace='INTERNAL' and a.evidence_id=e.id and a.checksum_sha256=e.checksum_sha256 and a.byte_size=e.byte_size)
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
      and (not require_ready or(e.object_state='READY' and private.evidence_storage_binding_current('PORTAL',e.id,e.bucket_id,e.object_path) and exists(select 1 from private.evidence_storage_attestations a where a.namespace='PORTAL' and a.evidence_id=e.id and a.checksum_sha256=e.checksum_sha256 and a.byte_size=e.final_byte_size)))
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
create or replace function public.evidence_verified_storage_status(target_evidence_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $f$
declare e public.evidence_objects%rowtype;begin select * into e from public.evidence_objects where id=target_evidence_id;if e.id is null or not private.has_permission(e.branch_id,'evidence.manage') then raise exception 'forbidden' using errcode='42501';end if;
return e.upload_state='VERIFIED' and private.evidence_storage_binding_current('INTERNAL',e.id,e.bucket_name,e.object_path) and exists(select 1 from private.evidence_storage_attestations a where a.namespace='INTERNAL' and a.evidence_id=e.id and a.checksum_sha256=e.checksum_sha256 and a.byte_size=e.byte_size);end $f$;
revoke all on function public.evidence_verified_storage_status(uuid) from public,anon;grant execute on function public.evidence_verified_storage_status(uuid) to authenticated;
commit;
