-- D50: the Claude API key entered in Cài đặt → Trợ lý AI. Only ai.manage sets / replaces / removes it, the format is
-- checked, only the last 4 characters are ever returned to a session, each change is audited, and only the service role
-- reads the key back. Supabase Vault is stood in for this test.
do $standins$
begin
  if to_regclass('vault.secrets') is null then
    create schema if not exists vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(), name text, secret text, created_at timestamptz not null default now());
    create view vault.decrypted_secrets as select id, name, secret as decrypted_secret, created_at from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text) returns uuid language sql as
      'insert into vault.secrets(name, secret) values (new_name, new_secret) returning id';
    create function vault.update_secret(secret_id uuid, new_secret text) returns void language sql as
      'update vault.secrets set secret = new_secret where id = secret_id';
  end if;
end
$standins$;

do $test$
declare
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  reader_login constant uuid := '10000000-0000-4000-8000-000000000003';
  key_a constant text := 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA-wxyz';
  key_b constant text := 'sk-ant-api03-BBBBBBBBBBBBBBBBBBBBBBBB_9Q8r';
  failed text; status jsonb; last4 text; audits bigint;
begin
  -- A person without ai.manage can neither see the status nor change the key.
  perform pg_temp.act_as(reader_login);
  failed := null; begin perform public.ai_api_key_status(); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('reader cannot see the key status, got %s', failed);
  failed := null; begin perform public.set_ai_api_key(key_a, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('reader cannot set the key, got %s', failed);
  failed := null; begin perform public.clear_ai_api_key(gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('reader cannot remove the key, got %s', failed);

  -- No key in the app yet.
  perform pg_temp.act_as(owner_login);
  status := public.ai_api_key_status();
  assert status->>'in_app' = 'false' and status->>'last4' is null, format('no key at first, got %s', status);

  -- The format is checked; a good key is stored and only its last 4 characters come back.
  failed := null; begin perform public.set_ai_api_key('not-a-key', gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'ai_api_key_invalid', format('format checked, got %s', failed);
  failed := null; begin perform public.set_ai_api_key(key_a, null); exception when others then failed := sqlerrm; end;
  assert failed = 'operation_id_required', format('operation id required, got %s', failed);
  last4 := public.set_ai_api_key('  ' || key_a || ' ', gen_random_uuid());
  assert last4 = 'wxyz', format('last 4 returned, got %s', last4);
  status := public.ai_api_key_status();
  assert status->>'in_app' = 'true' and status->>'last4' = 'wxyz' and status->>'updated_by_name' = 'Nhân viên thử 1'
    and status->>'updated_at' is not null, format('status after set, got %s', status);
  assert status::text not like '%AAAAAAAA%', 'the key itself never reaches a session';

  -- Replacing keeps one secret with the new value.
  last4 := public.set_ai_api_key(key_b, gen_random_uuid());
  assert last4 = '9Q8r', format('replaced, got %s', last4);

  -- A signed-in session cannot read the key back; the service role can.
  failed := null; begin perform public.ai_api_key_for_server(); exception when others then failed := sqlerrm; end;
  assert failed like 'permission denied%', format('session cannot read the key, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select count(*) from vault.secrets where name = 'hx_anthropic_api_key') = 1, 'one Vault secret';
  set local role service_role;
  assert public.ai_api_key_for_server() = key_b, 'the server reads the current key';
  reset role;
  assert not has_function_privilege('anon', 'public.ai_api_key_for_server()', 'execute'), 'anon cannot read the key';
  assert not has_function_privilege('authenticated', 'public.ai_api_key_for_server()', 'execute'), 'sessions cannot read the key';
  assert not has_function_privilege('anon', 'public.set_ai_api_key(text, uuid)', 'execute'), 'anon cannot set the key';

  -- Removing: the server falls back to the environment (no key here), the status says so.
  perform pg_temp.act_as(owner_login);
  assert public.clear_ai_api_key(gen_random_uuid()), 'removed';
  status := public.ai_api_key_status();
  assert status->>'in_app' = 'false' and status->>'last4' is null, format('status after remove, got %s', status);
  perform pg_temp.act_as_admin();
  set local role service_role;
  assert public.ai_api_key_for_server() is null, 'no key after remove';
  reset role;

  -- Every change is audited, without the key.
  select count(*) into audits from public.audit_events where entity_type = 'ai_settings' and action in ('ai.api_key_set', 'ai.api_key_cleared');
  assert audits = 3, format('three audited changes, got %s', audits);
  assert not exists (select 1 from public.audit_events where entity_type = 'ai_settings' and coalesce(reason, '') like '%sk-ant%'), 'no key in the audit';
end
$test$;
