-- D50 (Owner 03/11/2026): the Claude API key of the assistant is entered in Cài đặt → Trợ lý AI instead of the Vercel
-- environment. People with ai.manage set, replace or remove it; the key goes to Supabase Vault and is never shown again
-- (only its last 4 characters). Only the server reads it back, through the service role (src/modules/ai/api-key.ts);
-- no browser session can read it. Without a key here the server keeps using ANTHROPIC_API_KEY of the environment.
begin;

create table private.ai_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  api_key_last4 text check (api_key_last4 is null or api_key_last4 ~ '^[A-Za-z0-9_-]{4}$'),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz
);
alter table private.ai_settings enable row level security;
revoke all on private.ai_settings from public, anon, authenticated, service_role;
insert into private.ai_settings(singleton) values (true);

-- Vault write by name (create, or replace the newest). Missing Vault (local database) is reported to the caller.
create or replace function private.ai_secret_put(secret_name text, secret_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare existing uuid;
begin
  if to_regclass('vault.secrets') is null then raise exception 'ai_vault_unavailable' using errcode = '55000'; end if;
  execute 'select id from vault.secrets where name = $1 order by created_at desc limit 1' into existing using secret_name;
  if existing is null then execute 'select vault.create_secret($1, $2)' using secret_value, secret_name;
  else execute 'select vault.update_secret($1, $2)' using existing, secret_value; end if;
end $$;
revoke all on function private.ai_secret_put(text, text) from public, anon, authenticated, service_role;

create or replace function public.ai_api_key_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s private.ai_settings%rowtype;
begin
  if auth.uid() is null or not private.has_any_permission('ai.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from private.ai_settings;
  return jsonb_build_object(
    'in_app', private.automation_secret('hx_anthropic_api_key') is not null,
    'last4', s.api_key_last4,
    'updated_at', s.updated_at,
    'updated_by_name', (select e.display_name from public.employees e where e.auth_user_id = s.updated_by));
end $$;

create or replace function public.set_ai_api_key(api_key text, operation_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  key text := trim(coalesce(api_key, ''));
  s private.ai_settings%rowtype;
begin
  if auth.uid() is null or not private.has_any_permission('ai.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if operation_id is null then raise exception 'operation_id_required' using errcode = '22023'; end if;
  if key !~ '^sk-ant-[A-Za-z0-9_-]{20,250}$' then raise exception 'ai_api_key_invalid' using errcode = '22023'; end if;
  perform private.ai_secret_put('hx_anthropic_api_key', key);
  update private.ai_settings set api_key_last4 = right(key, 4), updated_by = auth.uid(), updated_at = now() returning * into s;
  insert into public.audit_events(actor_auth_user_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (auth.uid(), 'ai.api_key_set', 'ai_settings', s.id, operation_id, array['api_key']);
  return s.api_key_last4;
end $$;

-- "Gỡ khóa": the Vault secret is emptied (an empty secret counts as none), the server falls back to the environment.
create or replace function public.clear_ai_api_key(operation_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare s private.ai_settings%rowtype;
begin
  if auth.uid() is null or not private.has_any_permission('ai.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if operation_id is null then raise exception 'operation_id_required' using errcode = '22023'; end if;
  if private.automation_secret('hx_anthropic_api_key') is not null then perform private.ai_secret_put('hx_anthropic_api_key', ''); end if;
  update private.ai_settings set api_key_last4 = null, updated_by = auth.uid(), updated_at = now() returning * into s;
  insert into public.audit_events(actor_auth_user_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (auth.uid(), 'ai.api_key_cleared', 'ai_settings', s.id, operation_id, array['api_key']);
  return true;
end $$;

-- The key itself, for the server only (service role). No signed-in session, and no anonymous caller, may run this.
create or replace function public.ai_api_key_for_server() returns text
language sql stable security definer set search_path = '' as $$
  select private.automation_secret('hx_anthropic_api_key')
$$;

revoke all on function public.ai_api_key_status(), public.set_ai_api_key(text, uuid), public.clear_ai_api_key(uuid),
  public.ai_api_key_for_server() from public, anon, authenticated;
grant execute on function public.ai_api_key_status(), public.set_ai_api_key(text, uuid), public.clear_ai_api_key(uuid) to authenticated;
grant execute on function public.ai_api_key_for_server() to service_role;

commit;
