-- FB2 Đợt 7, owner decision D10 (16/10/2026): the company details printed on documents (sales/purchase orders, delivery
-- notes, receipts, debt statements) instead of the fixed "Hiền Xa ERP". One row for the whole company; branches stay
-- printed as today. Readable by any signed-in user because it appears on documents handed to customers; written only
-- through save_company_profile by someone holding roles.manage (the owner).
begin;

create table public.company_profile (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  tax_code text check (tax_code is null or tax_code ~ '^[0-9]{10}(-[0-9]{3})?$'),
  address text check (address is null or char_length(address) <= 300),
  phone text check (phone is null or char_length(phone) between 6 and 30),
  email text check (email is null or (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  bank_name text check (bank_name is null or char_length(bank_name) <= 120),
  bank_account_number text check (bank_account_number is null or bank_account_number ~ '^[0-9A-Za-z.-]{4,40}$'),
  bank_account_holder text check (bank_account_holder is null or char_length(bank_account_holder) <= 120),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.company_profile enable row level security;
revoke all on public.company_profile from anon, authenticated;
grant select on public.company_profile to authenticated;
create policy company_profile_select on public.company_profile for select to authenticated using ((select auth.uid()) is not null);

create or replace function public.save_company_profile(target_branch_id uuid, profile jsonb, expected_version integer, operation_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  current_row public.company_profile%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  clean jsonb;
  result_version integer;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(profile) is distinct from 'object' then raise exception 'company_profile_invalid' using errcode = '22023'; end if;
  -- Blank text means "not printed"; nothing else is accepted.
  select coalesce(jsonb_object_agg(key, nullif(trim(value #>> '{}'), '')), '{}') into clean
  from jsonb_each(profile) where key in ('legal_name', 'tax_code', 'address', 'phone', 'email', 'bank_name', 'bank_account_number', 'bank_account_holder');
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'profile', clean, 'version', expected_version));
  select * into receipt from public.command_receipts r where r.operation_id = save_company_profile.operation_id;
  if found then
    if receipt.command_name <> 'save_company_profile' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return (select version from public.company_profile where singleton);
  end if;
  if clean->>'legal_name' is null then raise exception 'company_name_required' using errcode = '22023'; end if;

  select * into current_row from public.company_profile where singleton for update;
  if current_row.id is null then
    if expected_version is not null then raise exception 'company_profile_changed' using errcode = 'PT409'; end if;
    insert into public.company_profile(legal_name, tax_code, address, phone, email, bank_name, bank_account_number, bank_account_holder, updated_by)
    values (clean->>'legal_name', clean->>'tax_code', clean->>'address', clean->>'phone', clean->>'email', clean->>'bank_name',
      clean->>'bank_account_number', clean->>'bank_account_holder', (select auth.uid()))
    returning id, version into current_row.id, result_version;
  else
    if expected_version is distinct from current_row.version then raise exception 'company_profile_changed' using errcode = 'PT409'; end if;
    update public.company_profile set legal_name = clean->>'legal_name', tax_code = clean->>'tax_code', address = clean->>'address',
      phone = clean->>'phone', email = clean->>'email', bank_name = clean->>'bank_name', bank_account_number = clean->>'bank_account_number',
      bank_account_holder = clean->>'bank_account_holder', version = version + 1, updated_by = (select auth.uid()), updated_at = now()
    where id = current_row.id returning version into result_version;
  end if;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'company_profile.saved', 'company_profile', current_row.id, save_company_profile.operation_id,
    array['legal_name', 'tax_code', 'address', 'phone', 'email', 'bank_name', 'bank_account_number', 'bank_account_holder']);
  insert into public.command_receipts values (save_company_profile.operation_id, (select auth.uid()), 'save_company_profile', hash, 'company_profile', current_row.id, now());
  return result_version;
end
$function$;

revoke all on function public.save_company_profile(uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.save_company_profile(uuid, jsonb, integer, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
