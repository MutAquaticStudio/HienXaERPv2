-- Secure, opt-in metadata and per-document boundary for SO/PO bulk DRAFT import.
-- Existing SO/PO RPCs remain the only writer of commercial documents.
begin;

create table private.bulk_import_feature_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict
);
insert into private.bulk_import_feature_settings(singleton, enabled) values (true, false);

create table private.bulk_import_runs (
  id uuid primary key,
  branch_id uuid not null references public.branches(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  document_kind text not null check (document_kind in ('SO', 'PO')),
  state text not null default 'UPLOADING' check (state in ('UPLOADING', 'REVIEW', 'PARTIAL', 'COMPLETE', 'FAILED', 'EXPIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  check (expires_at > created_at),
  unique (id, branch_id, actor_auth_user_id)
);
create index bulk_import_runs_actor_idx on private.bulk_import_runs(actor_auth_user_id, branch_id, created_at desc);

create table private.bulk_import_files (
  id uuid primary key,
  run_id uuid not null references private.bulk_import_runs(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  bucket_id text not null default 'bulk-import-private' check (bucket_id = 'bulk-import-private'),
  object_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  upload_state text not null default 'UPLOADING' check (upload_state in ('UPLOADING', 'VERIFIED', 'EXPIRED')),
  storage_deleted_at timestamptz,
  mapping_config jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping_config) = 'object' and octet_length(mapping_config::text) <= 65536),
  review_overrides jsonb not null default '[]'::jsonb check (jsonb_typeof(review_overrides) = 'array' and octet_length(review_overrides::text) <= 800000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, id),
  foreign key (run_id, branch_id, actor_auth_user_id)
    references private.bulk_import_runs(id, branch_id, actor_auth_user_id) on delete restrict
);
create index bulk_import_files_run_idx on private.bulk_import_files(run_id, created_at);

create table private.bulk_import_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references private.bulk_import_runs(id) on delete restrict,
  file_id uuid not null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  document_kind text not null check (document_kind in ('SO', 'PO')),
  group_key text not null check (char_length(group_key) between 1 and 128),
  source_namespace text not null check (char_length(trim(source_namespace)) between 1 and 120),
  source_period text not null check (char_length(trim(source_period)) between 1 and 40),
  source_reference text not null check (char_length(trim(source_reference)) between 1 and 160),
  source_namespace_key text generated always as (upper(regexp_replace(trim(source_namespace), '\s+', ' ', 'g'))) stored,
  source_period_key text generated always as (upper(regexp_replace(trim(source_period), '\s+', ' ', 'g'))) stored,
  source_reference_key text generated always as (upper(regexp_replace(trim(source_reference), '\s+', ' ', 'g'))) stored,
  operation_id uuid not null unique,
  state text not null default 'READY' check (state in ('READY', 'NEEDS_REVIEW', 'INVALID', 'DUPLICATE', 'CREATED', 'FAILED', 'REPLACED')),
  validation_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_issues) = 'array' and octet_length(validation_issues::text) <= 16384),
  candidate_payload jsonb check (candidate_payload is null or (jsonb_typeof(candidate_payload) = 'object' and octet_length(candidate_payload::text) <= 65536)),
  result_entity_id uuid,
  duplicate_of_document_id uuid references private.bulk_import_documents(id) on delete restrict,
  duplicate_reason text check (duplicate_reason is null or char_length(duplicate_reason) between 3 and 500),
  source_occurrence integer check (source_occurrence is null or source_occurrence > 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, file_id, group_key),
  unique (branch_id, document_kind, source_namespace_key, source_period_key, source_reference_key, source_occurrence),
  foreign key (run_id, branch_id, actor_auth_user_id)
    references private.bulk_import_runs(id, branch_id, actor_auth_user_id) on delete restrict,
  foreign key (run_id, file_id)
    references private.bulk_import_files(run_id, id) on delete restrict,
  check ((state = 'CREATED') = (result_entity_id is not null and source_occurrence is not null)),
  check (state <> 'CREATED' or candidate_payload is not null),
  check (state not in ('READY', 'DUPLICATE', 'CREATED') or candidate_payload is not null)
);
create index bulk_import_documents_source_idx on private.bulk_import_documents(
  branch_id, document_kind, source_namespace_key, source_period_key, source_reference_key, source_occurrence desc
);
create index bulk_import_documents_actor_idx on private.bulk_import_documents(run_id, actor_auth_user_id, state);

alter table private.bulk_import_feature_settings enable row level security;
alter table private.bulk_import_runs enable row level security;
alter table private.bulk_import_files enable row level security;
alter table private.bulk_import_documents enable row level security;
alter table private.bulk_import_feature_settings force row level security;
alter table private.bulk_import_runs force row level security;
alter table private.bulk_import_files force row level security;
alter table private.bulk_import_documents force row level security;
revoke all on private.bulk_import_feature_settings, private.bulk_import_runs, private.bulk_import_files, private.bulk_import_documents
  from public, anon, authenticated, service_role;

create function private.bulk_import_allowed(target_branch_id uuid, target_kind text)
returns boolean language sql stable security definer set search_path = '' as $allowed$
  select coalesce((select enabled from private.bulk_import_feature_settings where singleton), false)
    and case target_kind
      when 'SO' then private.has_permission(target_branch_id, 'orders.create') and private.has_permission(target_branch_id, 'orders.read')
      when 'PO' then private.has_permission(target_branch_id, 'purchasing.create') and private.has_permission(target_branch_id, 'purchasing.read')
        and private.has_permission(target_branch_id, 'purchasing.price.read')
      else false
    end
$allowed$;
revoke all on function private.bulk_import_allowed(uuid, text) from public, anon, authenticated, service_role;

create function private.bulk_import_can_access_file(target_bucket_id text, target_object_path text)
returns boolean language sql stable security definer set search_path = '' as $access$
  select target_bucket_id = 'bulk-import-private' and exists (
    select 1 from private.bulk_import_files f
    join private.bulk_import_runs r on r.id = f.run_id and r.branch_id = f.branch_id and r.actor_auth_user_id = f.actor_auth_user_id
    where f.bucket_id = target_bucket_id and f.object_path = target_object_path
      and f.actor_auth_user_id = (select auth.uid())
      and f.upload_state in ('UPLOADING', 'VERIFIED')
      and r.expires_at > now() and r.state <> 'EXPIRED'
      and private.bulk_import_allowed(f.branch_id, r.document_kind)
  )
$access$;
revoke all on function private.bulk_import_can_access_file(text, text) from public, anon;
grant execute on function private.bulk_import_can_access_file(text, text) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'bulk_import_requires_supabase_storage';
  end if;
  if exists (select 1 from storage.buckets where id = 'bulk-import-private') then
    raise exception 'bulk_import_bucket_id_already_in_use';
  end if;
  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('bulk-import-private', 'bulk-import-private', false, 10485760,
    array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]);
  execute 'drop policy if exists bulk_import_file_insert on storage.objects';
  execute 'create policy bulk_import_file_insert on storage.objects for insert to authenticated with check (bucket_id = ''bulk-import-private'' and private.bulk_import_can_access_file(bucket_id, name))';
  execute 'drop policy if exists bulk_import_file_select on storage.objects';
  execute 'create policy bulk_import_file_select on storage.objects for select to authenticated using (bucket_id = ''bulk-import-private'' and private.bulk_import_can_access_file(bucket_id, name))';
  execute 'drop policy if exists bulk_import_file_no_update on storage.objects';
  execute 'create policy bulk_import_file_no_update on storage.objects as restrictive for update to authenticated using (bucket_id <> ''bulk-import-private'') with check (bucket_id <> ''bulk-import-private'')';
  execute 'drop policy if exists bulk_import_file_no_delete on storage.objects';
  execute 'create policy bulk_import_file_no_delete on storage.objects as restrictive for delete to authenticated using (bucket_id <> ''bulk-import-private'')';
end
$storage$;

create function public.bulk_import_feature_status(target_branch_id uuid, target_kind text)
returns boolean language sql stable security definer set search_path = '' as $status$
  select auth.uid() is not null and private.bulk_import_allowed(target_branch_id, target_kind)
$status$;
revoke all on function public.bulk_import_feature_status(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.bulk_import_feature_status(uuid, text) to authenticated;

create function public.list_expired_bulk_import_files(target_limit integer default 100)
returns table(file_id uuid, bucket_id text, object_path text)
language plpgsql stable security definer set search_path = '' as $expired$
begin
  if auth.role() is distinct from 'service_role' or target_limit not between 1 and 500 then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select f.id, f.bucket_id, f.object_path from private.bulk_import_files f
    join private.bulk_import_runs r on r.id = f.run_id
    where r.expires_at <= now() and f.storage_deleted_at is null
    order by r.expires_at, f.created_at limit target_limit;
end
$expired$;
revoke all on function public.list_expired_bulk_import_files(integer) from public, anon, authenticated;
grant execute on function public.list_expired_bulk_import_files(integer) to service_role;

create function public.mark_bulk_import_file_deleted(target_file_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $deleted$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  update private.bulk_import_files set upload_state = 'EXPIRED', storage_deleted_at = coalesce(storage_deleted_at, now()), updated_at = now()
    where id = target_file_id and exists (select 1 from private.bulk_import_runs r where r.id = run_id and r.expires_at <= now());
  get diagnostics changed = row_count;
  update private.bulk_import_runs r set state = 'EXPIRED', updated_at = now()
    where r.id = (select f.run_id from private.bulk_import_files f where f.id = target_file_id)
      and r.expires_at <= now() and not exists (select 1 from private.bulk_import_files f where f.run_id = r.id and f.storage_deleted_at is null);
  if changed = 0 and not exists (select 1 from private.bulk_import_files where id = target_file_id and storage_deleted_at is not null) then
    raise exception 'bulk_import_file_not_expired' using errcode = '22023';
  end if;
  return true;
end
$deleted$;
revoke all on function public.mark_bulk_import_file_deleted(uuid) from public, anon, authenticated;
grant execute on function public.mark_bulk_import_file_deleted(uuid) to service_role;

create function private.create_bulk_import_run(target_branch_id uuid, target_kind text, target_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $run$
declare r private.bulk_import_runs%rowtype;
begin
  if auth.uid() is null or target_run_id is null or not private.bulk_import_allowed(target_branch_id, target_kind) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from private.bulk_import_runs where id = target_run_id) then
    perform pg_advisory_xact_lock(hashtextextended('bulk-import-run|' || target_branch_id::text || '|' || auth.uid()::text, 0));
    if not exists (select 1 from private.bulk_import_runs where id = target_run_id)
      and ((select count(*) from private.bulk_import_runs where actor_auth_user_id = auth.uid() and branch_id = target_branch_id
      and created_at > now() - interval '30 days') >= 10
      or (select count(*) from private.bulk_import_runs where actor_auth_user_id = auth.uid() and branch_id = target_branch_id
      and created_at > now() - interval '1 hour') >= 3) then
      raise exception 'bulk_import_rate_limited' using errcode = '55000';
    end if;
  end if;
  insert into private.bulk_import_runs(id, branch_id, actor_auth_user_id, document_kind)
  values (target_run_id, target_branch_id, auth.uid(), target_kind) on conflict (id) do nothing;
  select * into r from private.bulk_import_runs where id = target_run_id for update;
  if r.actor_auth_user_id is distinct from auth.uid() or r.branch_id is distinct from target_branch_id
    or r.document_kind is distinct from target_kind or r.expires_at <= now() then
    raise exception 'operation_payload_conflict' using errcode = '23505';
  end if;
  return jsonb_build_object('run_id', r.id, 'state', r.state, 'expires_at', r.expires_at);
end
$run$;
revoke all on function private.create_bulk_import_run(uuid, text, uuid) from public, anon, authenticated, service_role;

create function public.register_bulk_import_file(target_run_id uuid, target_file_id uuid, target_file_name text, target_byte_size bigint,
  target_branch_id uuid, target_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $file$
declare r private.bulk_import_runs%rowtype; f private.bulk_import_files%rowtype; path text;
begin
  if target_file_id is null or target_file_name is null or char_length(target_file_name) not between 1 and 255
    or target_file_name ~ '[[:cntrl:]/\\]' or lower(target_file_name) !~ '\.xlsx$'
    or target_byte_size not between 1 and 10485760 then
    raise exception 'invalid_bulk_import_file' using errcode = '22023';
  end if;
  perform private.create_bulk_import_run(target_branch_id, target_kind, target_run_id);
  select * into r from private.bulk_import_runs where id = target_run_id and actor_auth_user_id = auth.uid() for update;
  if r.id is null or r.branch_id is distinct from target_branch_id or r.document_kind is distinct from target_kind
    or not private.bulk_import_allowed(r.branch_id, r.document_kind) or r.expires_at <= now()
    or r.state in ('COMPLETE', 'EXPIRED') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from private.bulk_import_files where id = target_file_id)
    and (select count(*) from private.bulk_import_files where run_id = r.id) >= 5 then
    raise exception 'bulk_import_file_limit' using errcode = '55000';
  end if;
  path := r.branch_id::text || '/' || r.actor_auth_user_id::text || '/' || r.id::text || '/' || target_file_id::text || '.xlsx';
  insert into private.bulk_import_files(id, run_id, branch_id, actor_auth_user_id, object_path, original_filename, byte_size)
    values (target_file_id, r.id, r.branch_id, r.actor_auth_user_id, path, target_file_name, target_byte_size)
    on conflict (id) do nothing;
  select * into f from private.bulk_import_files where id = target_file_id for update;
  if f.run_id is distinct from r.id or f.actor_auth_user_id is distinct from auth.uid() or f.branch_id is distinct from r.branch_id
    or f.object_path is distinct from path or f.original_filename is distinct from target_file_name or f.byte_size is distinct from target_byte_size then
    raise exception 'operation_payload_conflict' using errcode = '23505';
  end if;
  return jsonb_build_object('file_id', f.id, 'bucket_id', f.bucket_id, 'object_path', f.object_path, 'upload_state', f.upload_state);
end
$file$;

create function public.finish_bulk_import_upload(target_file_id uuid, target_byte_size bigint, target_checksum_sha256 text)
returns jsonb language plpgsql security definer set search_path = '' as $finish$
declare f private.bulk_import_files%rowtype; r private.bulk_import_runs%rowtype; stored_size bigint;
begin
  select * into f from private.bulk_import_files where id = target_file_id and actor_auth_user_id = auth.uid() for update;
  select * into r from private.bulk_import_runs where id = f.run_id;
  if f.id is null or r.id is null or not private.bulk_import_allowed(f.branch_id, r.document_kind) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.expires_at <= now() or r.state = 'EXPIRED' then raise exception 'forbidden' using errcode = '42501'; end if;
  if f.byte_size is distinct from target_byte_size or target_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_bulk_import_upload' using errcode = '22023';
  end if;
  select case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else null end into stored_size
    from storage.objects where bucket_id = f.bucket_id and name = f.object_path;
  if not exists (select 1 from storage.objects where bucket_id = f.bucket_id and name = f.object_path)
    or stored_size is not null and stored_size <> f.byte_size then
    raise exception 'bulk_import_upload_not_found' using errcode = '23503';
  end if;
  if f.upload_state = 'EXPIRED' then raise exception 'bulk_import_upload_expired' using errcode = '55000'; end if;
  if f.upload_state = 'VERIFIED' and f.checksum_sha256 is distinct from target_checksum_sha256 then
    raise exception 'operation_payload_conflict' using errcode = '23505';
  end if;
  update private.bulk_import_files set upload_state = 'VERIFIED', checksum_sha256 = target_checksum_sha256, updated_at = now()
    where id = f.id;
  update private.bulk_import_runs set state = 'REVIEW', updated_at = now() where id = r.id and state = 'UPLOADING';
  return jsonb_build_object('file_id', f.id, 'upload_state', 'VERIFIED', 'checksum_sha256', target_checksum_sha256);
end
$finish$;

create function public.save_bulk_import_review(target_file_id uuid, target_mapping jsonb, target_documents jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $review$
declare f private.bulk_import_files%rowtype; r private.bulk_import_runs%rowtype; item jsonb; d private.bulk_import_documents%rowtype;
  v_source_namespace text; v_source_period text; v_source_reference text; v_group_key text; v_operation_id uuid; candidate jsonb; incoming_state text; incoming_issues jsonb; existing_id uuid; duplicate_id uuid;
  saved_ids uuid[] := array[]::uuid[]; count_items integer := 0; new_state text;
begin
  select * into f from private.bulk_import_files where id = target_file_id and actor_auth_user_id = auth.uid() for update;
  select * into r from private.bulk_import_runs where id = f.run_id and actor_auth_user_id = auth.uid() for update;
  if f.id is null or r.id is null or f.upload_state <> 'VERIFIED' or not private.bulk_import_allowed(f.branch_id, r.document_kind)
    or r.expires_at <= now() or r.state in ('COMPLETE', 'EXPIRED') then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_mapping is null or jsonb_typeof(target_mapping) <> 'object'
    or octet_length((target_mapping - 'reviewOverrides')::text) > 65536
    or jsonb_typeof(coalesce(target_mapping->'reviewOverrides', '[]'::jsonb)) <> 'array'
    or octet_length(coalesce(target_mapping->'reviewOverrides', '[]'::jsonb)::text) > 800000
    or target_documents is null or jsonb_typeof(target_documents) <> 'array' or jsonb_array_length(target_documents) not between 1 and 100
    or octet_length(target_documents::text) > 1048576 then raise exception 'invalid_bulk_import_review' using errcode = '22023'; end if;
  if (select count(distinct docs.value->>'group_key') from jsonb_array_elements(target_documents) as docs(value)) <> jsonb_array_length(target_documents) then
    raise exception 'duplicate_bulk_import_group' using errcode = '23505';
  end if;

  update private.bulk_import_documents current_doc set state = 'REPLACED', updated_at = now(), version = version + 1
    where current_doc.run_id = r.id and current_doc.file_id = f.id and current_doc.state in ('READY', 'NEEDS_REVIEW', 'INVALID', 'DUPLICATE')
      and not (current_doc.group_key = any(array(select docs.value->>'group_key' from jsonb_array_elements(target_documents) as docs(value))));

  for item in select value from jsonb_array_elements(target_documents) loop
    count_items := count_items + 1;
    v_group_key := trim(item->>'group_key');
    v_operation_id := nullif(item->>'operation_id', '')::uuid;
    v_source_namespace := trim(item->>'source_namespace');
    v_source_period := trim(item->>'source_period');
    v_source_reference := trim(item->>'source_reference');
    candidate := nullif(item->'candidate_payload', 'null'::jsonb);
    incoming_state := coalesce(item->>'state', 'READY');
    incoming_issues := coalesce(item->'validation_issues', '[]'::jsonb);
    if incoming_state not in ('READY', 'NEEDS_REVIEW', 'INVALID') or jsonb_typeof(incoming_issues) is distinct from 'array'
      or octet_length(incoming_issues::text) > 16384
      or (incoming_state = 'READY' and (jsonb_typeof(candidate) is distinct from 'object'
        or (candidate->>'operation_id')::uuid is distinct from v_operation_id
        or (candidate->>'target_branch_id')::uuid is distinct from r.branch_id))
      or (incoming_state <> 'READY' and candidate is not null)
      then raise exception 'invalid_bulk_import_document' using errcode = '22023'; end if;
    if v_group_key is null or char_length(v_group_key) not between 1 and 128 or v_operation_id is null or v_source_namespace is null
      or char_length(v_source_namespace) not between 1 and 120 or v_source_period is null
      or char_length(v_source_period) not between 1 and 40 or v_source_reference is null
      or char_length(v_source_reference) not between 1 and 160
      or (incoming_state = 'READY' and (jsonb_typeof(candidate) is distinct from 'object' or octet_length(candidate::text) > 65536))
      then raise exception 'invalid_bulk_import_document' using errcode = '22023'; end if;

    select current_doc.id into existing_id from private.bulk_import_documents current_doc
      where current_doc.run_id = r.id and current_doc.file_id = f.id and current_doc.group_key = v_group_key for update;
    if existing_id is not null then
      select * into d from private.bulk_import_documents where id = existing_id;
      if d.operation_id is distinct from v_operation_id then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
      if d.state = 'CREATED' then
        if d.source_reference is distinct from v_source_reference or d.source_namespace is distinct from v_source_namespace
          or d.source_period is distinct from v_source_period or d.candidate_payload is distinct from candidate then
          raise exception 'operation_payload_conflict' using errcode = '23505';
        end if;
        saved_ids := array_append(saved_ids, d.id);
        continue;
      end if;
      if exists (select 1 from private.command_drafts c where c.operation_id = d.operation_id)
        and (d.source_reference is distinct from v_source_reference or d.source_namespace is distinct from v_source_namespace
          or d.source_period is distinct from v_source_period or d.candidate_payload is distinct from candidate) then
        raise exception 'operation_payload_conflict' using errcode = '23505';
      end if;
    end if;

    duplicate_id := null;
    select x.id into duplicate_id from private.bulk_import_documents x
      where x.branch_id = r.branch_id and x.document_kind = r.document_kind
        and x.source_namespace_key = upper(regexp_replace(v_source_namespace, '\s+', ' ', 'g'))
        and x.source_period_key = upper(regexp_replace(v_source_period, '\s+', ' ', 'g'))
        and x.source_reference_key = upper(regexp_replace(v_source_reference, '\s+', ' ', 'g'))
        and x.id is distinct from existing_id and x.source_occurrence is not null
      order by x.source_occurrence desc nulls last, x.created_at desc limit 1;
    new_state := case when incoming_state <> 'READY' then incoming_state
      when duplicate_id is null then 'READY' else 'DUPLICATE' end;
    if existing_id is null then
      insert into private.bulk_import_documents(run_id, file_id, branch_id, actor_auth_user_id, document_kind, group_key,
        source_namespace, source_period, source_reference, operation_id, state, validation_issues, candidate_payload, duplicate_of_document_id)
      values (r.id, f.id, r.branch_id, auth.uid(), r.document_kind, v_group_key,
        v_source_namespace, v_source_period, v_source_reference, v_operation_id, new_state, incoming_issues, candidate, duplicate_id) returning id into existing_id;
    else
      update private.bulk_import_documents as current_doc set source_namespace = v_source_namespace, source_period = v_source_period,
        source_reference = v_source_reference, candidate_payload = candidate, validation_issues = incoming_issues, state = new_state,
        duplicate_of_document_id = duplicate_id, duplicate_reason = null, result_entity_id = null,
        updated_at = now(), version = version + 1 where current_doc.id = existing_id;
    end if;
    saved_ids := array_append(saved_ids, existing_id);
  end loop;
  update private.bulk_import_files set mapping_config = target_mapping - 'reviewOverrides',
    review_overrides = coalesce(target_mapping->'reviewOverrides', '[]'::jsonb), updated_at = now() where id = f.id;
  update private.bulk_import_runs set state = 'REVIEW', updated_at = now() where id = r.id;
  return jsonb_build_object('file_id', f.id, 'saved_documents', to_jsonb(saved_ids), 'count', count_items);
end
$review$;

create function public.get_bulk_import_run(target_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $get_run$
declare r private.bulk_import_runs%rowtype; payload jsonb;
begin
  select * into r from private.bulk_import_runs where id = target_run_id and actor_auth_user_id = auth.uid();
  if r.id is null or r.expires_at <= now() or r.state = 'EXPIRED'
    or not private.bulk_import_allowed(r.branch_id, r.document_kind) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('run_id', r.id, 'branch_id', r.branch_id, 'document_kind', r.document_kind, 'state', r.state,
    'created_at', r.created_at, 'expires_at', r.expires_at,
    'files', coalesce((select jsonb_agg(jsonb_build_object('file_id', f.id, 'file_name', f.original_filename, 'object_path', f.object_path,
      'byte_size', f.byte_size, 'upload_state', f.upload_state, 'checksum_sha256', f.checksum_sha256,
      'mapping', f.mapping_config, 'review_overrides', f.review_overrides, 'documents', coalesce((select jsonb_agg(jsonb_build_object('document_id', d.id,
        'group_key', d.group_key, 'source_namespace', d.source_namespace, 'source_period', d.source_period,
        'source_reference', d.source_reference, 'operation_id', d.operation_id, 'state', d.state,
        'candidate_payload', d.candidate_payload, 'validation_issues', d.validation_issues, 'result_entity_id', d.result_entity_id,
        'duplicate_of_document_id', d.duplicate_of_document_id, 'duplicate_reason', d.duplicate_reason,
        'source_occurrence', d.source_occurrence, 'version', d.version) order by d.created_at)
        from private.bulk_import_documents d where d.run_id = f.run_id and d.file_id = f.id), '[]'::jsonb)) order by f.created_at)
      from private.bulk_import_files f where f.run_id = r.id), '[]'::jsonb)) into payload;
  return payload;
end
$get_run$;

create function public.create_bulk_import_document_draft(target_document_id uuid, target_payload jsonb, target_repeat_of uuid default null, target_repeat_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $create_doc$
declare d private.bulk_import_documents%rowtype; r private.bulk_import_runs%rowtype; previous private.bulk_import_documents%rowtype;
  command text; branch_from_payload uuid; actual_payload jsonb; operation uuid; result uuid; next_occurrence integer; receipt jsonb;
begin
  select * into d from private.bulk_import_documents where id = target_document_id and actor_auth_user_id = auth.uid() for update;
  select * into r from private.bulk_import_runs where id = d.run_id and actor_auth_user_id = auth.uid();
  if d.id is null or r.id is null or not private.bulk_import_allowed(d.branch_id, d.document_kind) or r.expires_at <= now()
    or d.state not in ('READY', 'DUPLICATE', 'CREATED') or target_payload is null or jsonb_typeof(target_payload) is distinct from 'object'
    or octet_length(target_payload::text) > 65536 then raise exception 'forbidden' using errcode = '42501'; end if;
  operation := d.operation_id;
  command := case d.document_kind when 'SO' then 'create_sales_order_draft' else 'create_purchase_order_draft' end;
  if (target_payload->>'operation_id')::uuid is distinct from operation
    or (target_payload->>'target_branch_id')::uuid is distinct from d.branch_id
    or d.candidate_payload is distinct from target_payload then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
  if d.state = 'CREATED' then
    return jsonb_build_object('status', 'CREATED', 'document_id', d.id, 'result_id', d.result_entity_id,
      'operation_id', d.operation_id, 'source_occurrence', d.source_occurrence);
  end if;
  actual_payload := private.bulk_commercial_draft_payload(command, target_payload);
  if d.document_kind = 'PO' and exists (select 1 from jsonb_array_elements(actual_payload->'lines') line where line ? 'linked_sales_order_line_id') then
    raise exception 'bulk_import_direct_purchase_not_supported' using errcode = '22023';
  end if;

  if d.state <> 'CREATED' then
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|', d.branch_id::text, d.document_kind,
      d.source_namespace_key, d.source_period_key, d.source_reference_key), 0));
    select * into previous from private.bulk_import_documents x
      where x.branch_id = d.branch_id and x.document_kind = d.document_kind
        and x.source_namespace_key = d.source_namespace_key and x.source_period_key = d.source_period_key
        and x.source_reference_key = d.source_reference_key and x.id is distinct from d.id and x.source_occurrence is not null
      order by x.source_occurrence desc limit 1 for update;
    if previous.id is not null then
      if target_repeat_of is distinct from previous.id or char_length(trim(coalesce(target_repeat_reason, ''))) not between 3 and 500 then
        update private.bulk_import_documents set state = 'DUPLICATE', duplicate_of_document_id = previous.id, updated_at = now(), version = version + 1 where id = d.id;
        return jsonb_build_object('status', 'DUPLICATE', 'document_id', d.id, 'previous_document_id', previous.id);
      end if;
      next_occurrence := previous.source_occurrence + 1;
    elsif target_repeat_of is not null or nullif(trim(coalesce(target_repeat_reason, '')), '') is not null then
      raise exception 'duplicate_acknowledgement_stale' using errcode = '23505';
    else
      next_occurrence := 1;
    end if;
    update private.bulk_import_documents set source_occurrence = next_occurrence,
      duplicate_of_document_id = case when previous.id is null then null else previous.id end,
      duplicate_reason = case when previous.id is null then null else trim(target_repeat_reason) end,
      state = 'READY', updated_at = now(), version = version + 1 where id = d.id;
  end if;

  perform public.save_command_draft(operation, command, d.branch_id,
    jsonb_build_array(jsonb_build_array('canonicalPayload', target_payload::text)));
  if d.document_kind = 'SO' then
    result := public.create_sales_order_draft(d.branch_id, (target_payload->>'target_customer_id')::uuid,
      (target_payload->>'target_site_id')::uuid, nullif(target_payload->>'requested_delivery_at', '')::timestamptz,
      target_payload->>'commercial_terms', target_payload->'order_lines', operation);
  else
    result := public.create_purchase_order_draft(d.branch_id, (target_payload->>'target_supplier_id')::uuid,
      (target_payload->>'target_warehouse_id')::uuid, nullif(target_payload->>'expected_at', '')::timestamptz,
      target_payload->>'commercial_terms', target_payload->'purchase_lines', operation);
  end if;
  update private.bulk_import_documents set state = 'CREATED', result_entity_id = result, updated_at = now(), version = version + 1 where id = d.id;
  update private.bulk_import_runs run set state = case
    when not exists (select 1 from private.bulk_import_documents pending where pending.run_id = run.id and pending.state not in ('CREATED', 'REPLACED')) then 'COMPLETE'
    when exists (select 1 from private.bulk_import_documents created where created.run_id = run.id and created.state = 'CREATED') then 'PARTIAL'
    else 'REVIEW' end, updated_at = now() where run.id = r.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), d.branch_id, 'bulk_import.document.created', case when d.document_kind = 'SO' then 'sales_order' else 'purchase_order' end,
      result, operation, array['source_namespace', 'source_period', 'source_reference', 'source_occurrence'],
      case when previous.id is null then null else trim(target_repeat_reason) end)
    on conflict do nothing;
  return jsonb_build_object('status', 'CREATED', 'document_id', d.id, 'result_id', result, 'operation_id', operation,
    'source_occurrence', coalesce(next_occurrence, d.source_occurrence));
end
$create_doc$;

create function public.get_bulk_import_document(target_document_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $get_doc$
declare d private.bulk_import_documents%rowtype; r private.bulk_import_runs%rowtype;
begin
  select * into d from private.bulk_import_documents where id = target_document_id and actor_auth_user_id = auth.uid();
  select * into r from private.bulk_import_runs where id = d.run_id and actor_auth_user_id = auth.uid();
  if d.id is null or r.id is null or r.expires_at <= now() or r.state = 'EXPIRED'
    or not private.bulk_import_allowed(d.branch_id, d.document_kind) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('document_id', d.id, 'state', d.state, 'operation_id', d.operation_id,
    'result_entity_id', d.result_entity_id, 'duplicate_of_document_id', d.duplicate_of_document_id,
    'source_occurrence', d.source_occurrence, 'version', d.version);
end
$get_doc$;

revoke all on function public.bulk_import_feature_status(uuid, text), public.register_bulk_import_file(uuid, uuid, text, bigint, uuid, text),
  public.finish_bulk_import_upload(uuid, bigint, text), public.save_bulk_import_review(uuid, jsonb, jsonb),
  public.get_bulk_import_run(uuid), public.create_bulk_import_document_draft(uuid, jsonb, uuid, text),
  public.get_bulk_import_document(uuid) from public, anon, authenticated;
grant execute on function public.bulk_import_feature_status(uuid, text), public.register_bulk_import_file(uuid, uuid, text, bigint, uuid, text),
  public.finish_bulk_import_upload(uuid, bigint, text), public.save_bulk_import_review(uuid, jsonb, jsonb),
  public.get_bulk_import_run(uuid), public.create_bulk_import_document_draft(uuid, jsonb, uuid, text),
  public.get_bulk_import_document(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
