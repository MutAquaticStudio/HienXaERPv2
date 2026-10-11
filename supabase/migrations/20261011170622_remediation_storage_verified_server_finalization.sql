begin;

create function private.evidence_storage_object_exists(target_bucket text,target_path text) returns boolean
language plpgsql stable security definer set search_path='' as $fn$
declare present boolean;
begin
 if to_regclass('storage.objects') is null then return false;end if;
 execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2)' into present using target_bucket,target_path;
 return coalesce(present,false);
end $fn$;
revoke all on function private.evidence_storage_object_exists(text,text) from public,anon,authenticated;


CREATE OR REPLACE FUNCTION private.evidence_actor_has_permission(actor_uuid uuid, target_branch_id uuid, requested_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.employees e
    join public.employee_branch_access a on a.employee_id = e.id and a.active
    join public.branches b on b.id = a.branch_id and b.active
    join public.roles r on r.id = a.role_id and r.active
    where e.auth_user_id = actor_uuid
      and e.active
      and a.branch_id = target_branch_id
      and (
        exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission_code = requested_permission
        )
        or exists (
          select 1 from public.employee_permission_grants g
          where g.employee_id = e.id
            and g.branch_id = a.branch_id
            and g.permission_code = requested_permission
        )
      )
  )
$function$
;
revoke all on function private.evidence_actor_has_permission(uuid,uuid,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.evidence_actor_customer_role(actor_uuid uuid, target_customer_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.membership_role::text
  from public.customer_portal_memberships m
  where m.auth_user_id = actor_uuid
    and m.customer_id = target_customer_id
    and m.active
  order by m.customer_id
  limit 1
$function$
;
revoke all on function private.evidence_actor_customer_role(uuid,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.evidence_actor_is_assignee(actor_uuid uuid, target_work_item_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.work_item_assignments a
    join public.work_items w on w.id = a.work_item_id
    where a.work_item_id = target_work_item_id
      and a.superseded_at is null
      and a.employee_id = (select e.id from public.employees e where e.auth_user_id=actor_uuid and e.active limit 1)
      and private.evidence_actor_has_permission(actor_uuid,w.branch_id, 'work.claim')
  )
$function$
;
revoke all on function private.evidence_actor_is_assignee(uuid,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.evidence_actor_portal_access(actor_uuid uuid, target_evidence_id uuid, require_ready boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.portal_evidence_objects e
    where e.id = target_evidence_id
      and (not require_ready or e.object_state = 'READY')
      and e.object_state <> 'REVOKED'
      and (
        private.evidence_actor_has_permission(actor_uuid,
          coalesce(
            (select w.branch_id from public.work_items w where w.id = e.work_item_id),
            (select c.branch_id from public.customers c where c.id = e.customer_id)
          ),
          'evidence.manage'
        )
        or (e.context_type = 'WORK_RESULT' and private.evidence_actor_is_assignee(actor_uuid,e.work_item_id))
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
              and private.evidence_actor_has_permission(actor_uuid,d.branch_id, 'delivery.read')
              and private.evidence_actor_has_permission(actor_uuid,d.branch_id, 'delivery.verify')
          )
        )
        or (
          e.context_type = 'PAYMENT_NOTICE'
          and private.evidence_actor_customer_role(actor_uuid,e.customer_id) in ('OWNER','FINANCE_CONTACT')
        )
        or (
          e.context_type = 'PAYMENT_NOTICE'
          and private.evidence_actor_has_permission(actor_uuid,(select c.branch_id from public.customers c where c.id = e.customer_id), 'finance.payment_notice.review')
        )
      )
  )
$function$
;
revoke all on function private.evidence_actor_portal_access(uuid,uuid,boolean) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.finalize_portal_evidence(target_evidence_id uuid, target_checksum_sha256 text, target_byte_size bigint, operation_id uuid)
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
  select * into evidence from public.portal_evidence_objects e where e.id = target_evidence_id;
  if evidence.id is null or evidence.uploaded_by <> (select auth.uid()) or not private.portal_evidence_access(evidence.id, false) then
    raise exception 'evidence_finalize_forbidden' using errcode = '42501';
  end if;
  if target_byte_size <> evidence.declared_byte_size or target_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'evidence_integrity_mismatch' using errcode = '22023';
  end if;
  if evidence.object_state='PENDING' then raise exception 'storage_finalization_requires_server' using errcode='42501';end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('evidence', target_evidence_id, 'checksum', target_checksum_sha256, 'bytes', target_byte_size));
  select * into receipt from public.command_receipts r where r.operation_id = finalize_portal_evidence.operation_id;
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
  values(operation_id, (select auth.uid()), 'finalize_portal_evidence', payload_hash, 'portal_evidence', evidence.id, now());
  return evidence.id;
end $function$
;

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
  select * into evidence from public.portal_evidence_objects e where e.id = target_evidence_id;
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
  return evidence.id;
end $function$
;
revoke all on function public.finalize_portal_evidence_verified(uuid,uuid,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.finalize_portal_evidence_verified(uuid,uuid,text,bigint,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.finalize_evidence_upload(target_evidence_id uuid, checksum_sha256 text, byte_size bigint, operation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare evidence public.evidence_objects%rowtype; hash text; receipt public.command_receipts%rowtype;
begin
  select * into evidence from public.evidence_objects where id = target_evidence_id for update;
  if evidence.id is null then raise exception 'evidence_not_found' using errcode = '23503'; end if;
  if not private.has_permission(evidence.branch_id, 'evidence.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if checksum_sha256 !~ '^[0-9a-f]{64}$' or byte_size <= 0 then raise exception 'invalid_evidence_metadata' using errcode = '22023'; end if;
  if evidence.upload_state='PENDING' then raise exception 'storage_finalization_requires_server' using errcode='42501';end if;
  hash := private.command_payload_hash(jsonb_build_object('evidence_id', target_evidence_id, 'checksum', checksum_sha256, 'byte_size', byte_size));
  select * into receipt from public.command_receipts where command_receipts.operation_id = finalize_evidence_upload.operation_id;
  if found then if receipt.command_name <> 'finalize_evidence_upload' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if evidence.upload_state = 'VERIFIED' and (evidence.checksum_sha256 <> checksum_sha256 or evidence.byte_size <> byte_size) then raise exception 'evidence_payload_conflict' using errcode = '23505'; end if;
  update public.evidence_objects set upload_state = 'VERIFIED', checksum_sha256 = finalize_evidence_upload.checksum_sha256,
    byte_size = finalize_evidence_upload.byte_size, verified_at = coalesce(verified_at, now()) where id = target_evidence_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'finalize_evidence_upload', hash, 'evidence_object', target_evidence_id, now());
  return target_evidence_id;
end
$function$
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
revoke all on function public.finalize_evidence_upload_verified(uuid,uuid,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.finalize_evidence_upload_verified(uuid,uuid,text,bigint,uuid) to service_role;

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
      and private.evidence_storage_object_exists(e.bucket_name,e.object_path)
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
      and (not require_ready or(e.object_state='READY' and private.evidence_storage_object_exists(e.bucket_id,e.object_path)))
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

CREATE OR REPLACE FUNCTION private.can_write_portal_evidence_object(target_object_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.portal_evidence_objects e
    where e.object_path = target_object_path
      and e.uploaded_by = (select auth.uid())
      and e.object_state='PENDING'
      and private.portal_evidence_access(e.id, false)
  )
$function$
;

CREATE OR REPLACE FUNCTION private.guard_evidence_storage_finalization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if new.upload_state='VERIFIED' and old.upload_state<>'VERIFIED'
    and not private.evidence_storage_object_exists(new.bucket_name,new.object_path) then
    raise exception 'evidence_storage_object_unavailable' using errcode='55000';
  end if;
  return new;
end;
$function$
;

commit;
