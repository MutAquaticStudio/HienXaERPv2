-- D45: the same payment request (D44) paid in cash at the shop, confirmed by hand by the accountant.
-- * The customer (portal) or staff choose debts and "Trả tiền mặt tại cửa hàng" → a request with method CASH (code YC…,
--   no bank needed). Nothing is booked until someone with finance.payment.post presses "Xác nhận đã thu" with the amount
--   actually received and the cash fund: one CASH receipt through post_payment (same guards), the request's debts first
--   (earliest due first, never more than owed now), then other oldest debts, the rest as an advance — the D44 order.
-- * Any request (cash or QR) can be confirmed in cash; less than asked stays owed (no rounding write-off).
-- * The request's received amount and state are recomputed from its receipts, so reversing a receipt reopens it.
begin;

alter table public.payment_requests
  add column method text not null default 'BANK_QR' check (method in ('BANK_QR', 'CASH')),
  alter column account_id drop not null,
  add constraint payment_requests_bank_needs_account check (method = 'CASH' or account_id is not null);

-- Cash receipts confirmed against a request (bank receipts are linked through bank_transactions.payment_request_id).
create table public.payment_request_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payment_requests(id) on delete restrict,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now()
);
create index payment_request_payments_request on public.payment_request_payments(request_id);
alter table public.payment_request_payments enable row level security;
revoke all on public.payment_request_payments from public, anon, authenticated;
grant select on public.payment_request_payments to authenticated;
create policy payment_request_payments_select on public.payment_request_payments for select to authenticated
  using (exists (select 1 from public.payment_requests r where r.id = request_id));

-- Received amount and state from the request's receipts that are not reversed.
create or replace function private.refresh_payment_request(target_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  received bigint;
  left_owed bigint;
begin
  select coalesce(sum(p.amount_vnd), 0) into received
  from public.payments p
  where (p.id in (select t.payment_id from public.bank_transactions t where t.payment_request_id = target_request_id and t.payment_id is not null)
      or p.id in (select x.payment_id from public.payment_request_payments x where x.request_id = target_request_id))
    and not exists (select 1 from public.payments v where v.reversal_of_payment_id = p.id);
  select coalesce(sum(private.current_receivable_outstanding(l.receivable_obligation_id)), 0) into left_owed
  from public.payment_request_lines l where l.request_id = target_request_id;
  update public.payment_requests set received_amount_vnd = received,
    state = case when state = 'CANCELLED' then state when received = 0 then 'OPEN' when left_owed = 0 then 'PAID' else 'PARTIAL' end,
    paid_at = case when state <> 'CANCELLED' and received > 0 and left_owed = 0 then coalesce(paid_at, now()) else null end
  where id = target_request_id;
end $$;

-- A reversed receipt reopens the request it paid.
create or replace function private.payment_reversal_refreshes_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  for request_id in
    select t.payment_request_id from public.bank_transactions t where t.payment_id = new.reversal_of_payment_id and t.payment_request_id is not null
    union select x.request_id from public.payment_request_payments x where x.payment_id = new.reversal_of_payment_id
  loop
    perform private.refresh_payment_request(request_id);
  end loop;
  return null;
end $$;
create trigger payments_reversal_refreshes_request after insert on public.payments
  for each row when (new.reversal_of_payment_id is not null) execute function private.payment_reversal_refreshes_request();

-- D44 request maker with a method: BANK_QR needs the bank account with SePay; CASH needs no bank.
create or replace function public.create_payment_request(target_customer_id uuid, group_keys text[], payment_method text, operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  via text := private.payment_request_actor(target_customer_id);
  chosen_method text := coalesce(payment_method, 'BANK_QR');
  customer public.customers%rowtype;
  account public.finance_accounts%rowtype;
  request public.payment_requests%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  total bigint;
  line_count integer;
begin
  if auth.uid() is null or via is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if chosen_method not in ('BANK_QR', 'CASH') then raise exception 'payment_method_invalid' using errcode = '22023'; end if;
  if operation_id is null or group_keys is null or cardinality(group_keys) = 0 then raise exception 'payment_request_empty' using errcode = '22023'; end if;
  hash := private.command_payload_hash(jsonb_build_object('customer', target_customer_id,
    'keys', (select jsonb_agg(k order by k) from (select distinct unnest(group_keys) k) s))
    || case when chosen_method = 'CASH' then jsonb_build_object('method', chosen_method) else '{}'::jsonb end);
  select * into receipt from public.command_receipts r where r.operation_id = create_payment_request.operation_id;
  if receipt.operation_id is not null then
    if receipt.actor_auth_user_id <> auth.uid() or receipt.command_name <> 'create_payment_request' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '22023';
    end if;
    return public.payment_request_view(receipt.result_entity_id);
  end if;

  select * into customer from public.customers c where c.id = target_customer_id;
  if not customer.active then raise exception 'customer_inactive' using errcode = '55000'; end if;
  if chosen_method = 'BANK_QR' then
    account := private.customer_payment_account(customer.branch_id);
    if account.id is null then raise exception 'bank_feed_not_ready' using errcode = '55000'; end if;
  end if;

  insert into public.payment_requests(branch_id, customer_id, account_id, method, code, amount_vnd, note, created_via, created_by)
  values (customer.branch_id, customer.id, account.id, chosen_method, private.payment_request_code(), 1, 'tmp', via, auth.uid())
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
    note = concat_ws(' ', case when chosen_method = 'BANK_QR' then nullif(upper(trim(coalesce(account.bank_qr_note_prefix, ''))), '') end,
      'TT', private.bank_token(customer.code), request.code)
  where id = request.id;
  insert into public.command_receipts values (create_payment_request.operation_id, auth.uid(), 'create_payment_request', hash, 'payment_request', request.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), customer.branch_id, 'payment_request.created', 'payment_request', request.id, create_payment_request.operation_id,
    array['code', 'amount_vnd', 'lines', 'method']);
  return public.payment_request_view(request.id);
end $$;

-- The D44 call (QR) keeps working unchanged.
create or replace function public.create_payment_request(target_customer_id uuid, group_keys text[], operation_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select public.create_payment_request(target_customer_id, group_keys, 'BANK_QR', operation_id)
$$;

create or replace function public.payment_request_view(target_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  request public.payment_requests%rowtype;
  account public.finance_accounts%rowtype;
begin
  select * into request from public.payment_requests r where r.id = target_request_id;
  if request.id is null or private.payment_request_actor(request.customer_id) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into account from public.finance_accounts a where a.id = request.account_id;
  return jsonb_build_object('id', request.id, 'code', request.code, 'method', request.method, 'state', request.state,
    'amount_vnd', request.amount_vnd::text, 'received_amount_vnd', request.received_amount_vnd::text, 'note', request.note,
    'created_via', request.created_via, 'created_at', request.created_at, 'expires_at', request.expires_at,
    'bank_name', account.bank_name, 'account_number', account.bank_account_number, 'account_holder', account.bank_account_holder,
    'remaining_amount_vnd', (select coalesce(sum(private.current_receivable_outstanding(l.receivable_obligation_id)), 0)
      from public.payment_request_lines l where l.request_id = request.id)::text,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('label', l.label, 'due_date', l.due_date, 'amount_vnd', l.amount_vnd::text,
        'outstanding_amount_vnd', private.current_receivable_outstanding(l.receivable_obligation_id)::text) order by l.due_date nulls last, l.label), '[]'::jsonb)
      from public.payment_request_lines l where l.request_id = request.id));
end $$;

-- "Xác nhận đã thu" (accountant, finance.payment.post): the cash actually received for a request, into a cash fund.
create or replace function public.confirm_cash_payment_request(target_request_id uuid, amount_vnd bigint, target_account_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  request public.payment_requests%rowtype;
  receipt public.command_receipts%rowtype;
  remaining bigint := amount_vnd;
  lines jsonb := '[]'::jsonb;
  ob record;
  take bigint;
  payment uuid;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  -- Same click again: the receipt already made.
  select * into receipt from public.command_receipts r where r.operation_id = confirm_cash_payment_request.operation_id;
  if receipt.operation_id is not null then
    if receipt.actor_auth_user_id <> auth.uid() or receipt.command_name <> 'post_payment'
      or not exists (select 1 from public.payment_request_payments x where x.payment_id = receipt.result_entity_id and x.request_id = target_request_id) then
      raise exception 'operation_payload_conflict' using errcode = '22023';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into request from public.payment_requests r where r.id = target_request_id for update;
  if request.id is null or not private.has_permission(request.branch_id, 'finance.payment.post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if request.state = 'CANCELLED' then raise exception 'payment_request_cancelled' using errcode = '55000'; end if;
  if request.state = 'PAID' then raise exception 'payment_request_already_paid' using errcode = '55000'; end if;
  if amount_vnd is null or amount_vnd <= 0 then raise exception 'invalid_payment' using errcode = '22023'; end if;
  if not exists (select 1 from public.finance_accounts a where a.id = target_account_id and a.branch_id = request.branch_id
    and a.account_kind = 'CASH' and a.active) then
    raise exception 'cash_account_required' using errcode = '22023';
  end if;

  for ob in
    select r.id, private.current_receivable_outstanding(r.id) outstanding
    from public.receivable_obligations r
    where r.customer_id = request.customer_id and r.branch_id = request.branch_id
    order by exists (select 1 from public.payment_request_lines l where l.request_id = request.id and l.receivable_obligation_id = r.id) desc,
      r.due_date nulls last, r.recorded_at, r.id
    for update of r
  loop
    exit when remaining <= 0;
    continue when ob.outstanding <= 0;
    take := least(ob.outstanding, remaining);
    lines := lines || jsonb_build_array(jsonb_build_object('obligation_id', ob.id, 'amount_vnd', take));
    remaining := remaining - take;
  end loop;

  payment := public.post_payment(request.branch_id, 'RECEIPT', request.customer_id, null, target_account_id, amount_vnd, now(), 'CASH',
    'Tiền mặt · ' || request.code, lines, remaining, operation_id);
  insert into public.payment_request_payments(request_id, payment_id, confirmed_by) values (request.id, payment, auth.uid());
  perform private.refresh_payment_request(request.id);
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), request.branch_id, 'payment_request.cash_confirmed', 'payment_request', request.id, operation_id, array['payment', 'state']);
  return payment;
end $$;

-- Payment choices for the portal and staff: the debts are listed even without SePay (cash is always possible);
-- qr_enabled says whether the QR / bank fields can be used.
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
  return jsonb_build_object('qr_enabled', account.id is not null,
    'bank_name', account.bank_name, 'account_number', account.bank_account_number, 'account_holder', account.bank_account_holder,
    'customer_code', customer.code, 'outstanding_amount_vnd', total::text,
    'all_note', private.bank_transfer_note(account.bank_qr_note_prefix, null, customer.code), 'orders', orders);
end $$;

revoke all on function private.refresh_payment_request(uuid), private.payment_reversal_refreshes_request() from public, anon, authenticated;
revoke all on function public.create_payment_request(uuid, text[], text, uuid), public.confirm_cash_payment_request(uuid, bigint, uuid, uuid) from public, anon;
grant execute on function public.create_payment_request(uuid, text[], text, uuid), public.confirm_cash_payment_request(uuid, bigint, uuid, uuid) to authenticated;

commit;
