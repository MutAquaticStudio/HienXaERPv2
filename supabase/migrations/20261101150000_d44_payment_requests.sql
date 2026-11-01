-- D44: one QR for several chosen debts ("Phiếu yêu cầu thanh toán"), extending D42.
-- * The customer (portal: OWNER / FINANCE_CONTACT) or a staff member with finance.ar.read picks debts (orders, service jobs,
--   the opening balance) → create_payment_request stores the exact receivable obligations with the amount owed at that
--   moment, and a short code YC + 5 characters (no 0/O/1/I/L). The transfer note is "[prefix] TT <customer> <code>".
-- * When SePay reports money with that code (same customer): one receipt; the request's debts first (earliest due first,
--   never more than what is owed when the money arrives), then the customer's other oldest debts, the rest as an advance —
--   the D42 order. Money for a request whose debts are already settled (a second transfer) waits for the accountant.
--   A code of another customer than the one written in the note also waits. Codes are recognised forever (expiry only
--   hides the QR in the portal); a cancelled request still names the customer's intent.
begin;

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  code text not null unique check (code ~ '^YC[A-HJKMNP-Z2-9]{5}$'),
  amount_vnd bigint not null check (amount_vnd > 0),
  note text not null check (char_length(note) between 3 and 60),
  state text not null default 'OPEN' check (state in ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED')),
  created_via text not null check (created_via in ('PORTAL', 'STAFF')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  received_amount_vnd bigint not null default 0 check (received_amount_vnd >= 0),
  paid_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  check ((state = 'CANCELLED') = (cancelled_at is not null))
);
create index payment_requests_customer on public.payment_requests(customer_id, created_at desc);
create index payment_requests_branch on public.payment_requests(branch_id, created_at desc);

create table public.payment_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payment_requests(id) on delete restrict,
  receivable_obligation_id uuid not null references public.receivable_obligations(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  service_job_id uuid references public.service_jobs(id) on delete restrict,
  label text not null,
  due_date date,
  amount_vnd bigint not null check (amount_vnd > 0),
  unique (request_id, receivable_obligation_id)
);
create index payment_request_lines_obligation on public.payment_request_lines(receivable_obligation_id);

alter table public.bank_transactions add column payment_request_id uuid references public.payment_requests(id) on delete restrict;
create index bank_transactions_request on public.bank_transactions(payment_request_id) where payment_request_id is not null;

alter table public.payment_requests enable row level security;
alter table public.payment_request_lines enable row level security;
revoke all on public.payment_requests, public.payment_request_lines from public, anon, authenticated;
grant select on public.payment_requests, public.payment_request_lines to authenticated;
create policy payment_requests_select on public.payment_requests for select to authenticated
  using ((select private.has_permission(branch_id, 'finance.ar.read'))
    or (select private.has_customer_membership(customer_id, array['OWNER', 'FINANCE_CONTACT'])));
create policy payment_request_lines_select on public.payment_request_lines for select to authenticated
  using (exists (select 1 from public.payment_requests r where r.id = request_id));

-- YC + 5 characters that cannot be misread (no 0/O, 1/I/L), e.g. YC7K2MQ.
create or replace function private.payment_request_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := 'YC' || (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') from generate_series(1, 5));
    exit when not exists (select 1 from public.payment_requests r where r.code = candidate);
  end loop;
  return candidate;
end $$;

-- The bank account customers pay into automatically (shown to customers, SePay on).
create or replace function private.customer_payment_account(target_branch_id uuid) returns public.finance_accounts
language sql stable security definer set search_path = '' as $$
  select a.* from public.finance_accounts a
  where a.branch_id = target_branch_id and a.shown_to_customers and a.bank_feed_enabled and a.active
  order by a.id limit 1
$$;

-- Who may make or see payment choices for a customer: the customer's owner / finance contact, or staff with finance.ar.read.
create or replace function private.payment_request_actor(target_customer_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when private.has_customer_membership(target_customer_id, array['OWNER', 'FINANCE_CONTACT']) then 'PORTAL'
    when exists (select 1 from public.customers c where c.id = target_customer_id
      and private.has_permission(c.branch_id, 'finance.ar.read')) then 'STAFF'
  end
$$;

-- Choose debts → a payment request with one QR. group_keys are the "key" values of portal_debt_payment_options
-- (an order id, a service job id, or OPENING); amounts are taken from the ledger now, never from the browser.
create or replace function public.create_payment_request(target_customer_id uuid, group_keys text[], operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  via text := private.payment_request_actor(target_customer_id);
  customer public.customers%rowtype;
  account public.finance_accounts%rowtype;
  request public.payment_requests%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  total bigint;
  line_count integer;
begin
  if auth.uid() is null or via is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if operation_id is null or group_keys is null or cardinality(group_keys) = 0 then raise exception 'payment_request_empty' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('customer', target_customer_id,
    'keys', (select jsonb_agg(k order by k) from (select distinct unnest(group_keys) k) s)));
  select * into receipt from public.command_receipts r where r.operation_id = create_payment_request.operation_id;
  if receipt.operation_id is not null then
    if receipt.actor_auth_user_id <> auth.uid() or receipt.command_name <> 'create_payment_request' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '22023';
    end if;
    return public.payment_request_view(receipt.result_entity_id);
  end if;

  select * into customer from public.customers c where c.id = target_customer_id;
  if not customer.active then raise exception 'customer_inactive' using errcode = '55000'; end if;
  account := private.customer_payment_account(customer.branch_id);
  if account.id is null then raise exception 'bank_feed_not_ready' using errcode = '55000'; end if;

  insert into public.payment_requests(branch_id, customer_id, account_id, code, amount_vnd, note, created_via, created_by)
  values (customer.branch_id, customer.id, account.id, private.payment_request_code(), 1, 'tmp', via, auth.uid())
  returning * into request;

  insert into public.payment_request_lines(request_id, receivable_obligation_id, sales_order_id, service_job_id, label, due_date, amount_vnd)
  select request.id, o.id, o.sales_order_id, o.service_job_id, o.label, o.due_date, o.outstanding
  from (
    select r.id, d.sales_order_id, sv.service_job_id, r.due_date,
      coalesce(so.order_number, sj.job_number, 'Số dư đầu kỳ') label,
      coalesce(d.sales_order_id::text, sv.service_job_id::text, 'OPENING') group_key,
      private.current_receivable_outstanding(r.id) outstanding
    from public.receivable_obligations r
    left join public.delivery_verifications dv on dv.id = r.delivery_verification_id
    left join public.deliveries d on d.id = dv.delivery_id
    left join public.service_verifications sv on sv.id = r.service_verification_id
    left join public.sales_orders so on so.id = d.sales_order_id
    left join public.service_jobs sj on sj.id = sv.service_job_id
    where r.customer_id = customer.id and r.branch_id = customer.branch_id
  ) o
  where o.group_key = any (group_keys) and o.outstanding > 0;
  select count(*), coalesce(sum(amount_vnd), 0) into line_count, total from public.payment_request_lines l where l.request_id = request.id;
  if line_count = 0 then raise exception 'payment_request_nothing_owed' using errcode = '22023'; end if;
  if line_count > 50 then raise exception 'payment_request_too_many' using errcode = '22023'; end if;

  update public.payment_requests set amount_vnd = total,
    note = concat_ws(' ', nullif(upper(trim(coalesce(account.bank_qr_note_prefix, ''))), ''), 'TT', private.bank_token(customer.code), request.code)
  where id = request.id;
  insert into public.command_receipts values (create_payment_request.operation_id, auth.uid(), 'create_payment_request', hash, 'payment_request', request.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), customer.branch_id, 'payment_request.created', 'payment_request', request.id, create_payment_request.operation_id,
    array['code', 'amount_vnd', 'lines']);
  return public.payment_request_view(request.id);
end $$;

-- One request with its lines, what is still owed on them now, and the bank to pay into (for the QR window).
create or replace function public.payment_request_view(target_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  request public.payment_requests%rowtype;
  account public.finance_accounts%rowtype;
begin
  select * into request from public.payment_requests r where r.id = target_request_id;
  if request.id is null or private.payment_request_actor(request.customer_id) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into account from public.finance_accounts a where a.id = request.account_id;
  return jsonb_build_object('id', request.id, 'code', request.code, 'state', request.state, 'amount_vnd', request.amount_vnd::text,
    'received_amount_vnd', request.received_amount_vnd::text, 'note', request.note, 'created_via', request.created_via,
    'created_at', request.created_at, 'expires_at', request.expires_at,
    'bank_name', account.bank_name, 'account_number', account.bank_account_number, 'account_holder', account.bank_account_holder,
    'remaining_amount_vnd', (select coalesce(sum(private.current_receivable_outstanding(l.receivable_obligation_id)), 0)
      from public.payment_request_lines l where l.request_id = request.id)::text,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('label', l.label, 'due_date', l.due_date, 'amount_vnd', l.amount_vnd::text,
        'outstanding_amount_vnd', private.current_receivable_outstanding(l.receivable_obligation_id)::text) order by l.due_date nulls last, l.label), '[]'::jsonb)
      from public.payment_request_lines l where l.request_id = request.id));
end $$;

-- Withdraw a request that will not be paid (the QR stops being shown; a late transfer with the code is still recognised).
create or replace function public.cancel_payment_request(target_request_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request public.payment_requests%rowtype;
begin
  select * into request from public.payment_requests r where r.id = target_request_id for update;
  if request.id is null or auth.uid() is null or private.payment_request_actor(request.customer_id) is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if request.state = 'CANCELLED' then return request.id; end if;
  if request.state = 'PAID' then raise exception 'payment_request_already_paid' using errcode = '55000'; end if;
  update public.payment_requests set state = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now() where id = request.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), request.branch_id, 'payment_request.cancelled', 'payment_request', request.id, cancel_payment_request.operation_id, array['state']);
  return request.id;
end $$;

-- D42 receipt posting, now with an optional payment request: its debts first (earliest due first), then the oldest other
-- debts (the named order's first), the rest as an advance. One receipt, one transaction.
drop function private.post_bank_receipt(public.bank_transactions, uuid, uuid, uuid, uuid, boolean);
create function private.post_bank_receipt(tx public.bank_transactions, target_customer_id uuid, target_sales_order_id uuid,
  target_service_job_id uuid, target_request_id uuid, actor uuid, manual boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account public.finance_accounts%rowtype;
  customer public.customers%rowtype;
  request public.payment_requests%rowtype;
  payment uuid;
  remaining bigint := tx.amount_vnd;
  lines jsonb := '[]'::jsonb;
  ob record;
  take bigint;
  still_owed bigint;
  request_left bigint;
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
  if target_request_id is not null then
    select * into request from public.payment_requests r where r.id = target_request_id for update;
    if request.id is null or request.customer_id <> customer.id then raise exception 'bank_receipt_party_invalid' using errcode = '22023'; end if;
  end if;
  for ob in
    select r.id, private.current_receivable_outstanding(r.id) outstanding
    from public.receivable_obligations r
    left join public.delivery_verifications dv on dv.id = r.delivery_verification_id
    left join public.deliveries d on d.id = dv.delivery_id
    left join public.service_verifications sv on sv.id = r.service_verification_id
    where r.customer_id = customer.id and r.branch_id = account.branch_id
    order by exists (select 1 from public.payment_request_lines l where l.request_id = target_request_id and l.receivable_obligation_id = r.id) desc,
      coalesce(d.sales_order_id = target_sales_order_id, false) or coalesce(sv.service_job_id = target_service_job_id, false) desc,
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
    left('SePay ' || coalesce(nullif(tx.reference_code, ''), tx.provider_transaction_id) || coalesce(' · ' || request.code, ''), 160), tx.transaction_at, actor)
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
    payment_request_id = coalesce(target_request_id, payment_request_id),
    resolved_by = case when manual then actor end, resolved_at = case when manual then now() end
  where id = tx.id;
  if request.id is not null then
    select coalesce(sum(private.current_receivable_outstanding(l.receivable_obligation_id)), 0) into request_left
    from public.payment_request_lines l where l.request_id = request.id;
    update public.payment_requests set received_amount_vnd = received_amount_vnd + tx.amount_vnd,
      state = case when state = 'CANCELLED' then state when request_left = 0 then 'PAID' else 'PARTIAL' end,
      paid_at = case when request_left = 0 then coalesce(paid_at, now()) else paid_at end
    where id = request.id;
  end if;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (actor, account.branch_id, 'payment.bank_auto_posted', 'payment', payment, tx.id,
    case when request.id is null then array['bank_transaction', 'allocations'] else array['bank_transaction', 'allocations', 'payment_request'] end);

  select coalesce(sum(private.current_receivable_outstanding(r.id)), 0) into still_owed
  from public.receivable_obligations r where r.customer_id = customer.id;
  order_label := coalesce(
    case when request.id is not null then request.code || ' (' || (select count(distinct coalesce(l.sales_order_id::text, l.service_job_id::text, 'OPENING'))
      from public.payment_request_lines l where l.request_id = request.id) || ' khoản)' end,
    (select o.order_number from public.sales_orders o where o.id = target_sales_order_id),
    (select j.job_number from public.service_jobs j where j.id = target_service_job_id));
  perform private.notify(account.branch_id, 'payment.bank_received', 'payment', payment,
    'Đã nhận ' || replace(to_char(tx.amount_vnd, 'FM999,999,999,999,990'), ',', '.') || ' ₫ — ' || customer.display_name,
    concat_ws(' · ', order_label, customer.code, 'còn nợ ' || replace(to_char(still_owed, 'FM999,999,999,999,990'), ',', '.') || ' ₫',
      case when remaining > 0 then 'ứng trước ' || replace(to_char(remaining, 'FM999,999,999,999,990'), ',', '.') || ' ₫' end),
    '/admin/cashbook', 'finance.ar.read', null, 'sepay:' || tx.provider_transaction_id);
  perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  return payment;
end $$;

-- SePay webhook entry point (D42), now recognising a payment request code (YC…) before order and customer codes.
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
  tokens text[];
  compact text;
  order_token text;
  service_token text;
  order_row public.sales_orders%rowtype;
  job_row public.service_jobs%rowtype;
  request public.payment_requests%rowtype;
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

  -- Match the request code, the order code and/or the customer code written in the transfer.
  haystack := concat_ws(' ', payload->>'code', payload->>'content', payload->>'description');
  tokens := regexp_split_to_array(upper(haystack), '[^A-Z0-9]+');
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
    and private.bank_token(c.code) = any (tokens);
  -- A request code as its own word; if the bank dropped the spaces, inside the run of letters only when the request's
  -- customer code is there too.
  select r.* into request from public.payment_requests r
  where r.branch_id = account.branch_id and r.code = any (tokens) limit 1;
  if request.id is null then
    select r.* into request from public.payment_requests r join public.customers c on c.id = r.customer_id
    where r.branch_id = account.branch_id and compact like '%' || r.code || '%' and compact like '%' || private.bank_token(c.code) || '%'
    order by r.created_at desc limit 1;
  end if;
  target_customer := coalesce(request.customer_id, order_row.customer_id, job_row.customer_id);
  if request.id is not null then
    update public.bank_transactions set payment_request_id = request.id where id = tx.id;
  end if;

  if request.id is not null and ((named_count = 1 and named_customer <> request.customer_id)
      or (order_row.id is not null and order_row.customer_id <> request.customer_id)) then
    update public.bank_transactions set reason = 'customer_mismatch', customer_id = request.customer_id where id = tx.id;
  elsif request.id is not null and (request.state = 'PAID' or not exists (select 1 from public.payment_request_lines l
      where l.request_id = request.id and private.current_receivable_outstanding(l.receivable_obligation_id) > 0)) then
    -- D44: a second transfer for debts already settled is most likely a mistake — the accountant calls the customer.
    update public.bank_transactions set reason = 'request_already_paid', customer_id = request.customer_id where id = tx.id;
  elsif target_customer is not null and named_count = 1 and named_customer <> target_customer then
    update public.bank_transactions set reason = 'customer_mismatch' where id = tx.id;
  elsif target_customer is null and named_count > 1 then
    update public.bank_transactions set reason = 'ambiguous_customer' where id = tx.id;
  elsif coalesce(target_customer, named_customer) is null then
    null; -- stays NEEDS_REVIEW / no_match
  elsif not exists (select 1 from public.customers c where c.id = coalesce(target_customer, named_customer) and c.active) then
    update public.bank_transactions set reason = 'customer_inactive' where id = tx.id;
  else
    begin
      perform private.post_bank_receipt(tx, coalesce(target_customer, named_customer), order_row.id, job_row.id, request.id,
        account.bank_feed_actor_id, false);
      return jsonb_build_object('success', true, 'state', 'POSTED');
    exception when others then
      -- e.g. the person who switched the feed on no longer works in the branch: keep the money for the accountant.
      perform set_config('request.jwt.claim.sub', '', true);
      update public.bank_transactions set customer_id = coalesce(target_customer, named_customer), sales_order_id = order_row.id,
        service_job_id = job_row.id, reason = 'post_failed' where id = tx.id;
    end;
  end if;

  perform private.notify(account.branch_id, 'payment.bank_needs_review', 'bank_transaction', tx.id,
    case when (select reason from public.bank_transactions where id = tx.id) = 'request_already_paid'
      then 'Khách chuyển lại cho yêu cầu đã trả: ' else 'Tiền về chưa khớp khách: ' end
      || replace(to_char(tx.amount_vnd, 'FM999,999,999,999,990'), ',', '.') || ' ₫',
    left(coalesce(tx.content, ''), 300), '/admin/cashbook?view=bank', 'finance.payment.post', null, 'sepay-review:' || tx.provider_transaction_id);
  return jsonb_build_object('success', true, 'state', 'NEEDS_REVIEW');
end $$;

-- Accountant: post a waiting bank transaction for the customer (and order) they chose. The request found in the note is
-- not used again here — the accountant decides where the money goes.
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
  payment := private.post_bank_receipt(tx, target_customer_id, target_sales_order_id, null, null, auth.uid(), true);
  insert into public.command_receipts values (resolve_bank_transaction.operation_id, auth.uid(), 'resolve_bank_transaction', hash, 'payment', payment, now());
  return payment;
end $$;

-- D42 payment choices, now also for staff with finance.ar.read (to make a QR for the customer), plus open requests.
create or replace function public.portal_debt_payment_options(target_customer_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  customer public.customers%rowtype;
  account public.finance_accounts%rowtype;
  orders jsonb;
  total bigint;
begin
  if private.payment_request_actor(target_customer_id) is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into customer from public.customers c where c.id = target_customer_id;
  account := private.customer_payment_account(customer.branch_id);
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

revoke all on function private.payment_request_code(), private.customer_payment_account(uuid), private.payment_request_actor(uuid),
  private.post_bank_receipt(public.bank_transactions, uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_payment_request(uuid, text[], uuid), public.payment_request_view(uuid),
  public.cancel_payment_request(uuid, uuid) from public, anon;
grant execute on function public.create_payment_request(uuid, text[], uuid), public.payment_request_view(uuid),
  public.cancel_payment_request(uuid, uuid) to authenticated;

commit;
