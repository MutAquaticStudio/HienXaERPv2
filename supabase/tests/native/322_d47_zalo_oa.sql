-- D47: Zalo OA phase 1. OAuth with PKCE stores the tokens in Vault; business events (order confirmed, payment received,
-- daily debt reminder) put one ZALO message in the outbound queue for the customer's main phone, never twice and not for
-- customers who switched Zalo off; Zalo's answers are read from the body; the refresh token is used once. Zalo itself is
-- replaced by a stand-in.
insert into auth.users(id, email) values ('7f322000-0000-4000-8000-0000000000a1', 'chu322@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type, phone) values
  ('7f322000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'KH322', 'Khách thử 322', 'BUSINESS', '0912 345 678'),
  ('7f322000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-00000000000a', 'KH323', 'Khách không SĐT 323', 'BUSINESS', '024 3555 1234');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f322000-0000-4000-8000-0000000000a1', '7f322000-0000-4000-8000-000000000040', 'OWNER');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f322000-0000-4000-8000-000000000050', '7f322000-0000-4000-8000-000000000040', 'CT322', 'Công trình 322', 'Đại Mỗ, Hà Nội');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f322000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_VCB322', 'Vietcombank 322', 'BANK', '10000000-0000-4000-8000-000000000001');

-- A confirmed order with a debt of 3 000 000 ₫ due yesterday.
set local session_replication_role = replica;
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
values ('7f322000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-00000000000a', 'SO-2026-322001', '7f322000-0000-4000-8000-000000000040',
  '7f322000-0000-4000-8000-000000000050', 'Khách thử 322', 'Công trình 322', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, customer_id, site_id, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, created_by)
values ('7f322000-0000-4000-8000-000000000102', '20000000-0000-4000-8000-00000000000a', '7f322000-0000-4000-8000-000000000101', 'DLV-322001',
  '7f322000-0000-4000-8000-000000000040', '7f322000-0000-4000-8000-000000000050', 'Khách thử 322', 'Công trình 322', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
insert into public.delivery_verifications(id, delivery_id, delivery_result_id, verified_by)
values ('7f322000-0000-4000-8000-000000000103', '7f322000-0000-4000-8000-000000000102', gen_random_uuid(), '10000000-0000-4000-8000-000000000001');
insert into public.receivable_obligations(id, branch_id, customer_id, original_amount_vnd, due_date, recorded_by, opening_source_id, delivery_verification_id)
values ('7f322000-0000-4000-8000-000000000104', '20000000-0000-4000-8000-00000000000a', '7f322000-0000-4000-8000-000000000040', 3000000, current_date - 1,
  '10000000-0000-4000-8000-000000000001', null, '7f322000-0000-4000-8000-000000000103');
set local session_replication_role = origin;

-- A draft order of 1 500 000 ₫ that will be confirmed.
create function pg_temp.draft_order(suffix text) returns uuid language plpgsql as $$
declare id uuid := ('7f322000-0000-4000-8000-000000000' || suffix)::uuid;
begin
  insert into public.units_of_measure(id, code, name, symbol) values (('7f322000-0000-4000-8000-000000009' || suffix)::uuid, 'nt_kg322' || suffix, 'Kg 322' || suffix, 'kg')
    on conflict do nothing;
  insert into public.material_groups(id, code, name) values ('7f322000-0000-4000-8000-000000000900', 'NT_G322', 'Nhóm 322') on conflict do nothing;
  insert into public.materials(id, group_id, code, name, base_uom_id) values (('7f322000-0000-4000-8000-000000008' || suffix)::uuid,
    '7f322000-0000-4000-8000-000000000900', 'NT_M322' || suffix, 'Xi măng 322', ('7f322000-0000-4000-8000-000000009' || suffix)::uuid);
  insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
    delivery_address_snapshot, created_by)
  values (id, '20000000-0000-4000-8000-00000000000a', 'SO-2026-322' || suffix, '7f322000-0000-4000-8000-000000000040', '7f322000-0000-4000-8000-000000000050',
    'DRAFT', 'Khách thử 322', 'Công trình 322', 'Đại Mỗ', '10000000-0000-4000-8000-000000000001');
  insert into public.sales_order_lines(id, sales_order_id, line_number, material_id, material_name_snapshot, ordered_uom_id, base_uom_id, quantity,
    conversion_numerator, conversion_denominator, rounding_mode, unit_price_vnd, line_total_vnd, price_source_type, override_by, override_reason)
  values (gen_random_uuid(), id, 1, ('7f322000-0000-4000-8000-000000008' || suffix)::uuid, 'Xi măng 322', ('7f322000-0000-4000-8000-000000009' || suffix)::uuid,
    ('7f322000-0000-4000-8000-000000009' || suffix)::uuid, 10, 1, 1, 'HALF_UP', 150000, 1500000, 'MANUAL_APPROVED', '10000000-0000-4000-8000-000000000001', 'Giá thử');
  return id;
end $$;
create function pg_temp.confirm(target uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  update public.sales_orders set commercial_state = 'CONFIRMED', confirmed_at = now() where id = target;
  select set_config('request.jwt.claim.sub', '', true);
  set constraints all immediate;
  set constraints all deferred;
$$;
create function pg_temp.zalo_jobs(event text) returns bigint language sql as $$
  select count(*) from public.outbound_jobs where channel = 'ZALO' and payload->>'event' = event;
$$;

-- Supabase Vault and Zalo's token server, stood in for this test.
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
create table pg_temp.zalo_calls(form text, at timestamptz default clock_timestamp());
grant all on pg_temp.zalo_calls to authenticated;
create or replace function private.zalo_http_form(url text, header_name text, header_value text, form text, out status integer, out content text)
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into pg_temp.zalo_calls(form) values (form);
  n := (select count(*) from pg_temp.zalo_calls);
  if header_value <> 'app-secret-322' then status := 400; content := '{"error": -14014, "error_name": "Invalid secret key"}'; return; end if;
  if (form like 'code=GOOD%' or form like 'refresh_token=tok-r-%') and form not like 'refresh_token=tok-r-revoked%' then
    status := 200;
    content := json_build_object('access_token', 'tok-a-' || n, 'refresh_token', 'tok-r-' || n, 'expires_in', '90000', 'refresh_token_expires_in', '7776000')::text;
  else
    status := 400; content := '{"error": -14002, "error_name": "Invalid code"}';
  end if;
end $$;

do $test$
declare
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  customer constant uuid := '7f322000-0000-4000-8000-000000000040';
  url text; failed text; verifier text; state_token text; order_a uuid; order_b uuid; job public.outbound_jobs%rowtype; status jsonb;
  reminders integer;
begin
  -- Phone numbers.
  assert private.zalo_phone('0912 345 678') = '84912345678' and private.zalo_phone('+84 912-345-678') = '84912345678'
    and private.zalo_phone('024 3555 1234') is null and private.zalo_phone(null) is null, 'phones normalised to 84…';

  -- Not connected: an event sends nothing.
  order_a := pg_temp.draft_order('201');
  perform pg_temp.confirm(order_a);
  assert pg_temp.zalo_jobs('ORDER_CONFIRMED') = 0, 'nothing queued while Zalo is not connected';

  -- OAuth: only the owner (roles.manage), a real App ID and an https callback.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null; begin perform public.start_zalo_oauth('1234567', 'https://app.hienxavlxd.com/api/zalo/oauth/callback'); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('reader cannot connect, got %s', failed);
  perform pg_temp.act_as(owner_login);
  failed := null; begin perform public.start_zalo_oauth('abc', 'https://app.hienxavlxd.com/api/zalo/oauth/callback'); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_app_id_invalid', format('app id checked, got %s', failed);
  failed := null; begin perform public.start_zalo_oauth('1234567', 'http://evil.test/api/zalo/oauth/callback'); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_redirect_invalid', format('callback must be https, got %s', failed);
  url := public.start_zalo_oauth('1234567', 'https://app.hienxavlxd.com/api/zalo/oauth/callback');
  perform pg_temp.act_as_admin();
  select oauth_verifier, oauth_state into verifier, state_token from private.zalo_connection;
  assert url like 'https://oauth.zaloapp.com/v4/oa/permission?app_id=1234567&redirect_uri=https%3A%2F%2Fapp.hienxavlxd.com%2Fapi%2Fzalo%2Foauth%2Fcallback&code_challenge=%', url;
  assert url like '%code_challenge=' || private.zalo_base64url(extensions.digest(verifier, 'sha256')) || '&state=' || state_token, 'S256 challenge of the stored verifier';
  assert length(verifier) >= 43, 'PKCE verifier long enough';

  perform pg_temp.act_as(owner_login);
  failed := null; begin perform public.complete_zalo_oauth('GOOD', 'wrong-state', '999'); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_oauth_state_invalid', format('state checked, got %s', failed);
  failed := null; begin perform public.complete_zalo_oauth('GOOD', state_token, '999'); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_app_secret_missing', format('app secret must be set first, got %s', failed);
  perform pg_temp.act_as_admin();
  insert into vault.secrets(name, secret) values ('hx_zalo_app_secret', 'app-secret-322');
  perform pg_temp.act_as(owner_login);
  failed := null; begin perform public.complete_zalo_oauth('BAD', state_token, '999'); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_token_refused', format('a refused code is reported, got %s', failed);
  assert public.complete_zalo_oauth('GOOD', state_token, '999') = 'CONNECTED', 'connected';
  perform pg_temp.act_as_admin();
  assert (select state = 'CONNECTED' and oa_id = '999' and oauth_verifier is null and access_expires_at > now() + interval '24 hours' from private.zalo_connection), 'connection stored';
  assert (select form like 'code=GOOD&app_id=1234567&grant_type=authorization_code&code_verifier=' || verifier from pg_temp.zalo_calls order by at desc limit 1), 'PKCE verifier sent';
  assert private.automation_secret('hx_zalo_access_token') like 'tok-a-%' and private.automation_secret('hx_zalo_refresh_token') like 'tok-r-%', 'tokens in Vault';

  -- Templates: an event is sent only once its approved template is on.
  perform pg_temp.act_as(owner_login);
  failed := null; begin perform public.set_zalo_template('ORDER_CONFIRMED', '', true, 1); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_template_required', format('template id required, got %s', failed);
  perform public.set_zalo_template('ORDER_CONFIRMED', '111', true, 1);
  perform public.set_zalo_template('PAYMENT_RECEIVED', '222', true, 1);
  perform public.set_zalo_template('DEBT_REMINDER', '333', true, 1);
  failed := null; begin perform public.set_zalo_template('DELIVERY_DONE', '444', true, 7); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_template_version_conflict', format('stale version refused, got %s', failed);
  status := public.zalo_status();
  assert status->>'state' = 'CONNECTED' and status->>'send_mode' = 'development' and jsonb_array_length(status->'templates') = 4, 'status: ' || status::text;
  assert (status->'templates'->0->'params') = '["order_code", "order_date", "total", "site"]'::jsonb, 'params listed for the template';

  -- Order confirmed → one message to 84912345678, never twice.
  perform pg_temp.act_as_admin();
  order_b := pg_temp.draft_order('202');
  perform pg_temp.confirm(order_b);
  assert pg_temp.zalo_jobs('ORDER_CONFIRMED') = 1, 'one order message';
  select * into job from public.outbound_jobs where channel = 'ZALO' and payload->>'event' = 'ORDER_CONFIRMED';
  assert job.target = '84912345678' and job.payload->>'template_id' = '111' and job.payload->>'tracking_id' = job.id::text, 'to the main phone, with tracking id';
  assert job.payload->'template_data' = jsonb_build_object('order_code', 'SO-2026-322202', 'order_date', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'),
    'total', '1.500.000 ₫', 'site', 'Công trình 322'), 'order data: ' || (job.payload->'template_data')::text;
  perform pg_temp.confirm(order_b);
  assert pg_temp.zalo_jobs('ORDER_CONFIRMED') = 1, 'no second message';

  -- The customer switches Zalo off on the portal: nothing more; a stranger cannot switch it.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null; begin perform public.set_customer_zalo_notify(customer, false); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', format('another branch cannot, got %s', failed);
  perform pg_temp.act_as('7f322000-0000-4000-8000-0000000000a1');
  perform public.set_customer_zalo_notify(customer, false);
  assert public.customer_zalo_notify(customer) = false, 'the customer sees the switch off';
  perform pg_temp.act_as_admin();
  perform pg_temp.confirm(pg_temp.draft_order('203'));
  assert pg_temp.zalo_jobs('ORDER_CONFIRMED') = 1, 'switched off: no message';
  perform pg_temp.act_as(owner_login);
  perform public.set_customer_zalo_notify(customer, true);
  assert public.customer_zalo_notify(customer) = true, 'staff see it on again';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  assert public.customer_zalo_notify(customer) is null, 'another branch sees nothing';
  perform pg_temp.act_as(owner_login);

  -- Payment received → the balance after the allocation (3 000 000 − 1 000 000).
  perform public.post_payment('20000000-0000-4000-8000-00000000000a', 'RECEIPT', customer, null, '7f322000-0000-4000-8000-000000000002', 1000000, now(), 'CASH', null,
    jsonb_build_array(jsonb_build_object('obligation_id', '7f322000-0000-4000-8000-000000000104', 'amount_vnd', 1000000)), 0, gen_random_uuid());
  perform pg_temp.act_as_admin();
  set constraints all immediate; set constraints all deferred;
  assert pg_temp.zalo_jobs('PAYMENT_RECEIVED') = 1, 'one payment message';
  assert (select payload->'template_data'->>'amount' = '1.000.000 ₫' and payload->'template_data'->>'balance' = '2.000.000 ₫' and payload->'template_data'->>'customer' = 'Khách thử 322'
    from public.outbound_jobs where payload->>'event' = 'PAYMENT_RECEIVED'), 'payment data';

  -- Daily debt reminder: once a day for what is due.
  reminders := private.zalo_debt_reminders();
  assert reminders = 1 and private.zalo_debt_reminders() = 0, format('one reminder a day, got %s', reminders);
  assert (select payload->'template_data' = jsonb_build_object('customer', 'Khách thử 322', 'balance', '2.000.000 ₫', 'due_date', to_char(current_date - 1, 'DD/MM/YYYY'))
    from public.outbound_jobs where payload->>'event' = 'DEBT_REMINDER'), 'reminder data';

  -- Zalo's answers (HTTP 200 + error code in the body).
  select * into job from public.outbound_jobs where payload->>'event' = 'ORDER_CONFIRMED';
  perform private.settle_zalo_job(job, 200, '{"error": 0, "message": "Success", "data": {"msg_id": "m-322", "quota": {"dailyQuota": "500", "remainingQuota": "499"}}}');
  assert (select state = 'SENT' and provider_message_id = 'm-322' from public.outbound_jobs where id = job.id), 'sent with Zalo message id';
  assert (select remaining_quota = 499 and daily_quota = 500 from private.zalo_connection), 'quota kept';
  select * into job from public.outbound_jobs where payload->>'event' = 'PAYMENT_RECEIVED';
  perform private.settle_zalo_job(job, 200, '{"error": -118, "message": "Zalo account not existed"}');
  assert (select state = 'DEAD' and last_error_safe = 'Số điện thoại không dùng Zalo' from public.outbound_jobs where id = job.id), 'no Zalo: given up';
  select * into job from public.outbound_jobs where payload->>'event' = 'DEBT_REMINDER';
  perform private.settle_zalo_job(job, 200, '{"error": -124, "message": "Access token invalid"}');
  assert (select state = 'FAILED' from public.outbound_jobs where id = job.id) and (select access_expires_at <= now() from private.zalo_connection), 'expired token: retried, refresh due';
  perform private.settle_zalo_job((select j from public.outbound_jobs j where j.id = job.id), 200, '{"error": -131, "message": "Template not approved"}');
  assert (select state = 'DEAD' from public.outbound_jobs where id = job.id), 'template refused: given up';
  assert exists (select 1 from public.notifications where kind = 'zalo.problem' and title = 'Mẫu tin Zalo bị từ chối'), 'owner told about the template';

  -- Refresh: the stored refresh token is used once and replaced; a refused one asks the owner to reconnect.
  assert private.zalo_refresh_tokens() = 'REFRESHED', 'refreshed';
  assert (select form like 'refresh_token=tok-r-%&app_id=1234567&grant_type=refresh_token' from pg_temp.zalo_calls order by at desc limit 1), 'refresh form';
  assert (select access_expires_at > now() + interval '24 hours' from private.zalo_connection), 'new expiry';
  assert private.zalo_refresh_tokens() = 'FRESH', 'no refresh while the token is fresh';
  update private.zalo_connection set access_expires_at = now();
  update vault.secrets set secret = 'tok-r-revoked' where name = 'hx_zalo_refresh_token';
  assert private.zalo_refresh_tokens() = 'NEEDS_RECONNECT', 'a refused refresh asks to reconnect';
  assert (select state = 'NEEDS_RECONNECT' from private.zalo_connection), 'state needs reconnect';
  assert exists (select 1 from public.notifications where kind = 'zalo.problem' and title = 'Zalo OA cần kết nối lại'), 'owner told to reconnect';

  -- Sending is refused for a test message once the connection needs to be redone.
  perform pg_temp.act_as(owner_login);
  failed := null; begin perform public.send_zalo_test('ORDER_CONFIRMED', '0912345678', gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_not_connected', format('test needs a connection, got %s', failed);
  failed := null; begin perform public.send_zalo_test('ORDER_CONFIRMED', '123', gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'zalo_phone_invalid', format('test phone checked, got %s', failed);

  assert not has_function_privilege('anon', 'public.zalo_status()', 'execute') and not has_function_privilege('anon', 'public.start_zalo_oauth(text, text)', 'execute'),
    'anon reaches no Zalo function';
end
$test$;
