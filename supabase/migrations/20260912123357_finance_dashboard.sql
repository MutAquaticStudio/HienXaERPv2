create sequence public.finance_payment_number_seq;
create sequence public.finance_expense_number_seq;

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{2,24}$'),
  name text not null check (char_length(name) between 2 and 120),
  account_kind text not null check (account_kind in ('CASH','BANK')),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{2,24}$'),
  name text not null check (char_length(name) between 2 and 120),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  expense_number text not null unique,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  amount_vnd bigint not null check (amount_vnd > 0),
  effective_at timestamptz not null,
  due_date date not null,
  description text not null check (char_length(description) between 3 and 500),
  activity_kind text not null default 'OPERATIONS' check (activity_kind in ('OPERATIONS','SALES','DELIVERY','SERVICE','ADMIN')),
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  site_id uuid references public.customer_sites(id) on delete restrict,
  sales_employee_id uuid references public.employees(id) on delete restrict,
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  approval_state text not null default 'DRAFT' check (approval_state in ('DRAFT','APPROVED')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  check (
    (approval_state = 'DRAFT' and approved_by is null and approved_at is null)
    or (approval_state = 'APPROVED' and approved_by is not null and approved_at is not null)
  )
);

alter table public.payable_obligations
  drop constraint payable_obligation_source_shape,
  add column expense_id uuid unique references public.expenses(id) on delete restrict,
  add constraint payable_obligation_source_shape check (
    num_nonnulls(opening_source_id, purchase_receipt_id, supplier_fulfillment_id, expense_id) = 1
  );

alter table public.receivable_adjustments
  add column evidence_object_id uuid references public.evidence_objects(id) on delete restrict;

alter table public.payable_adjustments
  add column evidence_object_id uuid references public.evidence_objects(id) on delete restrict;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  payment_number text not null unique,
  direction text not null check (direction in ('RECEIPT','DISBURSEMENT')),
  customer_id uuid references public.customers(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  amount_vnd bigint not null check (amount_vnd > 0),
  currency_code text not null default 'VND' check (currency_code = 'VND'),
  method text not null check (method in ('CASH','BANK_TRANSFER','CARD','OTHER')),
  external_reference text check (external_reference is null or char_length(external_reference) <= 160),
  effective_at timestamptz not null,
  posted_at timestamptz not null default now(),
  reversal_of_payment_id uuid unique references public.payments(id) on delete restrict,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) between 3 and 500),
  posted_by uuid not null references auth.users(id) on delete restrict,
  check (num_nonnulls(customer_id, supplier_id) = 1),
  check (
    (reversal_of_payment_id is null and reversal_reason is null)
    or (reversal_of_payment_id is not null and reversal_reason is not null)
  )
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  receivable_obligation_id uuid references public.receivable_obligations(id) on delete restrict,
  payable_obligation_id uuid references public.payable_obligations(id) on delete restrict,
  amount_delta_vnd bigint not null check (amount_delta_vnd <> 0),
  reversal_of_allocation_id uuid unique references public.payment_allocations(id) on delete restrict,
  allocated_by uuid not null references auth.users(id) on delete restrict,
  allocated_at timestamptz not null default now(),
  check (num_nonnulls(receivable_obligation_id, payable_obligation_id) = 1),
  check (
    (reversal_of_allocation_id is null and amount_delta_vnd > 0)
    or (reversal_of_allocation_id is not null and amount_delta_vnd < 0)
  )
);

create unique index payment_receivable_allocation_unique
  on public.payment_allocations(payment_id, receivable_obligation_id)
  where receivable_obligation_id is not null and reversal_of_allocation_id is null;

create unique index payment_payable_allocation_unique
  on public.payment_allocations(payment_id, payable_obligation_id)
  where payable_obligation_id is not null and reversal_of_allocation_id is null;

create table public.advances (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  advance_side text not null check (advance_side in ('CUSTOMER','SUPPLIER')),
  customer_id uuid references public.customers(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  amount_delta_vnd bigint not null check (amount_delta_vnd <> 0),
  reversal_of_advance_id uuid unique references public.advances(id) on delete restrict,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  check (
    (advance_side = 'CUSTOMER' and customer_id is not null and supplier_id is null)
    or (advance_side = 'SUPPLIER' and customer_id is null and supplier_id is not null)
  ),
  check (
    (reversal_of_advance_id is null and amount_delta_vnd > 0)
    or (reversal_of_advance_id is not null and amount_delta_vnd < 0)
  )
);

create unique index payment_initial_advance_unique
  on public.advances(payment_id)
  where reversal_of_advance_id is null;

create table public.payment_reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  matched_amount_vnd bigint not null check (matched_amount_vnd > 0),
  statement_effective_at timestamptz not null,
  statement_reference text not null check (char_length(statement_reference) between 2 and 160),
  matched_by uuid not null references auth.users(id) on delete restrict,
  matched_at timestamptz not null default now(),
  unique (branch_id, statement_reference, payment_id)
);

create index payments_branch_effective_idx on public.payments(branch_id, effective_at desc, posted_at desc);
create index payment_allocations_receivable_idx on public.payment_allocations(receivable_obligation_id, allocated_at);
create index payment_allocations_payable_idx on public.payment_allocations(payable_obligation_id, allocated_at);
create index expenses_branch_effective_idx on public.expenses(branch_id, effective_at desc) where approval_state = 'APPROVED';
create index reconciliation_payment_idx on public.payment_reconciliation_matches(payment_id, matched_at);

create or replace function private.current_receivable_outstanding(target_obligation_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    r.original_amount_vnd
    + coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a where a.obligation_id = r.id), 0)
    - coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.receivable_obligation_id = r.id), 0)
  )::bigint
  from public.receivable_obligations r
  where r.id = target_obligation_id
$$;

create or replace function private.current_payable_outstanding(target_obligation_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    p.original_amount_vnd
    + coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id = p.id), 0)
    - coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id = p.id), 0)
  )::bigint
  from public.payable_obligations p
  where p.id = target_obligation_id
$$;

create or replace function private.payment_available(target_payment_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    p.amount_vnd
    - coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payment_id = p.id and a.amount_delta_vnd > 0), 0)
    - coalesce((select sum(a.amount_delta_vnd) from public.advances a where a.payment_id = p.id and a.amount_delta_vnd > 0), 0)
  )::bigint
  from public.payments p
  where p.id = target_payment_id
$$;

create or replace function private.allocate_payment_lines(
  target_payment_id uuid,
  allocation_lines jsonb,
  actor_auth_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.payments%rowtype;
  item jsonb;
  obligation_id uuid;
  allocation_amount bigint;
  allocated_total bigint := 0;
  target_branch uuid;
  target_party uuid;
  outstanding bigint;
  available_before bigint;
begin
  select * into payment from public.payments where id = target_payment_id for update;
  if payment.id is null then raise exception 'payment_not_found' using errcode = '23503'; end if;
  available_before := private.payment_available(payment.id);
  if jsonb_typeof(allocation_lines) <> 'array' then raise exception 'invalid_allocations' using errcode = '22023'; end if;
  if jsonb_array_length(allocation_lines) <> (
    select count(distinct value->>'obligation_id') from jsonb_array_elements(allocation_lines)
  ) then raise exception 'duplicate_allocation_target' using errcode = '23505'; end if;

  for item in select value from jsonb_array_elements(allocation_lines)
  loop
    begin
      obligation_id := (item->>'obligation_id')::uuid;
      allocation_amount := (item->>'amount_vnd')::bigint;
    exception when others then
      raise exception 'invalid_allocation_line' using errcode = '22023';
    end;
    if allocation_amount <= 0 then raise exception 'invalid_allocation_amount' using errcode = '22023'; end if;

    if payment.direction = 'RECEIPT' then
      select branch_id, customer_id into target_branch, target_party
      from public.receivable_obligations where id = obligation_id for update;
      if not found or target_branch <> payment.branch_id or target_party <> payment.customer_id then
        raise exception 'allocation_scope_mismatch' using errcode = '42501';
      end if;
      outstanding := private.current_receivable_outstanding(obligation_id);
      if allocation_amount > outstanding then raise exception 'allocation_exceeds_outstanding' using errcode = '23514'; end if;
      insert into public.payment_allocations(payment_id, receivable_obligation_id, amount_delta_vnd, allocated_by)
      values (payment.id, obligation_id, allocation_amount, actor_auth_user_id);
    else
      select branch_id, supplier_id into target_branch, target_party
      from public.payable_obligations where id = obligation_id for update;
      if not found or target_branch <> payment.branch_id or target_party <> payment.supplier_id then
        raise exception 'allocation_scope_mismatch' using errcode = '42501';
      end if;
      outstanding := private.current_payable_outstanding(obligation_id);
      if allocation_amount > outstanding then raise exception 'allocation_exceeds_outstanding' using errcode = '23514'; end if;
      insert into public.payment_allocations(payment_id, payable_obligation_id, amount_delta_vnd, allocated_by)
      values (payment.id, obligation_id, allocation_amount, actor_auth_user_id);
    end if;
    allocated_total := allocated_total + allocation_amount;
  end loop;

  if allocated_total > available_before then
    raise exception 'allocation_exceeds_payment_available' using errcode = '23514';
  end if;
  return allocated_total;
end
$$;

revoke all on function private.current_receivable_outstanding(uuid) from public, anon, authenticated;
revoke all on function private.current_payable_outstanding(uuid) from public, anon, authenticated;
revoke all on function private.payment_available(uuid) from public, anon, authenticated;
revoke all on function private.allocate_payment_lines(uuid, jsonb, uuid) from public, anon, authenticated;

create or replace function public.create_finance_account(
  target_branch_id uuid,
  account_code text,
  account_name text,
  account_kind text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  account_id uuid;
begin
  if not private.has_permission(target_branch_id, 'finance.account.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if account_code !~ '^[A-Z0-9_-]{2,24}$' or char_length(trim(account_name)) not between 2 and 120 or account_kind not in ('CASH','BANK') then
    raise exception 'invalid_finance_account' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'code', account_code, 'name', trim(account_name), 'kind', account_kind));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_finance_account.operation_id;
  if found then
    if receipt.command_name <> 'create_finance_account' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  insert into public.finance_accounts(branch_id, code, name, account_kind, created_by)
  values (target_branch_id, upper(account_code), trim(account_name), account_kind, (select auth.uid()))
  returning id into account_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_finance_account', payload_hash, 'finance_account', account_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'finance.account.created', 'finance_account', account_id, operation_id, array['code','name','account_kind']);
  return account_id;
end
$$;

create or replace function public.create_expense_category(
  target_branch_id uuid,
  category_code text,
  category_name text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  category_id uuid;
begin
  if not private.has_permission(target_branch_id, 'finance.expense.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if category_code !~ '^[A-Z0-9_-]{2,24}$' or char_length(trim(category_name)) not between 2 and 120 then raise exception 'invalid_expense_category' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'code', category_code, 'name', trim(category_name)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_expense_category.operation_id;
  if found then
    if receipt.command_name <> 'create_expense_category' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  insert into public.expense_categories(branch_id, code, name, created_by)
  values (target_branch_id, upper(category_code), trim(category_name), (select auth.uid()))
  returning id into category_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_expense_category', payload_hash, 'expense_category', category_id, now());
  return category_id;
end
$$;

create or replace function public.create_expense(
  target_branch_id uuid,
  target_category_id uuid,
  target_supplier_id uuid,
  amount_vnd bigint,
  effective_at timestamptz,
  due_date date,
  description text,
  activity_kind text,
  target_sales_order_id uuid,
  target_evidence_id uuid,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  expense_id uuid;
  source_order public.sales_orders%rowtype;
begin
  if not private.has_permission(target_branch_id, 'finance.expense.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if amount_vnd <= 0 or char_length(trim(description)) not between 3 and 500 or activity_kind not in ('OPERATIONS','SALES','DELIVERY','SERVICE','ADMIN') then
    raise exception 'invalid_expense' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'category_id', target_category_id, 'supplier_id', target_supplier_id, 'amount', amount_vnd, 'effective_at', effective_at, 'due_date', due_date, 'description', trim(description), 'activity', activity_kind, 'sales_order_id', target_sales_order_id, 'evidence_id', target_evidence_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_expense.operation_id;
  if found then
    if receipt.command_name <> 'create_expense' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform 1 from public.expense_categories where id = target_category_id and branch_id = target_branch_id and active;
  if not found then raise exception 'invalid_expense_category' using errcode = '23503'; end if;
  perform 1 from public.suppliers where id = target_supplier_id and branch_id = target_branch_id and active;
  if not found then raise exception 'invalid_expense_supplier' using errcode = '23503'; end if;
  if target_sales_order_id is not null then
    select * into source_order from public.sales_orders where id = target_sales_order_id and branch_id = target_branch_id;
    if source_order.id is null then raise exception 'invalid_expense_source' using errcode = '23503'; end if;
  end if;
  if target_evidence_id is not null then perform private.assert_verified_evidence(target_evidence_id, target_branch_id); end if;
  insert into public.expenses(
    branch_id, expense_number, category_id, supplier_id, amount_vnd, effective_at, due_date,
    description, activity_kind, sales_order_id, customer_id, site_id, sales_employee_id,
    evidence_object_id, created_by
  ) values (
    target_branch_id,
    'EXP-' || to_char((effective_at at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYYMM') || '-' || lpad(nextval('public.finance_expense_number_seq')::text, 6, '0'),
    target_category_id, target_supplier_id, amount_vnd, effective_at, due_date,
    trim(description), activity_kind, target_sales_order_id, source_order.customer_id,
    source_order.site_id, source_order.sales_owner_employee_id, target_evidence_id, (select auth.uid())
  ) returning id into expense_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'create_expense', payload_hash, 'expense', expense_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'expense.created', 'expense', expense_id, operation_id, array['category_id','supplier_id','amount_vnd','effective_at','description']);
  return expense_id;
end
$$;

create or replace function public.approve_expense(
  target_expense_id uuid,
  expected_version integer,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense public.expenses%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into expense from public.expenses where id = target_expense_id;
  if expense.id is null or not private.has_permission(expense.branch_id, 'finance.expense.manage') then raise exception 'forbidden_or_expense_not_found' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('expense_id', target_expense_id, 'version', expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id = approve_expense.operation_id;
  if found then
    if receipt.command_name <> 'approve_expense' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into expense from public.expenses where id = target_expense_id for update;
  if expense.approval_state <> 'DRAFT' or expense.version <> expected_version then raise exception 'expense_version_conflict' using errcode = '40001'; end if;
  if expense.evidence_object_id is not null then perform private.assert_verified_evidence(expense.evidence_object_id, expense.branch_id); end if;
  update public.expenses set approval_state = 'APPROVED', version = version + 1, approved_by = (select auth.uid()), approved_at = now() where id = expense.id;
  insert into public.payable_obligations(branch_id, supplier_id, expense_id, original_amount_vnd, due_date, recorded_at, recorded_by)
  values (expense.branch_id, expense.supplier_id, expense.id, expense.amount_vnd, expense.due_date, now(), (select auth.uid()));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'approve_expense', payload_hash, 'expense', expense.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), expense.branch_id, 'expense.approved', 'expense', expense.id, operation_id, array['approval_state','version']);
  return expense.id;
end
$$;

create or replace function public.post_payment(
  target_branch_id uuid,
  direction text,
  target_customer_id uuid,
  target_supplier_id uuid,
  target_account_id uuid,
  amount_vnd bigint,
  effective_at timestamptz,
  method text,
  external_reference text,
  allocation_lines jsonb,
  advance_amount_vnd bigint,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload_hash text;
  receipt public.command_receipts%rowtype;
  payment_id uuid;
  allocated_total bigint;
begin
  if not private.has_permission(target_branch_id, 'finance.payment.post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if amount_vnd <= 0 or direction not in ('RECEIPT','DISBURSEMENT') or method not in ('CASH','BANK_TRANSFER','CARD','OTHER') or advance_amount_vnd < 0 then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;
  if (direction = 'RECEIPT' and (target_customer_id is null or target_supplier_id is not null))
    or (direction = 'DISBURSEMENT' and (target_supplier_id is null or target_customer_id is not null)) then
    raise exception 'invalid_payment_party' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'direction', direction, 'customer_id', target_customer_id, 'supplier_id', target_supplier_id, 'account_id', target_account_id, 'amount', amount_vnd, 'effective_at', effective_at, 'method', method, 'reference', nullif(trim(external_reference), ''), 'allocations', allocation_lines, 'advance', advance_amount_vnd));
  select * into receipt from public.command_receipts where command_receipts.operation_id = post_payment.operation_id;
  if found then
    if receipt.command_name <> 'post_payment' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform 1 from public.finance_accounts where id = target_account_id and branch_id = target_branch_id and active for update;
  if not found then raise exception 'invalid_finance_account' using errcode = '23503'; end if;
  if direction = 'RECEIPT' then
    perform 1 from public.customers where id = target_customer_id and branch_id = target_branch_id and active;
  else
    perform 1 from public.suppliers where id = target_supplier_id and branch_id = target_branch_id and active;
  end if;
  if not found then raise exception 'invalid_payment_party' using errcode = '23503'; end if;
  insert into public.payments(branch_id, payment_number, direction, customer_id, supplier_id, account_id, amount_vnd, method, external_reference, effective_at, posted_by)
  values (
    target_branch_id,
    case when direction = 'RECEIPT' then 'REC-' else 'PAY-' end || to_char((effective_at at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYYMM') || '-' || lpad(nextval('public.finance_payment_number_seq')::text, 6, '0'),
    direction, target_customer_id, target_supplier_id, target_account_id, amount_vnd, method,
    nullif(trim(external_reference), ''), effective_at, (select auth.uid())
  ) returning id into payment_id;
  allocated_total := private.allocate_payment_lines(payment_id, coalesce(allocation_lines, '[]'::jsonb), (select auth.uid()));
  if allocated_total + advance_amount_vnd > amount_vnd then raise exception 'payment_effects_exceed_amount' using errcode = '23514'; end if;
  if advance_amount_vnd > 0 then
    insert into public.advances(branch_id, payment_id, advance_side, customer_id, supplier_id, amount_delta_vnd, recorded_by)
    values (target_branch_id, payment_id, case when direction = 'RECEIPT' then 'CUSTOMER' else 'SUPPLIER' end, target_customer_id, target_supplier_id, advance_amount_vnd, (select auth.uid()));
  end if;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'post_payment', payload_hash, 'payment', payment_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'payment.posted', 'payment', payment_id, operation_id, array['direction','amount_vnd','account_id','effective_at']);
  return payment_id;
end
$$;

create or replace function public.allocate_payment(
  target_payment_id uuid,
  allocation_lines jsonb,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.payments%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
begin
  select * into payment from public.payments where id = target_payment_id;
  if payment.id is null or not private.has_permission(payment.branch_id, 'finance.payment.post') then raise exception 'forbidden_or_payment_not_found' using errcode = '42501'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('payment_id', target_payment_id, 'allocations', allocation_lines));
  select * into receipt from public.command_receipts where command_receipts.operation_id = allocate_payment.operation_id;
  if found then
    if receipt.command_name <> 'allocate_payment' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into payment from public.payments where id = target_payment_id for update;
  if payment.reversal_of_payment_id is not null or exists (select 1 from public.payments where reversal_of_payment_id = payment.id) then
    raise exception 'payment_not_allocatable' using errcode = '55000';
  end if;
  perform private.allocate_payment_lines(payment.id, allocation_lines, (select auth.uid()));
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'allocate_payment', payload_hash, 'payment', payment.id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), payment.branch_id, 'payment.allocated', 'payment', payment.id, operation_id, array['allocations']);
  return payment.id;
end
$$;

create or replace function public.reverse_payment(
  target_payment_id uuid,
  reversal_reason text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.payments%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  reversal_id uuid;
begin
  select * into original from public.payments where id = target_payment_id;
  if original.id is null or not private.has_permission(original.branch_id, 'finance.payment.reverse') then raise exception 'forbidden_or_payment_not_found' using errcode = '42501'; end if;
  if char_length(trim(reversal_reason)) not between 3 and 500 then raise exception 'reversal_reason_required' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('payment_id', target_payment_id, 'reason', trim(reversal_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = reverse_payment.operation_id;
  if found then
    if receipt.command_name <> 'reverse_payment' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into original from public.payments where id = target_payment_id for update;
  if original.reversal_of_payment_id is not null or exists (select 1 from public.payments where reversal_of_payment_id = original.id) then raise exception 'payment_already_reversed_or_is_reversal' using errcode = '55000'; end if;
  insert into public.payments(branch_id, payment_number, direction, customer_id, supplier_id, account_id, amount_vnd, method, external_reference, effective_at, reversal_of_payment_id, reversal_reason, posted_by)
  values (
    original.branch_id,
    'REV-' || to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYYMM') || '-' || lpad(nextval('public.finance_payment_number_seq')::text, 6, '0'),
    case when original.direction = 'RECEIPT' then 'DISBURSEMENT' else 'RECEIPT' end,
    original.customer_id, original.supplier_id, original.account_id, original.amount_vnd, original.method,
    original.external_reference, now(), original.id, trim(reversal_reason), (select auth.uid())
  ) returning id into reversal_id;
  insert into public.payment_allocations(payment_id, receivable_obligation_id, payable_obligation_id, amount_delta_vnd, reversal_of_allocation_id, allocated_by)
  select reversal_id, receivable_obligation_id, payable_obligation_id, -amount_delta_vnd, id, (select auth.uid())
  from public.payment_allocations
  where payment_id = original.id and reversal_of_allocation_id is null;
  insert into public.advances(branch_id, payment_id, advance_side, customer_id, supplier_id, amount_delta_vnd, reversal_of_advance_id, recorded_by)
  select branch_id, reversal_id, advance_side, customer_id, supplier_id, -amount_delta_vnd, id, (select auth.uid())
  from public.advances
  where payment_id = original.id and reversal_of_advance_id is null;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'reverse_payment', payload_hash, 'payment', reversal_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), original.branch_id, 'payment.reversed', 'payment', original.id, operation_id, array['reversal'], trim(reversal_reason));
  return reversal_id;
end
$$;

create or replace function public.record_receivable_adjustment(
  target_obligation_id uuid,
  amount_delta_vnd bigint,
  reason text,
  target_evidence_id uuid,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  obligation public.receivable_obligations%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  adjustment_id uuid;
begin
  select * into obligation from public.receivable_obligations where id = target_obligation_id;
  if obligation.id is null or not private.has_permission(obligation.branch_id, 'finance.ar.adjust') then raise exception 'forbidden_or_obligation_not_found' using errcode = '42501'; end if;
  if amount_delta_vnd = 0 or char_length(trim(reason)) not between 3 and 500 then raise exception 'invalid_adjustment' using errcode = '22023'; end if;
  if target_evidence_id is not null then perform private.assert_verified_evidence(target_evidence_id, obligation.branch_id); end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('obligation_id', target_obligation_id, 'delta', amount_delta_vnd, 'reason', trim(reason), 'evidence_id', target_evidence_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = record_receivable_adjustment.operation_id;
  if found then
    if receipt.command_name <> 'record_receivable_adjustment' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform 1 from public.receivable_obligations where id = target_obligation_id for update;
  if private.current_receivable_outstanding(target_obligation_id) + amount_delta_vnd < 0 then raise exception 'adjustment_exceeds_outstanding' using errcode = '23514'; end if;
  insert into public.receivable_adjustments(obligation_id, amount_delta_vnd, reason, evidence_object_id, recorded_by)
  values (target_obligation_id, amount_delta_vnd, trim(reason), target_evidence_id, (select auth.uid()))
  returning id into adjustment_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_receivable_adjustment', payload_hash, 'receivable_adjustment', adjustment_id, now());
  return adjustment_id;
end
$$;

create or replace function public.record_payable_adjustment(
  target_obligation_id uuid,
  amount_delta_vnd bigint,
  reason text,
  target_evidence_id uuid,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  obligation public.payable_obligations%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  adjustment_id uuid;
begin
  select * into obligation from public.payable_obligations where id = target_obligation_id;
  if obligation.id is null or not private.has_permission(obligation.branch_id, 'finance.ap.adjust') then raise exception 'forbidden_or_obligation_not_found' using errcode = '42501'; end if;
  if amount_delta_vnd = 0 or char_length(trim(reason)) not between 3 and 500 then raise exception 'invalid_adjustment' using errcode = '22023'; end if;
  if target_evidence_id is not null then perform private.assert_verified_evidence(target_evidence_id, obligation.branch_id); end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('obligation_id', target_obligation_id, 'delta', amount_delta_vnd, 'reason', trim(reason), 'evidence_id', target_evidence_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = record_payable_adjustment.operation_id;
  if found then
    if receipt.command_name <> 'record_payable_adjustment' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform 1 from public.payable_obligations where id = target_obligation_id for update;
  if private.current_payable_outstanding(target_obligation_id) + amount_delta_vnd < 0 then raise exception 'adjustment_exceeds_outstanding' using errcode = '23514'; end if;
  insert into public.payable_adjustments(obligation_id, amount_delta_vnd, reason, evidence_object_id, recorded_by)
  values (target_obligation_id, amount_delta_vnd, trim(reason), target_evidence_id, (select auth.uid()))
  returning id into adjustment_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_payable_adjustment', payload_hash, 'payable_adjustment', adjustment_id, now());
  return adjustment_id;
end
$$;

create or replace function public.record_payment_reconciliation(
  target_payment_id uuid,
  matched_amount_vnd bigint,
  statement_effective_at timestamptz,
  statement_reference text,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.payments%rowtype;
  payload_hash text;
  receipt public.command_receipts%rowtype;
  match_id uuid;
  matched_total bigint;
begin
  select * into payment from public.payments where id = target_payment_id;
  if payment.id is null or not private.has_permission(payment.branch_id, 'finance.reconcile') then raise exception 'forbidden_or_payment_not_found' using errcode = '42501'; end if;
  if matched_amount_vnd <= 0 or char_length(trim(statement_reference)) not between 2 and 160 then raise exception 'invalid_reconciliation' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('payment_id', target_payment_id, 'amount', matched_amount_vnd, 'effective_at', statement_effective_at, 'reference', trim(statement_reference)));
  select * into receipt from public.command_receipts where command_receipts.operation_id = record_payment_reconciliation.operation_id;
  if found then
    if receipt.command_name <> 'record_payment_reconciliation' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  select * into payment from public.payments where id = target_payment_id for update;
  select coalesce(sum(m.matched_amount_vnd), 0) into matched_total from public.payment_reconciliation_matches m where m.payment_id = payment.id;
  if matched_total + matched_amount_vnd > payment.amount_vnd then raise exception 'reconciliation_exceeds_payment' using errcode = '23514'; end if;
  insert into public.payment_reconciliation_matches(branch_id, payment_id, matched_amount_vnd, statement_effective_at, statement_reference, matched_by)
  values (payment.branch_id, payment.id, matched_amount_vnd, statement_effective_at, trim(statement_reference), (select auth.uid()))
  returning id into match_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'record_payment_reconciliation', payload_hash, 'payment_reconciliation_match', match_id, now());
  return match_id;
end
$$;

create view public.receivable_read with (security_invoker = true) as
select
  r.id,
  r.branch_id,
  r.customer_id,
  r.site_id,
  c.display_name as customer_name,
  s.name as site_name,
  r.original_amount_vnd,
  coalesce(adjustments.amount_vnd, 0)::bigint as adjustment_amount_vnd,
  coalesce(allocations.amount_vnd, 0)::bigint as allocated_amount_vnd,
  (r.original_amount_vnd + coalesce(adjustments.amount_vnd, 0) - coalesce(allocations.amount_vnd, 0))::bigint as outstanding_amount_vnd,
  r.due_date,
  r.recorded_at,
  case when r.opening_source_id is not null then 'OPENING_BALANCE' else 'DELIVERY_VERIFICATION' end::text as source_type,
  coalesce(r.opening_source_id, r.delivery_verification_id) as source_id,
  d.id as delivery_id,
  d.sales_order_id,
  case when r.opening_source_id is not null then 'Số dư đầu kỳ' else 'Giao hàng đã xác minh' end::text as source_label,
  case
    when r.original_amount_vnd + coalesce(adjustments.amount_vnd, 0) - coalesce(allocations.amount_vnd, 0) <= 0 then 'SETTLED'
    when r.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then 'OVERDUE'
    else 'OPEN'
  end::text as state
from public.receivable_obligations r
join public.customers c on c.id = r.customer_id
left join public.customer_sites s on s.id = r.site_id
left join public.delivery_verifications v on v.id = r.delivery_verification_id
left join public.deliveries d on d.id = v.delivery_id
left join (
  select obligation_id, sum(amount_delta_vnd) as amount_vnd
  from public.receivable_adjustments group by obligation_id
) adjustments on adjustments.obligation_id = r.id
left join (
  select receivable_obligation_id as obligation_id, sum(amount_delta_vnd) as amount_vnd
  from public.payment_allocations where receivable_obligation_id is not null group by receivable_obligation_id
) allocations on allocations.obligation_id = r.id;

create view public.payable_read with (security_invoker = true) as
select
  p.id,
  p.branch_id,
  p.supplier_id,
  s.name as supplier_name,
  p.original_amount_vnd,
  coalesce(adjustments.amount_vnd, 0)::bigint as adjustment_amount_vnd,
  coalesce(allocations.amount_vnd, 0)::bigint as allocated_amount_vnd,
  (p.original_amount_vnd + coalesce(adjustments.amount_vnd, 0) - coalesce(allocations.amount_vnd, 0))::bigint as outstanding_amount_vnd,
  p.due_date,
  p.recorded_at,
  case
    when p.opening_source_id is not null then 'OPENING_BALANCE'
    when p.purchase_receipt_id is not null then 'PURCHASE_RECEIPT'
    when p.supplier_fulfillment_id is not null then 'SUPPLIER_FULFILLMENT'
    else 'EXPENSE'
  end::text as source_type,
  coalesce(p.opening_source_id, p.purchase_receipt_id, p.supplier_fulfillment_id, p.expense_id) as source_id,
  coalesce(pr.purchase_order_id, sf.purchase_order_id) as purchase_order_id,
  p.expense_id,
  case
    when p.opening_source_id is not null then 'Số dư đầu kỳ'
    when p.purchase_receipt_id is not null then 'Nhận hàng vào kho'
    when p.supplier_fulfillment_id is not null then 'NCC giao thẳng đã xác minh'
    else 'Chi phí vận hành đã duyệt'
  end::text as source_label,
  case
    when p.original_amount_vnd + coalesce(adjustments.amount_vnd, 0) - coalesce(allocations.amount_vnd, 0) <= 0 then 'SETTLED'
    when p.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then 'OVERDUE'
    else 'OPEN'
  end::text as state
from public.payable_obligations p
join public.suppliers s on s.id = p.supplier_id
left join public.purchase_receipts pr on pr.id = p.purchase_receipt_id
left join public.supplier_fulfillments sf on sf.id = p.supplier_fulfillment_id
left join (
  select obligation_id, sum(amount_delta_vnd) as amount_vnd
  from public.payable_adjustments group by obligation_id
) adjustments on adjustments.obligation_id = p.id
left join (
  select payable_obligation_id as obligation_id, sum(amount_delta_vnd) as amount_vnd
  from public.payment_allocations where payable_obligation_id is not null group by payable_obligation_id
) allocations on allocations.obligation_id = p.id;

create view public.payment_read with (security_invoker = true) as
select
  p.id,
  p.branch_id,
  p.payment_number,
  p.direction,
  p.customer_id,
  p.supplier_id,
  coalesce(c.display_name, s.name) as counterparty_name,
  p.account_id,
  a.code as account_code,
  a.name as account_name,
  a.account_kind,
  p.amount_vnd,
  coalesce(allocations.amount_vnd, 0)::bigint as allocated_amount_vnd,
  coalesce(advances.amount_vnd, 0)::bigint as advance_amount_vnd,
  case when p.reversal_of_payment_id is null then
    (p.amount_vnd - coalesce(greatest(allocations.amount_vnd, 0), 0) - coalesce(greatest(advances.amount_vnd, 0), 0))::bigint
  else 0::bigint end as unallocated_amount_vnd,
  p.method,
  p.external_reference,
  p.effective_at,
  p.posted_at,
  p.reversal_of_payment_id,
  reversal.id as reversal_payment_id,
  case when reversal.id is not null then 'REVERSED' else 'POSTED' end::text as posting_state,
  coalesce(matches.amount_vnd, 0)::bigint as reconciled_amount_vnd,
  (p.amount_vnd - coalesce(matches.amount_vnd, 0))::bigint as reconciliation_difference_vnd,
  case
    when coalesce(matches.amount_vnd, 0) = 0 then 'UNMATCHED'
    when matches.amount_vnd < p.amount_vnd then 'PARTIAL'
    else 'MATCHED'
  end::text as reconciliation_state,
  case when p.direction = 'RECEIPT' then p.amount_vnd else -p.amount_vnd end::bigint as cash_delta_vnd
from public.payments p
join public.finance_accounts a on a.id = p.account_id
left join public.customers c on c.id = p.customer_id
left join public.suppliers s on s.id = p.supplier_id
left join public.payments reversal on reversal.reversal_of_payment_id = p.id
left join (select payment_id, sum(amount_delta_vnd) amount_vnd from public.payment_allocations group by payment_id) allocations on allocations.payment_id = p.id
left join (select payment_id, sum(amount_delta_vnd) amount_vnd from public.advances group by payment_id) advances on advances.payment_id = p.id
left join (select payment_id, sum(matched_amount_vnd) amount_vnd from public.payment_reconciliation_matches group by payment_id) matches on matches.payment_id = p.id;

create view public.advance_position_read with (security_invoker = true) as
select
  a.branch_id,
  a.advance_side,
  a.customer_id,
  a.supplier_id,
  coalesce(c.display_name, s.name) as counterparty_name,
  sum(a.amount_delta_vnd)::bigint as balance_vnd
from public.advances a
left join public.customers c on c.id = a.customer_id
left join public.suppliers s on s.id = a.supplier_id
group by a.branch_id, a.advance_side, a.customer_id, a.supplier_id, c.display_name, s.name
having sum(a.amount_delta_vnd) <> 0;

create view public.expense_read with (security_invoker = true) as
select
  e.id,
  e.branch_id,
  e.expense_number,
  e.category_id,
  c.code as category_code,
  c.name as category_name,
  e.supplier_id,
  s.name as supplier_name,
  e.amount_vnd,
  e.effective_at,
  e.due_date,
  e.description,
  e.activity_kind,
  e.sales_order_id,
  e.customer_id,
  e.site_id,
  e.sales_employee_id,
  e.evidence_object_id,
  e.approval_state,
  e.version,
  e.created_at,
  e.approved_at
from public.expenses e
join public.expense_categories c on c.id = e.category_id
join public.suppliers s on s.id = e.supplier_id;

create or replace function public.finance_dashboard_snapshot(
  target_branch_id uuid,
  from_inclusive timestamptz,
  to_exclusive timestamptz,
  knowledge_cutoff timestamptz,
  target_customer_id uuid default null,
  target_site_id uuid default null,
  target_sales_employee_id uuid default null,
  target_activity_kind text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  effective_to timestamptz := least(to_exclusive, now());
  effective_cutoff timestamptz := least(knowledge_cutoff, now());
  can_profit boolean;
  can_expense boolean;
  can_ar boolean;
  can_ap boolean;
  revenue_total bigint := 0;
  direct_cost_total bigint := 0;
  opex_total bigint := 0;
  ar_total bigint := 0;
  ap_total bigint := 0;
  cost_incomplete boolean := false;
  opex_not_applicable boolean := false;
  activity_not_applicable boolean := target_activity_kind is not null and target_activity_kind <> 'DELIVERY';
  result jsonb;
begin
  if not private.has_permission(target_branch_id, 'dashboard.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  if from_inclusive >= to_exclusive then raise exception 'invalid_report_period' using errcode = '22023'; end if;
  can_profit := private.has_permission(target_branch_id, 'finance.profit.read');
  can_expense := private.has_permission(target_branch_id, 'finance.expense.read');
  can_ar := private.has_permission(target_branch_id, 'finance.ar.read');
  can_ap := private.has_permission(target_branch_id, 'finance.ap.read');

  select coalesce(sum(r.amount_vnd), 0)::bigint into revenue_total
  from public.revenue_entries r
  join public.sales_orders o on o.id = r.sales_order_id
  where r.branch_id = target_branch_id
    and r.recorded_at >= from_inclusive and r.recorded_at < effective_to
    and r.recorded_at <= effective_cutoff
    and (target_customer_id is null or o.customer_id = target_customer_id)
    and (target_site_id is null or o.site_id = target_site_id)
    and (target_sales_employee_id is null or o.sales_owner_employee_id = target_sales_employee_id)
    and (target_activity_kind is null or target_activity_kind = 'DELIVERY');

  if can_profit then
    select coalesce(sum(d.amount_delta_vnd), 0)::bigint into direct_cost_total
    from public.direct_cost_entries d
    join public.sales_orders o on o.id = d.sales_order_id
    where d.branch_id = target_branch_id
      and d.recorded_at >= from_inclusive and d.recorded_at < effective_to
      and d.recorded_at <= effective_cutoff
      and (target_customer_id is null or o.customer_id = target_customer_id)
      and (target_site_id is null or o.site_id = target_site_id)
      and (target_sales_employee_id is null or o.sales_owner_employee_id = target_sales_employee_id)
      and (target_activity_kind is null or target_activity_kind = 'DELIVERY');

    select exists (
      select 1
      from public.revenue_entries r
      join public.sales_orders o on o.id = r.sales_order_id
      where r.branch_id = target_branch_id
        and r.recorded_at >= from_inclusive and r.recorded_at < effective_to
        and r.recorded_at <= effective_cutoff
        and (target_customer_id is null or o.customer_id = target_customer_id)
        and (target_site_id is null or o.site_id = target_site_id)
        and (target_sales_employee_id is null or o.sales_owner_employee_id = target_sales_employee_id)
        and not exists (
          select 1 from public.direct_cost_entries d
          where d.sales_order_id = r.sales_order_id and d.recorded_at <= effective_cutoff
        )
    ) into cost_incomplete;
  end if;

  if can_expense then
    select coalesce(sum(e.amount_vnd), 0)::bigint into opex_total
    from public.expenses e
    where e.branch_id = target_branch_id
      and e.approval_state = 'APPROVED'
      and e.effective_at >= from_inclusive and e.effective_at < effective_to
      and e.approved_at <= effective_cutoff
      and (target_customer_id is null or e.customer_id = target_customer_id)
      and (target_site_id is null or e.site_id = target_site_id)
      and (target_sales_employee_id is null or e.sales_employee_id = target_sales_employee_id)
      and (target_activity_kind is null or e.activity_kind = target_activity_kind);

    opex_not_applicable := (
      target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null or target_activity_kind is not null
    ) and exists (
      select 1 from public.expenses e
      where e.branch_id = target_branch_id
        and e.approval_state = 'APPROVED'
        and e.effective_at >= from_inclusive and e.effective_at < effective_to
        and e.approved_at <= effective_cutoff
        and (
          (target_customer_id is not null and e.customer_id is null)
          or (target_site_id is not null and e.site_id is null)
          or (target_sales_employee_id is not null and e.sales_employee_id is null)
          or (target_activity_kind is not null and e.activity_kind is null)
        )
    );
  end if;

  if can_ar then
    select coalesce(sum(
      r.original_amount_vnd
      + coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a where a.obligation_id = r.id and a.recorded_at <= effective_to and a.recorded_at <= effective_cutoff), 0)
      - coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.receivable_obligation_id = r.id and a.allocated_at <= effective_to and a.allocated_at <= effective_cutoff), 0)
    ), 0)::bigint into ar_total
    from public.receivable_obligations r
    left join public.delivery_verifications v on v.id = r.delivery_verification_id
    left join public.deliveries d on d.id = v.delivery_id
    left join public.sales_orders o on o.id = d.sales_order_id
    where r.branch_id = target_branch_id
      and r.recorded_at <= effective_to and r.recorded_at <= effective_cutoff
      and (target_customer_id is null or r.customer_id = target_customer_id)
      and (target_site_id is null or r.site_id = target_site_id)
      and (target_sales_employee_id is null or o.sales_owner_employee_id = target_sales_employee_id);
  end if;

  if can_ap then
    select coalesce(sum(
      p.original_amount_vnd
      + coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id = p.id and a.recorded_at <= effective_to and a.recorded_at <= effective_cutoff), 0)
      - coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id = p.id and a.allocated_at <= effective_to and a.allocated_at <= effective_cutoff), 0)
    ), 0)::bigint into ap_total
    from public.payable_obligations p
    where p.branch_id = target_branch_id
      and p.recorded_at <= effective_to and p.recorded_at <= effective_cutoff;
  end if;

  result := jsonb_build_object(
    'scope', jsonb_build_object('from', from_inclusive, 'to', effective_to, 'as_of', effective_cutoff, 'branch_id', target_branch_id),
    'revenue', jsonb_build_object('value_vnd', case when not activity_not_applicable then revenue_total else null end, 'quality', case when activity_not_applicable then 'NOT_APPLICABLE' else 'READY' end),
    'direct_cost', jsonb_build_object('value_vnd', case when can_profit and not cost_incomplete and not activity_not_applicable then direct_cost_total else null end, 'quality', case when not can_profit then 'FORBIDDEN' when activity_not_applicable then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),
    'gross_profit', jsonb_build_object('value_vnd', case when can_profit and not cost_incomplete and not activity_not_applicable then revenue_total - direct_cost_total else null end, 'quality', case when not can_profit then 'FORBIDDEN' when activity_not_applicable then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),
    'operating_expense', jsonb_build_object('value_vnd', case when can_expense and not opex_not_applicable then opex_total else null end, 'quality', case when not can_expense then 'FORBIDDEN' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),
    'operating_profit', jsonb_build_object('value_vnd', case when can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not activity_not_applicable then revenue_total - direct_cost_total - opex_total else null end, 'quality', case when not can_profit or not can_expense then 'FORBIDDEN' when activity_not_applicable then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),
    'operating_margin_bps', jsonb_build_object('value', case when revenue_total > 0 and can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not activity_not_applicable then ((revenue_total - direct_cost_total - opex_total) * 10000 / revenue_total) else null end, 'quality', case when not can_profit or not can_expense then 'FORBIDDEN' when activity_not_applicable then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),
    'receivable', jsonb_build_object('value_vnd', case when can_ar then ar_total else null end, 'quality', case when can_ar then 'READY' else 'FORBIDDEN' end),
    'payable', jsonb_build_object('value_vnd', case when can_ap and target_customer_id is null and target_site_id is null and target_sales_employee_id is null then ap_total else null end, 'quality', case when not can_ap then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null then 'NOT_APPLICABLE' else 'READY' end),
    'salary_payable', jsonb_build_object('value_vnd', null, 'quality', 'INCOMPLETE'),
    'commission_payable', jsonb_build_object('value_vnd', null, 'quality', 'INCOMPLETE')
  );
  return result;
end
$$;

create or replace function private.reject_r7_posted_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'posted finance rows are append-only' using errcode = '55000';
end
$$;

create or replace function private.guard_expense_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.approval_state <> 'DRAFT' then raise exception 'approved expense is immutable' using errcode = '55000'; end if;
  return new;
end
$$;

create trigger payments_immutable before update or delete on public.payments for each row execute function private.reject_r7_posted_mutation();
create trigger payment_allocations_immutable before update or delete on public.payment_allocations for each row execute function private.reject_r7_posted_mutation();
create trigger advances_immutable before update or delete on public.advances for each row execute function private.reject_r7_posted_mutation();
create trigger payment_reconciliation_matches_immutable before update or delete on public.payment_reconciliation_matches for each row execute function private.reject_r7_posted_mutation();
create trigger expenses_approved_immutable before update or delete on public.expenses for each row execute function private.guard_expense_mutation();

revoke all on function private.reject_r7_posted_mutation() from public, anon, authenticated;
revoke all on function private.guard_expense_mutation() from public, anon, authenticated;

insert into public.permissions(code, name) values
  ('finance.account.manage', 'Quản lý tài khoản tiền'),
  ('finance.payment.post', 'Ghi nhận thu chi'),
  ('finance.payment.reverse', 'Đảo giao dịch thu chi'),
  ('finance.ar.adjust', 'Điều chỉnh phải thu'),
  ('finance.ap.adjust', 'Điều chỉnh phải trả'),
  ('finance.expense.read', 'Xem chi phí vận hành'),
  ('finance.expense.manage', 'Tạo và duyệt chi phí'),
  ('finance.reconcile', 'Đối soát thu chi'),
  ('finance.profit.read', 'Xem giá vốn và lợi nhuận')
on conflict (code) do nothing;

alter table public.finance_accounts enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.advances enable row level security;
alter table public.payment_reconciliation_matches enable row level security;

create policy finance_accounts_read on public.finance_accounts for select to authenticated
  using (private.has_permission(branch_id, 'finance.ar.read') or private.has_permission(branch_id, 'finance.ap.read'));
create policy expense_categories_read on public.expense_categories for select to authenticated
  using (private.has_permission(branch_id, 'finance.expense.read') or private.has_permission(branch_id, 'finance.expense.manage'));
create policy expenses_read on public.expenses for select to authenticated
  using (private.has_permission(branch_id, 'finance.expense.read') or private.has_permission(branch_id, 'finance.expense.manage'));
create policy payments_read on public.payments for select to authenticated
  using (private.has_permission(branch_id, 'finance.ar.read') or private.has_permission(branch_id, 'finance.ap.read'));
create policy payment_allocations_read on public.payment_allocations for select to authenticated
  using (exists (
    select 1 from public.payments p where p.id = payment_id
      and (private.has_permission(p.branch_id, 'finance.ar.read') or private.has_permission(p.branch_id, 'finance.ap.read'))
  ));
create policy advances_read on public.advances for select to authenticated
  using (private.has_permission(branch_id, 'finance.ar.read') or private.has_permission(branch_id, 'finance.ap.read'));
create policy payment_reconciliation_read on public.payment_reconciliation_matches for select to authenticated
  using (private.has_permission(branch_id, 'finance.reconcile'));

revoke all on table public.finance_accounts, public.expense_categories, public.expenses, public.payments,
  public.payment_allocations, public.advances, public.payment_reconciliation_matches from anon, authenticated;
grant select on table public.finance_accounts, public.expense_categories, public.expenses, public.payments,
  public.payment_allocations, public.advances, public.payment_reconciliation_matches to authenticated;

grant select on public.receivable_read, public.payable_read, public.payment_read,
  public.advance_position_read, public.expense_read to authenticated;

revoke all on function public.create_finance_account(uuid, text, text, text, uuid) from public, anon;
revoke all on function public.create_expense_category(uuid, text, text, uuid) from public, anon;
revoke all on function public.create_expense(uuid, uuid, uuid, bigint, timestamptz, date, text, text, uuid, uuid, uuid) from public, anon;
revoke all on function public.approve_expense(uuid, integer, uuid) from public, anon;
revoke all on function public.post_payment(uuid, text, uuid, uuid, uuid, bigint, timestamptz, text, text, jsonb, bigint, uuid) from public, anon;
revoke all on function public.allocate_payment(uuid, jsonb, uuid) from public, anon;
revoke all on function public.reverse_payment(uuid, text, uuid) from public, anon;
revoke all on function public.record_receivable_adjustment(uuid, bigint, text, uuid, uuid) from public, anon;
revoke all on function public.record_payable_adjustment(uuid, bigint, text, uuid, uuid) from public, anon;
revoke all on function public.record_payment_reconciliation(uuid, bigint, timestamptz, text, uuid) from public, anon;
revoke all on function public.finance_dashboard_snapshot(uuid, timestamptz, timestamptz, timestamptz, uuid, uuid, uuid, text) from public, anon;

grant execute on function public.create_finance_account(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.create_expense_category(uuid, text, text, uuid) to authenticated;
grant execute on function public.create_expense(uuid, uuid, uuid, bigint, timestamptz, date, text, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.approve_expense(uuid, integer, uuid) to authenticated;
grant execute on function public.post_payment(uuid, text, uuid, uuid, uuid, bigint, timestamptz, text, text, jsonb, bigint, uuid) to authenticated;
grant execute on function public.allocate_payment(uuid, jsonb, uuid) to authenticated;
grant execute on function public.reverse_payment(uuid, text, uuid) to authenticated;
grant execute on function public.record_receivable_adjustment(uuid, bigint, text, uuid, uuid) to authenticated;
grant execute on function public.record_payable_adjustment(uuid, bigint, text, uuid, uuid) to authenticated;
grant execute on function public.record_payment_reconciliation(uuid, bigint, timestamptz, text, uuid) to authenticated;
grant execute on function public.finance_dashboard_snapshot(uuid, timestamptz, timestamptz, timestamptz, uuid, uuid, uuid, text) to authenticated;

create or replace function public.finance_obligation_snapshot(
  target_branch_id uuid,
  target_side text,
  as_of timestamptz,
  knowledge_cutoff timestamptz,
  target_customer_id uuid default null,
  target_site_id uuid default null,
  target_sales_employee_id uuid default null
)
returns table (
  obligation_id uuid,
  party_id uuid,
  party_name text,
  site_id uuid,
  site_name text,
  source_type text,
  source_id uuid,
  due_date date,
  outstanding_amount_vnd bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  effective_as_of timestamptz := least(as_of, now());
  effective_cutoff timestamptz := least(knowledge_cutoff, now());
begin
  if target_side = 'AR' then
    if not private.has_permission(target_branch_id, 'finance.ar.read') then raise exception 'forbidden' using errcode = '42501'; end if;
    return query
    select
      r.id,
      r.customer_id,
      c.display_name,
      r.site_id,
      cs.name,
      case when r.opening_source_id is not null then 'OPENING_BALANCE' else 'DELIVERY_VERIFICATION' end::text,
      coalesce(r.opening_source_id, r.delivery_verification_id),
      r.due_date,
      (
        r.original_amount_vnd
        + coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a where a.obligation_id = r.id and a.recorded_at <= effective_as_of and a.recorded_at <= effective_cutoff), 0)
        - coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.receivable_obligation_id = r.id and a.allocated_at <= effective_as_of and a.allocated_at <= effective_cutoff), 0)
      )::bigint
    from public.receivable_obligations r
    join public.customers c on c.id = r.customer_id
    left join public.customer_sites cs on cs.id = r.site_id
    left join public.delivery_verifications v on v.id = r.delivery_verification_id
    left join public.deliveries d on d.id = v.delivery_id
    left join public.sales_orders o on o.id = d.sales_order_id
    where r.branch_id = target_branch_id
      and r.recorded_at <= effective_as_of
      and r.recorded_at <= effective_cutoff
      and (target_customer_id is null or r.customer_id = target_customer_id)
      and (target_site_id is null or r.site_id = target_site_id)
      and (target_sales_employee_id is null or o.sales_owner_employee_id = target_sales_employee_id);
  elsif target_side = 'AP' then
    if not private.has_permission(target_branch_id, 'finance.ap.read') then raise exception 'forbidden' using errcode = '42501'; end if;
    if target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null then return; end if;
    return query
    select
      p.id,
      p.supplier_id,
      s.name,
      null::uuid,
      null::text,
      case
        when p.opening_source_id is not null then 'OPENING_BALANCE'
        when p.purchase_receipt_id is not null then 'PURCHASE_RECEIPT'
        when p.supplier_fulfillment_id is not null then 'SUPPLIER_FULFILLMENT'
        else 'EXPENSE'
      end::text,
      coalesce(p.opening_source_id, p.purchase_receipt_id, p.supplier_fulfillment_id, p.expense_id),
      p.due_date,
      (
        p.original_amount_vnd
        + coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id = p.id and a.recorded_at <= effective_as_of and a.recorded_at <= effective_cutoff), 0)
        - coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id = p.id and a.allocated_at <= effective_as_of and a.allocated_at <= effective_cutoff), 0)
      )::bigint
    from public.payable_obligations p
    join public.suppliers s on s.id = p.supplier_id
    where p.branch_id = target_branch_id
      and p.recorded_at <= effective_as_of
      and p.recorded_at <= effective_cutoff;
  else
    raise exception 'invalid_obligation_side' using errcode = '22023';
  end if;
end
$$;

revoke all on function public.finance_obligation_snapshot(uuid, text, timestamptz, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.finance_obligation_snapshot(uuid, text, timestamptz, timestamptz, uuid, uuid, uuid) to authenticated;
