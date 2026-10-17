-- FB2 Đợt 7, owner request 17/10/2026: the company logo, uploaded in Cài đặt and printed on documents next to the company
-- details. One small PNG or JPEG (≤ 300 KB) kept in the company_profile row, so documents read it with the signed-in user's
-- own access like the rest of the profile (no storage bucket, no service key). Only roles.manage writes it, through
-- save_company_logo; replacing or removing it is checked against the logo last read, without touching the profile version.
begin;

alter table public.company_profile add column logo_mime text check (logo_mime is null or logo_mime in ('image/png', 'image/jpeg'));
alter table public.company_profile add column logo_base64 text check (logo_base64 is null or char_length(logo_base64) <= 409600);
alter table public.company_profile add column logo_sha256 text check (logo_sha256 is null or logo_sha256 ~ '^[0-9a-f]{64}$');
alter table public.company_profile add constraint company_logo_complete
  check ((logo_mime is null) = (logo_base64 is null) and (logo_mime is null) = (logo_sha256 is null));

create or replace function public.save_company_logo(target_branch_id uuid, logo_mime text, logo_base64 text, expected_logo_sha256 text, operation_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  current_row public.company_profile%rowtype;
  bytes bytea;
  new_sha text;
  hash text;
  receipt public.command_receipts%rowtype;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if logo_base64 is not null then
    if logo_mime is null or logo_mime not in ('image/png', 'image/jpeg') then raise exception 'company_logo_invalid' using errcode = '22023'; end if;
    begin
      bytes := decode(regexp_replace(logo_base64, '\s', '', 'g'), 'base64');
    exception when others then
      raise exception 'company_logo_invalid' using errcode = '22023';
    end;
    if octet_length(bytes) = 0 or octet_length(bytes) > 307200 then raise exception 'company_logo_too_large' using errcode = '22023'; end if;
    -- The file must really be what it claims: PNG signature or JPEG start-of-image marker.
    if (logo_mime = 'image/png' and substring(bytes from 1 for 8) <> '\x89504e470d0a1a0a'::bytea)
      or (logo_mime = 'image/jpeg' and substring(bytes from 1 for 3) <> '\xffd8ff'::bytea) then
      raise exception 'company_logo_invalid' using errcode = '22023';
    end if;
    new_sha := encode(sha256(bytes), 'hex');
  end if;
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'mime', case when bytes is null then null else logo_mime end,
    'sha256', new_sha, 'expected', expected_logo_sha256));
  select * into receipt from public.command_receipts r where r.operation_id = save_company_logo.operation_id;
  if found then
    if receipt.command_name <> 'save_company_logo' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return new_sha;
  end if;

  select * into current_row from public.company_profile where singleton for update;
  if current_row.id is null then raise exception 'company_name_required' using errcode = '22023'; end if;
  if current_row.logo_sha256 is distinct from expected_logo_sha256 then raise exception 'company_logo_changed' using errcode = 'PT409'; end if;
  update public.company_profile
    set logo_mime = case when bytes is null then null else save_company_logo.logo_mime end,
        logo_base64 = case when bytes is null then null else replace(encode(bytes, 'base64'), E'\n', '') end,
        logo_sha256 = new_sha, updated_by = (select auth.uid()), updated_at = now()
    where id = current_row.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, case when bytes is null then 'company_profile.logo_removed' else 'company_profile.logo_saved' end,
    'company_profile', current_row.id, save_company_logo.operation_id, array['logo']);
  insert into public.command_receipts values (save_company_logo.operation_id, (select auth.uid()), 'save_company_logo', hash, 'company_profile', current_row.id, now());
  return new_sha;
end
$function$;

revoke all on function public.save_company_logo(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.save_company_logo(uuid, text, text, text, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
