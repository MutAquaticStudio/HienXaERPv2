-- D42: customers pay their debt by bank transfer and the bank (through SePay) confirms it — nobody types the receipt.
-- * A bank account in the cash book can be switched to "Tự ghi tiền về (SePay)". The person who switches it on (needs
--   finance.account.manage and finance.payment.post) is recorded as the poster of every automatic receipt on it.
-- * SePay POSTs each bank movement to /api/payments/sepay; the route (the one server-only caller, with the service key —
--   approved by the Owner for this webhook only) hands the raw body and the X-SePay-Signature / X-SePay-Timestamp headers
--   to public.ingest_sepay_webhook. The database still checks the HMAC-SHA256 signature itself, with the secret kept in
--   Vault (hx_sepay_webhook_secret, never in a table or the app).
-- * Each SePay transaction id is stored once (UNIQUE); a retry or replay returns the first result and posts nothing more.
-- * Money in with an order code (SO2026000101 / SRV202610000003) pays that order first, then the customer's oldest debts,
--   and whatever is left becomes the customer's advance. A customer code alone ("TT KH01") pays the oldest debts first.
--   Anything that cannot be matched waits in "Giao dịch chờ xử lý" for the accountant.
begin;

alter table public.finance_accounts
  add column bank_feed_enabled boolean not null default false,
  add column bank_feed_actor_id uuid references auth.users(id) on delete restrict,
  add column bank_qr_note_prefix text check (bank_qr_note_prefix is null or bank_qr_note_prefix ~ '^[A-Za-z0-9 ]{2,20}$'),
  add constraint finance_accounts_bank_feed_needs_details check (not bank_feed_enabled
    or (account_kind = 'BANK' and bank_account_number is not null and bank_feed_actor_id is not null));

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'SEPAY' check (provider = 'SEPAY'),
  provider_transaction_id text not null check (char_length(provider_transaction_id) between 1 and 64),
  branch_id uuid references public.branches(id) on delete restrict,
  account_id uuid references public.finance_accounts(id) on delete restrict,
  gateway text,
  account_number text,
  sub_account text,
  payment_code text,
  content text,
  description text,
  transfer_type text not null check (transfer_type in ('in', 'out')),
  amount_vnd bigint not null check (amount_vnd >= 0),
  reference_code text,
  transaction_at timestamptz not null,
  raw jsonb not null,
  state text not null check (state in ('POSTED', 'NEEDS_REVIEW', 'IGNORED')),
  reason text not null,
  customer_id uuid references public.customers(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  service_job_id uuid references public.service_jobs(id) on delete restrict,
  payment_id uuid unique references public.payments(id) on delete restrict,
  received_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  unique (provider, provider_transaction_id),
  check (state <> 'POSTED' or (payment_id is not null and customer_id is not null)),
  check (state <> 'NEEDS_REVIEW' or branch_id is not null)
);
create index bank_transactions_branch_state on public.bank_transactions(branch_id, state, received_at desc);
create index bank_transactions_customer on public.bank_transactions(customer_id, received_at desc);
alter table public.bank_transactions enable row level security;
revoke all on public.bank_transactions from public, anon, authenticated;
grant select on public.bank_transactions to authenticated;
create policy bank_transactions_select on public.bank_transactions for select to authenticated
  using (branch_id is not null and (select private.has_permission(branch_id, 'finance.payment.post')));

-- Bank text keeps only letters and digits ("SO-2026-000101" → "SO2026000101").
create or replace function private.bank_token(value text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

-- What the customer types in the transfer: optional bank prefix (SEVQR / TKP…), the order code, the customer code.
create or replace function private.bank_transfer_note(note_prefix text, order_number text, customer_code text) returns text
language sql immutable set search_path = '' as $$
  select concat_ws(' ', nullif(upper(trim(coalesce(note_prefix, ''))), ''), private.bank_token(order_number),
    case when order_number is null then 'TT' end, private.bank_token(customer_code))
$$;

-- HMAC-SHA256 of "{timestamp}.{raw body}", formatted like SePay's X-SePay-Signature header.
create or replace function private.sepay_signature(sent_at text, raw_body text, secret text) returns text
language sql immutable set search_path = '' as $$
  select 'sha256=' || encode(extensions.hmac(convert_to(sent_at || '.' || raw_body, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex')
$$;

-- Posts one bank receipt for the customer: the order's debts first, then the oldest debts, the rest as an advance.
-- Marks the transaction POSTED, matches it to the bank statement and tells the finance team.
create or replace function private.post_bank_receipt(tx public.bank_transactions, target_customer_id uuid, target_sales_order_id uuid,
  target_service_job_id uuid, actor uuid, manual boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account public.finance_accounts%rowtype;
  customer public.customers%rowtype;
  payment uuid;
  remaining bigint := tx.amount_vnd;
  lines jsonb := '[]'::jsonb;
  ob record;
  take bigint;
  still_owed bigint;
  order_label text;
  caller text := current_setting('request.jwt.claim.sub', true);
begin
  -- The posting guards check the acting employee: post as the person who switched the feed on (or the accountant).
  perform set_config('request.jwt.claim.sub', actor::text, true);
  select * into account from public.finance_accounts a where a.id = tx.account_id;
  select * into customer from public.customers c where c.id = target_customer_id;
  if account.id is null or customer.id is null or customer.branch_id <> account.branch_id or not customer.active then
    raise exception 'bank_receipt_party_invalid' using errcode = '22023';
  end if;
  for ob in
    select r.id, private.current_receivable_outstanding(r.id) outstanding
    from public.receivable_obligations r
    left join public.delivery_verifications dv on dv.id = r.delivery_verification_id
    left join public.deliveries d on d.id = dv.delivery_id
    left join public.service_verifications sv on sv.id = r.service_verification_id
    where r.customer_id = customer.id and r.branch_id = account.branch_id
    order by coalesce(d.sales_order_id = target_sales_order_id, false) or coalesce(sv.service_job_id = target_service_job_id, false) desc,
      r.due_date nulls last, r.recorded_at, r.id
    for update of r
  loop
    exit when remaining <= 0;
    continue when ob.outstanding <= 0;
    take := least(ob.outstanding, remaining);
    lines := lines || jsonb_build_array(jsonb_build_object('obligation_id', ob.id, 'amount_vnd', take));
    remaining := remaining - take;
  end loop;

  insert into public.payments(branch_id, payment_number, direction, customer_id, account_id, amount_vnd, method, external_reference, effective_at, posted_by)
  values (account.branch_id, 'REC-' || to_char((tx.transaction_at at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYYMM') || '-'
      || lpad(nextval('public.finance_payment_number_seq')::text, 6, '0'),
    'RECEIPT', customer.id, account.id, tx.amount_vnd, 'BANK_TRANSFER',
    left('SePay ' || coalesce(nullif(tx.reference_code, ''), tx.provider_transaction_id), 160), tx.transaction_at, actor)
  returning id into payment;
  perform private.allocate_payment_lines(payment, lines, actor);
  if remaining > 0 then
    insert into public.advances(branch_id, payment_id, advance_side, customer_id, amount_delta_vnd, recorded_by)
    values (account.branch_id, payment, 'CUSTOMER', customer.id, remaining, actor);
  end if;
  insert into public.payment_reconciliation_matches(branch_id, payment_id, matched_amount_vnd, statement_effective_at, statement_reference, matched_by)
  values (account.branch_id, payment, tx.amount_vnd, tx.transaction_at,
    left('SePay ' || tx.provider_transaction_id || coalesce(' · ' || nullif(tx.reference_code, ''), ''), 160), actor);
  update public.bank_transactions set state = 'POSTED', reason = case when manual then 'resolved' else 'matched' end,
    customer_id = customer.id, sales_order_id = target_sales_order_id, service_job_id = target_service_job_id, payment_id = payment,
    resolved_by = case when manual then actor end, resolved_at = case when manual then now() end
  where id = tx.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (actor, account.branch_id, 'payment.bank_auto_posted', 'payment', payment, tx.id, array['bank_transaction', 'allocations']);

  select coalesce(sum(private.current_receivable_outstanding(r.id)), 0) into still_owed
  from public.receivable_obligations r where r.customer_id = customer.id;
  order_label := coalesce((select o.order_number from public.sales_orders o where o.id = target_sales_order_id),
    (select j.job_number from public.service_jobs j where j.id = target_service_job_id));
  perform private.notify(account.branch_id, 'payment.bank_received', 'payment', payment,
    'Đã nhận ' || replace(to_char(tx.amount_vnd, 'FM999,999,999,999,990'), ',', '.') || ' ₫ — ' || customer.display_name,
    concat_ws(' · ', order_label, customer.code, 'còn nợ ' || replace(to_char(still_owed, 'FM999,999,999,999,990'), ',', '.') || ' ₫',
      case when remaining > 0 then 'ứng trước ' || replace(to_char(remaining, 'FM999,999,999,999,990'), ',', '.') || ' ₫' end),
    '/admin/cashbook', 'finance.ar.read', null, 'sepay:' || tx.provider_transaction_id);
  perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  return payment;
end $$;

-- SePay webhook entry point (only the server route calls it, as service_role). Returns {"success": true, ...} once the
-- transaction is stored, whatever its outcome, so SePay stops retrying; raises only when the request is not genuine.
create or replace function public.ingest_sepay_webhook(raw_body text, signature text, sent_at text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  secret text := private.automation_secret('hx_sepay_webhook_secret');
  payload jsonb;
  sent bigint;
  tx public.bank_transactions%rowtype;
  account public.finance_accounts%rowtype;
  provider_id text;
  haystack text;
  compact text;
  order_token text;
  service_token text;
  order_row public.sales_orders%rowtype;
  job_row public.service_jobs%rowtype;
  named_customer uuid;
  named_count integer;
  target_customer uuid;
  at timestamptz;
begin
  if secret is null then raise exception 'sepay_not_configured' using errcode = '55000'; end if;
  begin sent := sent_at::bigint; exception when others then raise exception 'sepay_signature_invalid' using errcode = '42501'; end;
  if raw_body is null or signature is null or abs(extract(epoch from now()) - sent) > 300
    or signature <> private.sepay_signature(sent_at, raw_body, secret) then
    raise exception 'sepay_signature_invalid' using errcode = '42501';
  end if;
  begin payload := raw_body::jsonb; exception when others then raise exception 'sepay_payload_invalid' using errcode = '22023'; end;
  provider_id := nullif(trim(payload->>'id'), '');
  if jsonb_typeof(payload) <> 'object' or provider_id is null or payload->>'transferType' not in ('in', 'out')
    or coalesce(payload->>'transferAmount', '') !~ '^[0-9]{1,15}$' then
    raise exception 'sepay_payload_invalid' using errcode = '22023';
  end if;
  begin at := least((payload->>'transactionDate')::timestamp at time zone 'Asia/Ho_Chi_Minh', now());
  exception when others then at := now(); end;

  select * into account from public.finance_accounts a
  where a.bank_feed_enabled and a.active
    and private.bank_token(a.bank_account_number) in (private.bank_token(payload->>'accountNumber'), private.bank_token(payload->>'subAccount'))
  order by a.id limit 1;

  insert into public.bank_transactions(provider_transaction_id, branch_id, account_id, gateway, account_number, sub_account, payment_code,
    content, description, transfer_type, amount_vnd, reference_code, transaction_at, raw, state, reason)
  values (provider_id, account.branch_id, account.id, payload->>'gateway', payload->>'accountNumber', nullif(payload->>'subAccount', ''),
    nullif(payload->>'code', ''), payload->>'content', nullif(payload->>'description', ''), payload->>'transferType',
    (payload->>'transferAmount')::bigint, nullif(payload->>'referenceCode', ''), at, payload,
    case when payload->>'transferType' = 'in' and account.id is not null then 'NEEDS_REVIEW' else 'IGNORED' end,
    case when payload->>'transferType' = 'out' then 'outgoing' when account.id is null then 'unknown_account' else 'no_match' end)
  on conflict (provider, provider_transaction_id) do nothing
  returning * into tx;
  if tx.id is null then
    select * into tx from public.bank_transactions t where t.provider = 'SEPAY' and t.provider_transaction_id = provider_id;
    return jsonb_build_object('success', true, 'duplicate', true, 'state', tx.state);
  end if;
  if tx.state = 'IGNORED' or tx.amount_vnd <= 0 then
    if tx.amount_vnd <= 0 then update public.bank_transactions set state = 'IGNORED', reason = 'zero_amount' where id = tx.id; end if;
    return jsonb_build_object('success', true, 'state', 'IGNORED');
  end if;

  -- Match the order code and/or the customer code written in the transfer.
  haystack := concat_ws(' ', payload->>'code', payload->>'content', payload->>'description');
  compact := coalesce(private.bank_token(haystack), '');
  service_token := substring(compact from 'SRV([0-9]{12})');
  order_token := substring(compact from 'SO([0-9]{10})');
  if service_token is not null then
    select * into job_row from public.service_jobs j
    where j.branch_id = account.branch_id and j.job_number = 'SRV-' || left(service_token, 6) || '-' || right(service_token, 6);
  end if;
  if order_token is not null then
    select * into order_row from public.sales_orders o
    where o.branch_id = account.branch_id and o.order_number = 'SO-' || left(order_token, 4) || '-' || right(order_token, 6);
  end if;
  select min(c.id::text)::uuid, count(*) into named_customer, named_count
  from public.customers c
  where c.branch_id = account.branch_id and char_length(private.bank_token(c.code)) >= 3
    and private.bank_token(c.code) = any (regexp_split_to_array(upper(haystack), '[^A-Z0-9]+'));
  target_customer := coalesce(order_row.customer_id, job_row.customer_id);

  if target_customer is not null and named_count = 1 and named_customer <> target_customer then
    update public.bank_transactions set reason = 'customer_mismatch' where id = tx.id;
  elsif target_customer is null and named_count > 1 then
    update public.bank_transactions set reason = 'ambiguous_customer' where id = tx.id;
  elsif coalesce(target_customer, named_customer) is null then
    null; -- stays NEEDS_REVIEW / no_match
  elsif not exists (select 1 from public.customers c where c.id = coalesce(target_customer, named_customer) and c.active) then
    update public.bank_transactions set reason = 'customer_inactive' where id = tx.id;
  else
    begin
      perform private.post_bank_receipt(tx, coalesce(target_customer, named_customer), order_row.id, job_row.id, account.bank_feed_actor_id, false);
      return jsonb_build_object('success', true, 'state', 'POSTED');
    exception when others then
      -- e.g. the person who switched the feed on no longer works in the branch: keep the money for the accountant.
      perform set_config('request.jwt.claim.sub', '', true);
      update public.bank_transactions set customer_id = coalesce(target_customer, named_customer), sales_order_id = order_row.id,
        service_job_id = job_row.id, reason = 'post_failed' where id = tx.id;
    end;
  end if;

  perform private.notify(account.branch_id, 'payment.bank_needs_review', 'bank_transaction', tx.id,
    'Tiền về chưa khớp khách: ' || replace(to_char(tx.amount_vnd, 'FM999,999,999,999,990'), ',', '.') || ' ₫',
    left(coalesce(tx.content, ''), 300), '/admin/cashbook?view=bank', 'finance.payment.post', null, 'sepay-review:' || tx.provider_transaction_id);
  return jsonb_build_object('success', true, 'state', 'NEEDS_REVIEW');
end $$;

-- Accountant: post a waiting bank transaction for the customer (and order) they chose.
create or replace function public.resolve_bank_transaction(target_transaction_id uuid, target_customer_id uuid, target_sales_order_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  tx public.bank_transactions%rowtype;
  hash text := private.command_payload_hash(jsonb_build_object('tx', target_transaction_id, 'customer', target_customer_id, 'order', target_sales_order_id));
  receipt public.command_receipts%rowtype;
  payment uuid;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into receipt from public.command_receipts r where r.operation_id = resolve_bank_transaction.operation_id;
  if receipt.operation_id is not null then
    if receipt.actor_auth_user_id <> auth.uid() or receipt.command_name <> 'resolve_bank_transaction' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '22023';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into tx from public.bank_transactions t where t.id = target_transaction_id for update;
  if tx.id is null or tx.branch_id is null or not private.has_permission(tx.branch_id, 'finance.payment.post') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if tx.state <> 'NEEDS_REVIEW' then raise exception 'bank_transaction_not_waiting' using errcode = '55000'; end if;
  if target_sales_order_id is not null and not exists (select 1 from public.sales_orders o
    where o.id = target_sales_order_id and o.customer_id = target_customer_id) then
    raise exception 'bank_receipt_party_invalid' using errcode = '22023';
  end if;
  payment := private.post_bank_receipt(tx, target_customer_id, target_sales_order_id, null, auth.uid(), true);
  insert into public.command_receipts values (resolve_bank_transaction.operation_id, auth.uid(), 'resolve_bank_transaction', hash, 'payment', payment, now());
  return payment;
end $$;

-- Accountant: the waiting money is not a customer payment (a refund, an internal transfer…) — leave it out of the books.
create or replace function public.dismiss_bank_transaction(target_transaction_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare tx public.bank_transactions%rowtype;
begin
  select * into tx from public.bank_transactions t where t.id = target_transaction_id for update;
  if tx.id is null or tx.branch_id is null or auth.uid() is null or not private.has_permission(tx.branch_id, 'finance.payment.post') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if tx.state = 'IGNORED' and tx.reason = 'dismissed' then return tx.id; end if;
  if tx.state <> 'NEEDS_REVIEW' then raise exception 'bank_transaction_not_waiting' using errcode = '55000'; end if;
  update public.bank_transactions set state = 'IGNORED', reason = 'dismissed', resolved_by = auth.uid(), resolved_at = now() where id = tx.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), tx.branch_id, 'bank_transaction.dismissed', 'bank_transaction', tx.id, dismiss_bank_transaction.operation_id, array['state']);
  return tx.id;
end $$;

-- Cash book: switch automatic posting from SePay on or off for a bank account.
create or replace function public.set_finance_account_bank_feed(target_account_id uuid, enabled boolean, note_prefix text, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare account public.finance_accounts%rowtype;
begin
  select * into account from public.finance_accounts a where a.id = target_account_id for update;
  if account.id is null or auth.uid() is null or not private.has_permission(account.branch_id, 'finance.account.manage')
    or not private.has_permission(account.branch_id, 'finance.payment.post') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if enabled and (account.account_kind <> 'BANK' or account.bank_account_number is null) then
    raise exception 'bank_feed_needs_account_number' using errcode = '22023';
  end if;
  update public.finance_accounts set bank_feed_enabled = coalesce(enabled, false),
    bank_feed_actor_id = case when enabled then auth.uid() else bank_feed_actor_id end,
    bank_qr_note_prefix = nullif(upper(trim(coalesce(note_prefix, ''))), '')
  where id = account.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), account.branch_id, 'finance.account.bank_feed', 'finance_account', account.id, set_finance_account_bank_feed.operation_id,
    array['bank_feed_enabled', 'bank_qr_note_prefix']);
  return account.id;
end $$;

-- Customer portal "Công nợ": what to transfer for each order (and for everything), computed now from the ledger.
-- Returns null when the shop has no account with automatic confirmation shown to customers.
create or replace function public.portal_debt_payment_options(target_customer_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  customer public.customers%rowtype;
  account public.finance_accounts%rowtype;
  orders jsonb;
  total bigint;
begin
  if not private.has_customer_membership(target_customer_id, array['OWNER', 'FINANCE_CONTACT']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into customer from public.customers c where c.id = target_customer_id;
  select * into account from public.finance_accounts a
  where a.branch_id = customer.branch_id and a.shown_to_customers and a.bank_feed_enabled and a.active limit 1;
  if account.id is null then return null; end if;
  with owed as (
    select coalesce(d.sales_order_id::text, sv.service_job_id::text, 'OPENING') group_key, d.sales_order_id, sv.service_job_id,
      r.due_date, private.current_receivable_outstanding(r.id) outstanding
    from public.receivable_obligations r
    left join public.delivery_verifications dv on dv.id = r.delivery_verification_id
    left join public.deliveries d on d.id = dv.delivery_id
    left join public.service_verifications sv on sv.id = r.service_verification_id
    where r.customer_id = customer.id
  ), grouped as (
    select o.group_key, min(o.due_date) due_date, sum(o.outstanding)::bigint outstanding,
      coalesce(min(so.order_number), min(sj.job_number)) order_number
    from owed o left join public.sales_orders so on so.id = o.sales_order_id left join public.service_jobs sj on sj.id = o.service_job_id
    where o.outstanding > 0 group by o.group_key
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', g.group_key, 'label', coalesce(g.order_number, 'Số dư đầu kỳ'),
      'outstanding_amount_vnd', g.outstanding::text, 'due_date', g.due_date,
      'note', private.bank_transfer_note(account.bank_qr_note_prefix, g.order_number, customer.code))
    order by g.due_date nulls last, g.order_number), '[]'::jsonb), coalesce(sum(g.outstanding), 0)::bigint
  into orders, total from grouped g;
  return jsonb_build_object(
    'bank_name', account.bank_name, 'account_number', account.bank_account_number, 'account_holder', account.bank_account_holder,
    'customer_code', customer.code, 'outstanding_amount_vnd', total::text,
    'all_note', private.bank_transfer_note(account.bank_qr_note_prefix, null, customer.code), 'orders', orders);
end $$;

-- Customer portal: has the bank confirmed a payment since the QR was opened? (the dialog asks every few seconds)
create or replace function public.portal_bank_payment_status(target_customer_id uuid, since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare found_payment record;
begin
  if not private.has_customer_membership(target_customer_id, array['OWNER', 'FINANCE_CONTACT']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select p.payment_number, p.amount_vnd into found_payment
  from public.bank_transactions t join public.payments p on p.id = t.payment_id
  where t.customer_id = target_customer_id and t.state = 'POSTED' and t.received_at >= coalesce(since, now() - interval '1 hour')
  order by t.received_at desc limit 1;
  if found_payment.payment_number is null then return jsonb_build_object('paid', false); end if;
  return jsonb_build_object('paid', true, 'payment_number', found_payment.payment_number, 'amount_vnd', found_payment.amount_vnd::text);
end $$;

revoke all on function private.bank_token(text), private.bank_transfer_note(text, text, text), private.sepay_signature(text, text, text),
  private.post_bank_receipt(public.bank_transactions, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.ingest_sepay_webhook(text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_bank_transaction(uuid, uuid, uuid, uuid),
  public.dismiss_bank_transaction(uuid, uuid), public.set_finance_account_bank_feed(uuid, boolean, text, uuid),
  public.portal_debt_payment_options(uuid), public.portal_bank_payment_status(uuid, timestamptz) from public, anon;
-- The webhook has no signed-in user: only the server route (service_role) calls it, and only a signed request is accepted.
grant execute on function public.ingest_sepay_webhook(text, text, text) to service_role;
grant execute on function public.resolve_bank_transaction(uuid, uuid, uuid, uuid), public.dismiss_bank_transaction(uuid, uuid),
  public.set_finance_account_bank_feed(uuid, boolean, text, uuid), public.portal_debt_payment_options(uuid),
  public.portal_bank_payment_status(uuid, timestamptz) to authenticated;

commit;
