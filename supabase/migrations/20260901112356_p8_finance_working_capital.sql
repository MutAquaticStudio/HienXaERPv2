-- HIỀN XA ERP P8 — finance and working capital.
-- Balances are projections of immutable ledgers. Browser clients receive
-- read-only projections; server commands own allocations, posting and reversal.

create type public.finance_document_status as enum (
  'OPEN', 'PARTIALLY_SETTLED', 'SETTLED', 'REVERSED'
);
create type public.finance_ledger_entry_type as enum (
  'RECOGNITION', 'PAYMENT_ALLOCATION', 'ADVANCE_ALLOCATION', 'ADJUSTMENT', 'REVERSAL'
);
create type public.financial_account_type as enum ('CASH', 'BANK');
create type public.payment_direction as enum ('RECEIPT', 'DISBURSEMENT', 'INTERNAL_TRANSFER');
create type public.payment_status as enum ('DRAFT', 'POSTED', 'RECONCILED', 'REVERSED');
create type public.payment_allocation_status as enum ('PENDING', 'APPLIED', 'REVERSED');
create type public.advance_status as enum ('OPEN', 'PARTIALLY_APPLIED', 'APPLIED', 'REVERSED');
create type public.financial_movement_type as enum (
  'RECEIPT', 'DISBURSEMENT', 'TRANSFER_IN', 'TRANSFER_OUT',
  'EXPENSE', 'REVERSAL', 'ADJUSTMENT'
);
create type public.expense_status as enum ('DRAFT', 'POSTED', 'REVERSED');
create type public.bank_transaction_status as enum ('UNMATCHED', 'MATCHED');
create type public.reconciliation_status as enum ('CONFIRMED', 'REVERSED');
create type public.finance_adjustment_target as enum ('RECEIVABLE', 'PAYABLE');
create type public.finance_adjustment_status as enum ('POSTED', 'REVERSED');
create type public.allocation_proposal_status as enum ('PROPOSED', 'ACCEPTED', 'DISMISSED');

create sequence public.receivable_number_seq;
create sequence public.payable_number_seq;
create sequence public.payment_number_seq;
create sequence public.advance_number_seq;
create sequence public.expense_number_seq;
create sequence public.adjustment_number_seq;
revoke all on sequence public.receivable_number_seq, public.payable_number_seq,
  public.payment_number_seq, public.advance_number_seq, public.expense_number_seq,
  public.adjustment_number_seq from anon, authenticated;

create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  receivable_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  source_event_id uuid not null unique references public.delivery_readiness_events(id) on delete restrict,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  original_amount numeric(20, 2) not null check (original_amount > 0),
  outstanding_amount numeric(20, 2) not null check (
    outstanding_amount >= 0 and outstanding_amount <= original_amount
  ),
  status public.finance_document_status not null default 'OPEN',
  due_date date not null,
  recognized_at timestamptz not null,
  reversed_at timestamptz,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint receivable_status_balance check (
    (status = 'OPEN' and outstanding_amount = original_amount and reversed_at is null)
    or (status = 'PARTIALLY_SETTLED' and outstanding_amount > 0
      and outstanding_amount < original_amount and reversed_at is null)
    or (status = 'SETTLED' and outstanding_amount = 0 and reversed_at is null)
    or (status = 'REVERSED' and outstanding_amount = 0 and reversed_at is not null)
  )
);
create index receivables_customer_idx on public.receivables(customer_id, status, due_date);
create index receivables_due_idx on public.receivables(status, due_date);

create table public.payables (
  id uuid primary key default gen_random_uuid(),
  payable_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  source_event_id uuid not null unique references public.delivery_readiness_events(id) on delete restrict,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  original_amount numeric(20, 2) not null check (original_amount > 0),
  outstanding_amount numeric(20, 2) not null check (
    outstanding_amount >= 0 and outstanding_amount <= original_amount
  ),
  status public.finance_document_status not null default 'OPEN',
  due_date date not null,
  recognized_at timestamptz not null,
  reversed_at timestamptz,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payable_status_balance check (
    (status = 'OPEN' and outstanding_amount = original_amount and reversed_at is null)
    or (status = 'PARTIALLY_SETTLED' and outstanding_amount > 0
      and outstanding_amount < original_amount and reversed_at is null)
    or (status = 'SETTLED' and outstanding_amount = 0 and reversed_at is null)
    or (status = 'REVERSED' and outstanding_amount = 0 and reversed_at is not null)
  )
);
create index payables_supplier_idx on public.payables(supplier_id, status, due_date);
create index payables_due_idx on public.payables(status, due_date);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique check (
    account_code = upper(trim(account_code)) and char_length(account_code) between 3 and 30
  ),
  account_name text not null check (char_length(trim(account_name)) between 3 and 120),
  account_type public.financial_account_type not null,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  bank_name text,
  bank_account_number_masked text,
  is_active boolean not null default true,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique,
  direction public.payment_direction not null,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  destination_account_id uuid references public.financial_accounts(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  amount numeric(20, 2) not null check (amount > 0),
  unallocated_amount numeric(20, 2) not null check (
    unallocated_amount >= 0 and unallocated_amount <= amount
  ),
  status public.payment_status not null default 'DRAFT',
  payment_date date not null,
  external_reference text check (
    external_reference is null or char_length(trim(external_reference)) between 2 and 120
  ),
  note text check (note is null or char_length(trim(note)) between 3 and 500),
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  posted_by uuid references public.user_profiles(user_id) on delete restrict,
  posted_at timestamptz,
  reconciled_by uuid references public.user_profiles(user_id) on delete restrict,
  reconciled_at timestamptz,
  reversed_by uuid references public.user_profiles(user_id) on delete restrict,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_route check (
    (direction = 'RECEIPT' and customer_id is not null and supplier_id is null
      and destination_account_id is null)
    or (direction = 'DISBURSEMENT' and supplier_id is not null and customer_id is null
      and destination_account_id is null)
    or (direction = 'INTERNAL_TRANSFER' and customer_id is null and supplier_id is null
      and destination_account_id is not null and destination_account_id <> financial_account_id)
  ),
  constraint payment_lifecycle check (
    (status = 'DRAFT' and posted_at is null and reconciled_at is null and reversed_at is null)
    or (status = 'POSTED' and posted_at is not null and reconciled_at is null and reversed_at is null)
    or (status = 'RECONCILED' and posted_at is not null and reconciled_at is not null and reversed_at is null)
    or (status = 'REVERSED' and posted_at is not null and reversed_at is not null)
  )
);
create index payments_status_idx on public.payments(status, payment_date desc);
create index payments_customer_idx on public.payments(customer_id, payment_date desc)
  where customer_id is not null;
create index payments_supplier_idx on public.payments(supplier_id, payment_date desc)
  where supplier_id is not null;

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  receivable_id uuid references public.receivables(id) on delete restrict,
  payable_id uuid references public.payables(id) on delete restrict,
  amount numeric(20, 2) not null check (amount > 0),
  status public.payment_allocation_status not null default 'PENDING',
  allocated_by uuid not null references public.user_profiles(user_id) on delete restrict,
  allocated_at timestamptz not null default now(),
  applied_at timestamptz,
  reversed_at timestamptz,
  constraint payment_allocation_target check (
    (receivable_id is not null and payable_id is null)
    or (receivable_id is null and payable_id is not null)
  ),
  constraint payment_allocation_lifecycle check (
    (status = 'PENDING' and applied_at is null and reversed_at is null)
    or (status = 'APPLIED' and applied_at is not null and reversed_at is null)
    or (status = 'REVERSED' and applied_at is not null and reversed_at is not null)
  )
);
create index payment_allocations_payment_idx on public.payment_allocations(payment_id, status);
create index payment_allocations_receivable_idx on public.payment_allocations(receivable_id)
  where receivable_id is not null;
create index payment_allocations_payable_idx on public.payment_allocations(payable_id)
  where payable_id is not null;

-- Proposals are advisory records only. Posting reads payment_allocations and never
-- silently converts a proposal into an allocation.
create table public.payment_allocation_proposals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  receivable_id uuid references public.receivables(id) on delete restrict,
  payable_id uuid references public.payables(id) on delete restrict,
  proposed_amount numeric(20, 2) not null check (proposed_amount > 0),
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  status public.allocation_proposal_status not null default 'PROPOSED',
  created_at timestamptz not null default now(),
  constraint allocation_proposal_target check (
    (receivable_id is not null and payable_id is null)
    or (receivable_id is null and payable_id is not null)
  )
);

create table public.customer_advances (
  id uuid primary key default gen_random_uuid(),
  advance_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_payment_id uuid not null unique references public.payments(id) on delete restrict,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  original_amount numeric(20, 2) not null check (original_amount > 0),
  remaining_amount numeric(20, 2) not null check (
    remaining_amount >= 0 and remaining_amount <= original_amount
  ),
  status public.advance_status not null default 'OPEN',
  created_at timestamptz not null default now()
);
create index customer_advances_customer_idx on public.customer_advances(customer_id, status);

create table public.supplier_advances (
  id uuid primary key default gen_random_uuid(),
  advance_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  source_payment_id uuid not null unique references public.payments(id) on delete restrict,
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  original_amount numeric(20, 2) not null check (original_amount > 0),
  remaining_amount numeric(20, 2) not null check (
    remaining_amount >= 0 and remaining_amount <= original_amount
  ),
  status public.advance_status not null default 'OPEN',
  created_at timestamptz not null default now()
);
create index supplier_advances_supplier_idx on public.supplier_advances(supplier_id, status);

create table public.advance_allocations (
  id uuid primary key default gen_random_uuid(),
  customer_advance_id uuid references public.customer_advances(id) on delete restrict,
  supplier_advance_id uuid references public.supplier_advances(id) on delete restrict,
  receivable_id uuid references public.receivables(id) on delete restrict,
  payable_id uuid references public.payables(id) on delete restrict,
  amount numeric(20, 2) not null check (amount > 0),
  allocated_by uuid not null references public.user_profiles(user_id) on delete restrict,
  allocated_at timestamptz not null default now(),
  constraint advance_allocation_route check (
    (customer_advance_id is not null and receivable_id is not null
      and supplier_advance_id is null and payable_id is null)
    or (supplier_advance_id is not null and payable_id is not null
      and customer_advance_id is null and receivable_id is null)
  )
);

create table public.receivable_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.receivables(id) on delete restrict,
  entry_type public.finance_ledger_entry_type not null,
  signed_amount numeric(20, 2) not null check (signed_amount <> 0),
  payment_allocation_id uuid references public.payment_allocations(id) on delete restrict,
  advance_allocation_id uuid references public.advance_allocations(id) on delete restrict,
  adjustment_id uuid,
  description text not null check (char_length(trim(description)) between 3 and 500),
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index receivable_ledger_receivable_idx
  on public.receivable_ledger_entries(receivable_id, occurred_at);

create table public.payable_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  payable_id uuid not null references public.payables(id) on delete restrict,
  entry_type public.finance_ledger_entry_type not null,
  signed_amount numeric(20, 2) not null check (signed_amount <> 0),
  payment_allocation_id uuid references public.payment_allocations(id) on delete restrict,
  advance_allocation_id uuid references public.advance_allocations(id) on delete restrict,
  adjustment_id uuid,
  description text not null check (char_length(trim(description)) between 3 and 500),
  actor_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index payable_ledger_payable_idx
  on public.payable_ledger_entries(payable_id, occurred_at);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_number text not null unique,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  expense_date date not null,
  category text not null check (char_length(trim(category)) between 3 and 80),
  description text not null check (char_length(trim(description)) between 5 and 500),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  amount numeric(20, 2) not null check (amount > 0),
  status public.expense_status not null default 'DRAFT',
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  posted_by uuid references public.user_profiles(user_id) on delete restrict,
  posted_at timestamptz,
  reversed_by uuid references public.user_profiles(user_id) on delete restrict,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint expense_lifecycle check (
    (status = 'DRAFT' and posted_at is null and reversed_at is null)
    or (status = 'POSTED' and posted_at is not null and reversed_at is null)
    or (status = 'REVERSED' and posted_at is not null and reversed_at is not null)
  )
);

create table public.expense_allocations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  allocation_dimension text not null check (
    allocation_dimension in ('ORDER', 'CUSTOMER', 'VEHICLE', 'SERVICE_JOB', 'GENERAL')
  ),
  allocation_reference_id uuid,
  allocation_percent numeric(7, 4) not null check (
    allocation_percent > 0 and allocation_percent <= 100
  ),
  amount numeric(20, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index expense_allocations_expense_idx on public.expense_allocations(expense_id);

create table public.finance_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_number text not null unique,
  target_type public.finance_adjustment_target not null,
  receivable_id uuid references public.receivables(id) on delete restrict,
  payable_id uuid references public.payables(id) on delete restrict,
  signed_amount numeric(20, 2) not null check (signed_amount <> 0),
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  status public.finance_adjustment_status not null default 'POSTED',
  reversal_of_id uuid unique references public.finance_adjustments(id) on delete restrict,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  constraint finance_adjustment_target_shape check (
    (target_type = 'RECEIVABLE' and receivable_id is not null and payable_id is null)
    or (target_type = 'PAYABLE' and payable_id is not null and receivable_id is null)
  ),
  constraint finance_adjustment_lifecycle check (
    (status = 'POSTED' and reversed_at is null)
    or (status = 'REVERSED' and reversed_at is not null)
  )
);

alter table public.receivable_ledger_entries add constraint receivable_ledger_adjustment_fk
  foreign key (adjustment_id) references public.finance_adjustments(id) on delete restrict;
alter table public.payable_ledger_entries add constraint payable_ledger_adjustment_fk
  foreign key (adjustment_id) references public.finance_adjustments(id) on delete restrict;

create table public.financial_movements (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  movement_type public.financial_movement_type not null,
  amount numeric(20, 2) not null check (amount > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  payment_id uuid references public.payments(id) on delete restrict,
  expense_id uuid references public.expenses(id) on delete restrict,
  reversal_of_id uuid unique references public.financial_movements(id) on delete restrict,
  description text not null check (char_length(trim(description)) between 3 and 500),
  occurred_at timestamptz not null,
  created_by uuid not null references public.user_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint financial_movement_source check (
    payment_id is not null or expense_id is not null or reversal_of_id is not null
  )
);
create index financial_movements_account_idx
  on public.financial_movements(financial_account_id, occurred_at desc);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  external_transaction_id text not null,
  transaction_date date not null,
  amount numeric(20, 2) not null check (amount <> 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  description text not null check (char_length(trim(description)) between 3 and 500),
  status public.bank_transaction_status not null default 'UNMATCHED',
  imported_by uuid not null references public.user_profiles(user_id) on delete restrict,
  imported_at timestamptz not null default now(),
  unique (financial_account_id, external_transaction_id)
);

create table public.reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount numeric(20, 2) not null check (amount > 0),
  status public.reconciliation_status not null default 'CONFIRMED',
  matched_by uuid not null references public.user_profiles(user_id) on delete restrict,
  matched_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique (bank_transaction_id),
  unique (payment_id),
  constraint reconciliation_lifecycle check (
    (status = 'CONFIRMED' and reversed_at is null)
    or (status = 'REVERSED' and reversed_at is not null)
  )
);

create or replace function app_private.require_finance_internal_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('app.finance_internal_write', true) <> 'on' then
    raise exception 'FINANCE_LEDGER_UPDATE_REQUIRES_COMMAND' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger receivables_command_update before update or delete on public.receivables
for each row execute function app_private.require_finance_internal_write();
create trigger payables_command_update before update or delete on public.payables
for each row execute function app_private.require_finance_internal_write();
create trigger payments_command_update before update or delete on public.payments
for each row execute function app_private.require_finance_internal_write();
create trigger customer_advances_command_update before update or delete on public.customer_advances
for each row execute function app_private.require_finance_internal_write();
create trigger supplier_advances_command_update before update or delete on public.supplier_advances
for each row execute function app_private.require_finance_internal_write();
create trigger expenses_command_update before update or delete on public.expenses
for each row execute function app_private.require_finance_internal_write();
create trigger adjustments_command_update before update or delete on public.finance_adjustments
for each row execute function app_private.require_finance_internal_write();
create trigger bank_transactions_command_update before update or delete on public.bank_transactions
for each row execute function app_private.require_finance_internal_write();
create trigger reconciliation_command_update before update or delete on public.reconciliation_matches
for each row execute function app_private.require_finance_internal_write();
create trigger payment_allocations_command_update before update or delete on public.payment_allocations
for each row execute function app_private.require_finance_internal_write();

create trigger receivable_ledger_immutable before update or delete on public.receivable_ledger_entries
for each row execute function app_private.prevent_immutable_delete();
create trigger payable_ledger_immutable before update or delete on public.payable_ledger_entries
for each row execute function app_private.prevent_immutable_delete();
create trigger financial_movements_immutable before update or delete on public.financial_movements
for each row execute function app_private.prevent_immutable_delete();
create trigger advance_allocations_immutable before update or delete on public.advance_allocations
for each row execute function app_private.prevent_immutable_delete();
create trigger expense_allocations_immutable before update or delete on public.expense_allocations
for each row execute function app_private.prevent_immutable_delete();
create trigger allocation_proposals_immutable before update or delete on public.payment_allocation_proposals
for each row execute function app_private.prevent_immutable_delete();

create or replace function app_private.recognize_delivery_finance(
  p_delivery_id uuid, p_source_event_id uuid, p_actor_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  delivery public.deliveries%rowtype;
  receivable_id uuid;
  payable_id uuid;
  receivable_amount numeric(20, 2);
  payable_amount numeric(20, 2);
  receivable_currency text;
  payable_currency text;
  purchase_order_id uuid;
begin
  select * into delivery from public.deliveries where id = p_delivery_id;
  if not found or delivery.status not in ('CONFIRMED', 'PARTIAL') then
    raise exception 'CONFIRMED_DELIVERY_REQUIRED' using errcode = '23514';
  end if;

  select round(sum(actual.accepted_quantity * sales_line.unit_price), 2), min(sales_line.currency)
    into receivable_amount, receivable_currency
  from public.delivery_lines line
  join public.delivery_actuals actual on actual.delivery_line_id = line.id
  join public.sales_order_lines sales_line on sales_line.id = line.sales_order_line_id
  where line.delivery_id = p_delivery_id;
  if receivable_amount is null or receivable_amount <= 0 then
    raise exception 'POSITIVE_RECEIVABLE_REQUIRED' using errcode = '23514';
  end if;

  insert into public.receivables (
    receivable_number, customer_id, sales_order_id, delivery_id, source_event_id,
    currency, original_amount, outstanding_amount, due_date, recognized_at, created_by
  ) values (
    'AR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receivable_number_seq')::text, 6, '0'),
    delivery.customer_id, delivery.sales_order_id, delivery.id, p_source_event_id,
    receivable_currency, receivable_amount, receivable_amount,
    coalesce(delivery.confirmed_at::date, current_date) + 30,
    coalesce(delivery.confirmed_at, now()), p_actor_id
  ) on conflict (delivery_id) do nothing returning id into receivable_id;
  if receivable_id is not null then
    insert into public.receivable_ledger_entries (
      receivable_id, entry_type, signed_amount, description, actor_user_id, occurred_at
    ) values (
      receivable_id, 'RECOGNITION', receivable_amount,
      'Ghi nhận phải thu khi giao hàng được xác nhận', p_actor_id,
      coalesce(delivery.confirmed_at, now())
    );
  end if;

  if delivery.sourcing_mode = 'SUPPLIER_DIRECT' then
    select round(sum(actual.actual_quantity * purchase_line.unit_cost), 2),
      min(purchase_line.currency), (array_agg(purchase_line.purchase_order_id))[1]
      into payable_amount, payable_currency, purchase_order_id
    from public.delivery_lines line
    join public.delivery_actuals actual on actual.delivery_line_id = line.id
    join public.supply_allocations allocation on allocation.id = line.supply_allocation_id
    join public.purchase_order_lines purchase_line on purchase_line.id = allocation.purchase_order_line_id
    where line.delivery_id = p_delivery_id;
    if payable_amount is not null and payable_amount > 0 then
      insert into public.payables (
        payable_number, supplier_id, purchase_order_id, delivery_id, source_event_id,
        currency, original_amount, outstanding_amount, due_date, recognized_at, created_by
      ) values (
        'AP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payable_number_seq')::text, 6, '0'),
        delivery.supplier_id, purchase_order_id, delivery.id, p_source_event_id,
        payable_currency, payable_amount, payable_amount,
        coalesce(delivery.confirmed_at::date, current_date) + 30,
        coalesce(delivery.confirmed_at, now()), p_actor_id
      ) on conflict (delivery_id) do nothing returning id into payable_id;
      if payable_id is not null then
        insert into public.payable_ledger_entries (
          payable_id, entry_type, signed_amount, description, actor_user_id, occurred_at
        ) values (
          payable_id, 'RECOGNITION', payable_amount,
          'Ghi nhận phải trả cho giao thẳng đã xác nhận', p_actor_id,
          coalesce(delivery.confirmed_at, now())
        );
      end if;
    end if;
  end if;
  return coalesce(receivable_id, (select id from public.receivables where delivery_id = p_delivery_id));
end;
$$;

create or replace function app_private.on_delivery_completed_recognize_finance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event_type = 'DELIVERY_COMPLETED' then
    perform app_private.recognize_delivery_finance(new.delivery_id, new.id, new.created_by);
  end if;
  return new;
end;
$$;
create trigger delivery_completed_recognize_finance
after insert on public.delivery_readiness_events
for each row when (new.event_type = 'DELIVERY_COMPLETED')
execute function app_private.on_delivery_completed_recognize_finance();

create or replace function app_private.create_financial_account(
  p_account_code text, p_account_name text, p_account_type public.financial_account_type,
  p_currency text, p_bank_name text, p_masked_number text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare account_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'finance.manage');
  insert into public.financial_accounts (
    account_code, account_name, account_type, currency, bank_name,
    bank_account_number_masked, created_by
  ) values (
    upper(trim(p_account_code)), trim(p_account_name), p_account_type, upper(trim(p_currency)),
    nullif(trim(p_bank_name), ''), nullif(trim(p_masked_number), ''), p_actor_id
  ) returning id into account_id;
  return account_id;
end;
$$;

create or replace function app_private.create_payment(
  p_direction public.payment_direction, p_account_id uuid, p_destination_account_id uuid,
  p_customer_id uuid, p_supplier_id uuid, p_currency text, p_amount numeric,
  p_payment_date date, p_reference text, p_note text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare payment_id uuid;
  normalized_currency text;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payment.create');
  normalized_currency := upper(trim(p_currency));
  if not exists (
    select 1 from public.financial_accounts
      where id = p_account_id and is_active and currency = normalized_currency
  ) then
    raise exception 'ACTIVE_ACCOUNT_WITH_MATCHING_CURRENCY_REQUIRED' using errcode = '23514';
  end if;
  if p_direction = 'INTERNAL_TRANSFER' and not exists (
    select 1 from public.financial_accounts
      where id = p_destination_account_id and is_active and currency = normalized_currency
  ) then
    raise exception 'ACTIVE_DESTINATION_WITH_MATCHING_CURRENCY_REQUIRED' using errcode = '23514';
  end if;
  insert into public.payments (
    payment_number, direction, financial_account_id, destination_account_id,
    customer_id, supplier_id, currency, amount, unallocated_amount, payment_date,
    external_reference, note, created_by
  ) values (
    'PAY-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_number_seq')::text, 6, '0'),
    p_direction, p_account_id, p_destination_account_id, p_customer_id, p_supplier_id,
    normalized_currency, p_amount, p_amount, p_payment_date,
    nullif(trim(p_reference), ''), nullif(trim(p_note), ''), p_actor_id
  ) returning id into payment_id;
  return payment_id;
end;
$$;

create or replace function app_private.allocate_payment(
  p_payment_id uuid, p_receivable_id uuid, p_payable_id uuid,
  p_amount numeric, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare payment public.payments%rowtype;
  target_outstanding numeric(20, 2);
  pending_total numeric(20, 2);
  allocation_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payment.allocate');
  select * into payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if payment.status <> 'DRAFT' then raise exception 'DRAFT_PAYMENT_REQUIRED' using errcode = '23514'; end if;
  if payment.direction = 'INTERNAL_TRANSFER' then
    raise exception 'TRANSFER_CANNOT_ALLOCATE' using errcode = '23514';
  end if;
  if p_amount <= 0 then raise exception 'POSITIVE_ALLOCATION_REQUIRED' using errcode = '22000'; end if;
  if payment.direction = 'RECEIPT' then
    if p_receivable_id is null or p_payable_id is not null then
      raise exception 'RECEIVABLE_ALLOCATION_REQUIRED' using errcode = '22000';
    end if;
    select outstanding_amount into target_outstanding from public.receivables
      where id = p_receivable_id and customer_id = payment.customer_id and status in ('OPEN', 'PARTIALLY_SETTLED')
      for update;
  else
    if p_payable_id is null or p_receivable_id is not null then
      raise exception 'PAYABLE_ALLOCATION_REQUIRED' using errcode = '22000';
    end if;
    select outstanding_amount into target_outstanding from public.payables
      where id = p_payable_id and supplier_id = payment.supplier_id and status in ('OPEN', 'PARTIALLY_SETTLED')
      for update;
  end if;
  if target_outstanding is null or p_amount > target_outstanding then
    raise exception 'ALLOCATION_EXCEEDS_OUTSTANDING' using errcode = '23514';
  end if;
  select coalesce(sum(amount), 0) into pending_total from public.payment_allocations
    where payment_id = p_payment_id and status = 'PENDING';
  if pending_total + p_amount > payment.amount then
    raise exception 'ALLOCATION_EXCEEDS_PAYMENT' using errcode = '23514';
  end if;
  insert into public.payment_allocations (
    payment_id, receivable_id, payable_id, amount, allocated_by
  ) values (p_payment_id, p_receivable_id, p_payable_id, p_amount, p_actor_id)
  returning id into allocation_id;
  return allocation_id;
end;
$$;

create or replace function app_private.post_payment(
  p_payment_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare payment public.payments%rowtype;
  allocation public.payment_allocations%rowtype;
  allocated_total numeric(20, 2) := 0;
  remainder numeric(20, 2);
  new_outstanding numeric(20, 2);
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payment.post');
  perform set_config('app.finance_internal_write', 'on', true);
  select * into payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if payment.status <> 'DRAFT' then raise exception 'DRAFT_PAYMENT_REQUIRED' using errcode = '23514'; end if;

  select coalesce(sum(amount), 0) into allocated_total from public.payment_allocations
    where payment_id = p_payment_id and status = 'PENDING';
  if allocated_total > payment.amount then
    raise exception 'ALLOCATION_EXCEEDS_PAYMENT' using errcode = '23514';
  end if;
  if payment.direction = 'INTERNAL_TRANSFER' and allocated_total <> 0 then
    raise exception 'TRANSFER_CANNOT_ALLOCATE' using errcode = '23514';
  end if;

  for allocation in select * from public.payment_allocations
    where payment_id = p_payment_id and status = 'PENDING' order by allocated_at, id
    for update
  loop
    if payment.direction = 'RECEIPT' then
      update public.receivables set
        outstanding_amount = outstanding_amount - allocation.amount,
        status = case when outstanding_amount - allocation.amount = 0
          then 'SETTLED' else 'PARTIALLY_SETTLED' end
      where id = allocation.receivable_id and outstanding_amount >= allocation.amount
      returning outstanding_amount into new_outstanding;
      if not found then raise exception 'RECEIVABLE_ALLOCATION_CONFLICT' using errcode = '40001'; end if;
      insert into public.receivable_ledger_entries (
        receivable_id, entry_type, signed_amount, payment_allocation_id,
        description, actor_user_id
      ) values (
        allocation.receivable_id, 'PAYMENT_ALLOCATION', -allocation.amount, allocation.id,
        'Phân bổ khoản thu ' || payment.payment_number, p_actor_id
      );
    else
      update public.payables set
        outstanding_amount = outstanding_amount - allocation.amount,
        status = case when outstanding_amount - allocation.amount = 0
          then 'SETTLED' else 'PARTIALLY_SETTLED' end
      where id = allocation.payable_id and outstanding_amount >= allocation.amount
      returning outstanding_amount into new_outstanding;
      if not found then raise exception 'PAYABLE_ALLOCATION_CONFLICT' using errcode = '40001'; end if;
      insert into public.payable_ledger_entries (
        payable_id, entry_type, signed_amount, payment_allocation_id,
        description, actor_user_id
      ) values (
        allocation.payable_id, 'PAYMENT_ALLOCATION', -allocation.amount, allocation.id,
        'Phân bổ khoản chi ' || payment.payment_number, p_actor_id
      );
    end if;
    update public.payment_allocations set status = 'APPLIED', applied_at = now()
      where id = allocation.id;
  end loop;

  remainder := payment.amount - allocated_total;
  if payment.direction = 'RECEIPT' then
    insert into public.financial_movements (
      financial_account_id, movement_type, amount, currency, payment_id,
      description, occurred_at, created_by
    ) values (
      payment.financial_account_id, 'RECEIPT', payment.amount, payment.currency, payment.id,
      'Thu tiền ' || payment.payment_number, payment.payment_date::timestamptz, p_actor_id
    );
    if remainder > 0 then
      insert into public.customer_advances (
        advance_number, customer_id, source_payment_id, currency, original_amount, remaining_amount
      ) values (
        'ADV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.advance_number_seq')::text, 6, '0'),
        payment.customer_id, payment.id, payment.currency, remainder, remainder
      );
    end if;
  elsif payment.direction = 'DISBURSEMENT' then
    insert into public.financial_movements (
      financial_account_id, movement_type, amount, currency, payment_id,
      description, occurred_at, created_by
    ) values (
      payment.financial_account_id, 'DISBURSEMENT', payment.amount, payment.currency, payment.id,
      'Chi tiền ' || payment.payment_number, payment.payment_date::timestamptz, p_actor_id
    );
    if remainder > 0 then
      insert into public.supplier_advances (
        advance_number, supplier_id, source_payment_id, currency, original_amount, remaining_amount
      ) values (
        'ADV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.advance_number_seq')::text, 6, '0'),
        payment.supplier_id, payment.id, payment.currency, remainder, remainder
      );
    end if;
  else
    insert into public.financial_movements (
      financial_account_id, movement_type, amount, currency, payment_id,
      description, occurred_at, created_by
    ) values
      (payment.financial_account_id, 'TRANSFER_OUT', payment.amount, payment.currency,
        payment.id, 'Chuyển tiền nội bộ ' || payment.payment_number, payment.payment_date::timestamptz, p_actor_id),
      (payment.destination_account_id, 'TRANSFER_IN', payment.amount, payment.currency,
        payment.id, 'Nhận tiền nội bộ ' || payment.payment_number, payment.payment_date::timestamptz, p_actor_id);
  end if;
  update public.payments set status = 'POSTED', unallocated_amount = 0,
    posted_by = p_actor_id, posted_at = now() where id = payment.id;
  return payment.id;
end;
$$;

create or replace function app_private.apply_customer_advance(
  p_advance_id uuid, p_receivable_id uuid, p_amount numeric, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare advance public.customer_advances%rowtype;
  receivable public.receivables%rowtype;
  allocation_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payment.allocate');
  perform set_config('app.finance_internal_write', 'on', true);
  select * into advance from public.customer_advances where id = p_advance_id for update;
  select * into receivable from public.receivables where id = p_receivable_id for update;
  if advance.status not in ('OPEN', 'PARTIALLY_APPLIED') or receivable.status not in ('OPEN', 'PARTIALLY_SETTLED')
    or advance.customer_id <> receivable.customer_id or p_amount <= 0
    or p_amount > advance.remaining_amount or p_amount > receivable.outstanding_amount then
    raise exception 'INVALID_CUSTOMER_ADVANCE_ALLOCATION' using errcode = '23514';
  end if;
  insert into public.advance_allocations (
    customer_advance_id, receivable_id, amount, allocated_by
  ) values (advance.id, receivable.id, p_amount, p_actor_id) returning id into allocation_id;
  update public.customer_advances set remaining_amount = remaining_amount - p_amount,
    status = case when remaining_amount - p_amount = 0 then 'APPLIED' else 'PARTIALLY_APPLIED' end
    where id = advance.id;
  update public.receivables set outstanding_amount = outstanding_amount - p_amount,
    status = case when outstanding_amount - p_amount = 0 then 'SETTLED' else 'PARTIALLY_SETTLED' end
    where id = receivable.id;
  insert into public.receivable_ledger_entries (
    receivable_id, entry_type, signed_amount, advance_allocation_id,
    description, actor_user_id
  ) values (
    receivable.id, 'ADVANCE_ALLOCATION', -p_amount, allocation_id,
    'Cấn trừ tiền khách ứng trước', p_actor_id
  );
  return allocation_id;
end;
$$;

create or replace function app_private.apply_supplier_advance(
  p_advance_id uuid, p_payable_id uuid, p_amount numeric, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare advance public.supplier_advances%rowtype;
  payable public.payables%rowtype;
  allocation_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payment.allocate');
  perform set_config('app.finance_internal_write', 'on', true);
  select * into advance from public.supplier_advances where id = p_advance_id for update;
  select * into payable from public.payables where id = p_payable_id for update;
  if advance.status not in ('OPEN', 'PARTIALLY_APPLIED') or payable.status not in ('OPEN', 'PARTIALLY_SETTLED')
    or advance.supplier_id <> payable.supplier_id or p_amount <= 0
    or p_amount > advance.remaining_amount or p_amount > payable.outstanding_amount then
    raise exception 'INVALID_SUPPLIER_ADVANCE_ALLOCATION' using errcode = '23514';
  end if;
  insert into public.advance_allocations (
    supplier_advance_id, payable_id, amount, allocated_by
  ) values (advance.id, payable.id, p_amount, p_actor_id) returning id into allocation_id;
  update public.supplier_advances set remaining_amount = remaining_amount - p_amount,
    status = case when remaining_amount - p_amount = 0 then 'APPLIED' else 'PARTIALLY_APPLIED' end
    where id = advance.id;
  update public.payables set outstanding_amount = outstanding_amount - p_amount,
    status = case when outstanding_amount - p_amount = 0 then 'SETTLED' else 'PARTIALLY_SETTLED' end
    where id = payable.id;
  insert into public.payable_ledger_entries (
    payable_id, entry_type, signed_amount, advance_allocation_id,
    description, actor_user_id
  ) values (
    payable.id, 'ADVANCE_ALLOCATION', -p_amount, allocation_id,
    'Cấn trừ tiền đã ứng nhà cung cấp', p_actor_id
  );
  return allocation_id;
end;
$$;

create or replace function app_private.reverse_payment(
  p_payment_id uuid, p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare payment public.payments%rowtype;
  allocation public.payment_allocations%rowtype;
  movement public.financial_movements%rowtype;
  customer_advance public.customer_advances%rowtype;
  supplier_advance public.supplier_advances%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'payment.reverse');
  if char_length(trim(p_reason)) < 10 then
    raise exception 'REVERSAL_REASON_REQUIRED' using errcode = '22000';
  end if;
  perform set_config('app.finance_internal_write', 'on', true);
  select * into payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if payment.status not in ('POSTED', 'RECONCILED') then
    raise exception 'POSTED_PAYMENT_REQUIRED' using errcode = '23514';
  end if;
  select * into customer_advance from public.customer_advances where source_payment_id = payment.id for update;
  if found and customer_advance.remaining_amount <> customer_advance.original_amount then
    raise exception 'USED_CUSTOMER_ADVANCE_CANNOT_REVERSE' using errcode = '23514';
  end if;
  select * into supplier_advance from public.supplier_advances where source_payment_id = payment.id for update;
  if found and supplier_advance.remaining_amount <> supplier_advance.original_amount then
    raise exception 'USED_SUPPLIER_ADVANCE_CANNOT_REVERSE' using errcode = '23514';
  end if;

  for allocation in select * from public.payment_allocations
    where payment_id = payment.id and status = 'APPLIED' for update
  loop
    if allocation.receivable_id is not null then
      update public.receivables set outstanding_amount = outstanding_amount + allocation.amount,
        status = case when outstanding_amount + allocation.amount = original_amount
          then 'OPEN' else 'PARTIALLY_SETTLED' end where id = allocation.receivable_id;
      insert into public.receivable_ledger_entries (
        receivable_id, entry_type, signed_amount, payment_allocation_id,
        description, actor_user_id
      ) values (
        allocation.receivable_id, 'REVERSAL', allocation.amount, allocation.id,
        'Hoàn tác khoản thu: ' || trim(p_reason), p_actor_id
      );
    else
      update public.payables set outstanding_amount = outstanding_amount + allocation.amount,
        status = case when outstanding_amount + allocation.amount = original_amount
          then 'OPEN' else 'PARTIALLY_SETTLED' end where id = allocation.payable_id;
      insert into public.payable_ledger_entries (
        payable_id, entry_type, signed_amount, payment_allocation_id,
        description, actor_user_id
      ) values (
        allocation.payable_id, 'REVERSAL', allocation.amount, allocation.id,
        'Hoàn tác khoản chi: ' || trim(p_reason), p_actor_id
      );
    end if;
    update public.payment_allocations set status = 'REVERSED', reversed_at = now()
      where id = allocation.id;
  end loop;
  for movement in select * from public.financial_movements
    where payment_id = payment.id and reversal_of_id is null
  loop
    insert into public.financial_movements (
      financial_account_id, movement_type, amount, currency, payment_id,
      reversal_of_id, description, occurred_at, created_by
    ) values (
      movement.financial_account_id, 'REVERSAL', movement.amount, movement.currency,
      payment.id, movement.id, 'Hoàn tác: ' || trim(p_reason), now(), p_actor_id
    );
  end loop;
  update public.customer_advances set status = 'REVERSED', remaining_amount = 0
    where source_payment_id = payment.id;
  update public.supplier_advances set status = 'REVERSED', remaining_amount = 0
    where source_payment_id = payment.id;
  update public.reconciliation_matches set status = 'REVERSED', reversed_at = now()
    where payment_id = payment.id and status = 'CONFIRMED';
  update public.bank_transactions bank set status = 'UNMATCHED'
    where exists (select 1 from public.reconciliation_matches match
      where match.bank_transaction_id = bank.id and match.payment_id = payment.id);
  update public.payments set status = 'REVERSED', reversed_by = p_actor_id,
    reversed_at = now(), reconciled_by = null, reconciled_at = null
    where id = payment.id;
  return payment.id;
end;
$$;

create or replace function app_private.create_expense(
  p_account_id uuid, p_expense_date date, p_category text, p_description text,
  p_currency text, p_amount numeric, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare expense_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'expense.manage');
  insert into public.expenses (
    expense_number, financial_account_id, expense_date, category,
    description, currency, amount, created_by
  ) values (
    'EXP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.expense_number_seq')::text, 6, '0'),
    p_account_id, p_expense_date, trim(p_category), trim(p_description),
    upper(trim(p_currency)), p_amount, p_actor_id
  ) returning id into expense_id;
  return expense_id;
end;
$$;

create or replace function app_private.post_expense(
  p_expense_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare expense public.expenses%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'expense.manage');
  perform set_config('app.finance_internal_write', 'on', true);
  select * into expense from public.expenses where id = p_expense_id for update;
  if not found or expense.status <> 'DRAFT' then
    raise exception 'DRAFT_EXPENSE_REQUIRED' using errcode = '23514';
  end if;
  insert into public.financial_movements (
    financial_account_id, movement_type, amount, currency, expense_id,
    description, occurred_at, created_by
  ) values (
    expense.financial_account_id, 'EXPENSE', expense.amount, expense.currency,
    expense.id, expense.description, expense.expense_date::timestamptz, p_actor_id
  );
  update public.expenses set status = 'POSTED', posted_by = p_actor_id, posted_at = now()
    where id = expense.id;
  return expense.id;
end;
$$;

create or replace function app_private.reverse_expense(
  p_expense_id uuid, p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare expense public.expenses%rowtype;
  movement public.financial_movements%rowtype;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'expense.manage');
  if char_length(trim(p_reason)) < 10 then
    raise exception 'REVERSAL_REASON_REQUIRED' using errcode = '22000';
  end if;
  perform set_config('app.finance_internal_write', 'on', true);
  select * into expense from public.expenses where id = p_expense_id for update;
  if not found or expense.status <> 'POSTED' then
    raise exception 'POSTED_EXPENSE_REQUIRED' using errcode = '23514';
  end if;
  select * into movement from public.financial_movements
    where expense_id = expense.id and reversal_of_id is null for update;
  if not found then raise exception 'EXPENSE_MOVEMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.financial_movements (
    financial_account_id, movement_type, amount, currency, expense_id,
    reversal_of_id, description, occurred_at, created_by
  ) values (
    movement.financial_account_id, 'REVERSAL', movement.amount, movement.currency,
    expense.id, movement.id, 'Hoàn tác chi phí: ' || trim(p_reason), now(), p_actor_id
  );
  update public.expenses set status = 'REVERSED', reversed_by = p_actor_id,
    reversed_at = now() where id = expense.id;
  return expense.id;
end;
$$;

create or replace function app_private.post_finance_adjustment(
  p_target_type public.finance_adjustment_target, p_target_id uuid,
  p_signed_amount numeric, p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare adjustment_id uuid;
  current_amount numeric(20, 2);
  document_original_amount numeric(20, 2);
  target_status public.finance_document_status;
begin
  perform app_private.assert_actor_permission(p_actor_id,
    case when p_target_type = 'RECEIVABLE' then 'receivable.adjust' else 'payable.adjust' end);
  if p_signed_amount = 0 or char_length(trim(p_reason)) < 10 then
    raise exception 'VALID_ADJUSTMENT_REQUIRED' using errcode = '22000';
  end if;
  perform set_config('app.finance_internal_write', 'on', true);
  if p_target_type = 'RECEIVABLE' then
    select receivables.outstanding_amount, receivables.original_amount, receivables.status
      into current_amount, document_original_amount, target_status
      from public.receivables where receivables.id = p_target_id for update;
  else
    select payables.outstanding_amount, payables.original_amount, payables.status
      into current_amount, document_original_amount, target_status
      from public.payables where payables.id = p_target_id for update;
  end if;
  if current_amount is null or target_status not in ('OPEN', 'PARTIALLY_SETTLED', 'SETTLED')
    or current_amount + p_signed_amount < 0 or current_amount + p_signed_amount > document_original_amount then
    raise exception 'ADJUSTMENT_OUT_OF_RANGE' using errcode = '23514';
  end if;
  insert into public.finance_adjustments (
    adjustment_number, target_type, receivable_id, payable_id,
    signed_amount, reason, created_by
  ) values (
    'ADJ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.adjustment_number_seq')::text, 6, '0'),
    p_target_type,
    case when p_target_type = 'RECEIVABLE' then p_target_id end,
    case when p_target_type = 'PAYABLE' then p_target_id end,
    p_signed_amount, trim(p_reason), p_actor_id
  ) returning id into adjustment_id;
  if p_target_type = 'RECEIVABLE' then
    update public.receivables set outstanding_amount = outstanding_amount + p_signed_amount,
      status = case when outstanding_amount + p_signed_amount = 0 then 'SETTLED'
        when outstanding_amount + p_signed_amount = original_amount then 'OPEN'
        else 'PARTIALLY_SETTLED' end where id = p_target_id;
    insert into public.receivable_ledger_entries (
      receivable_id, entry_type, signed_amount, adjustment_id, description, actor_user_id
    ) values (p_target_id, 'ADJUSTMENT', p_signed_amount, adjustment_id, trim(p_reason), p_actor_id);
  else
    update public.payables set outstanding_amount = outstanding_amount + p_signed_amount,
      status = case when outstanding_amount + p_signed_amount = 0 then 'SETTLED'
        when outstanding_amount + p_signed_amount = original_amount then 'OPEN'
        else 'PARTIALLY_SETTLED' end where id = p_target_id;
    insert into public.payable_ledger_entries (
      payable_id, entry_type, signed_amount, adjustment_id, description, actor_user_id
    ) values (p_target_id, 'ADJUSTMENT', p_signed_amount, adjustment_id, trim(p_reason), p_actor_id);
  end if;
  return adjustment_id;
end;
$$;

create or replace function app_private.reverse_finance_adjustment(
  p_adjustment_id uuid, p_reason text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare original public.finance_adjustments%rowtype;
  reversal_id uuid;
  current_amount numeric(20, 2);
  document_original_amount numeric(20, 2);
begin
  if char_length(trim(p_reason)) < 10 then
    raise exception 'REVERSAL_REASON_REQUIRED' using errcode = '22000';
  end if;
  perform set_config('app.finance_internal_write', 'on', true);
  select * into original from public.finance_adjustments where id = p_adjustment_id for update;
  if not found or original.status <> 'POSTED' or original.reversal_of_id is not null then
    raise exception 'POSTED_ADJUSTMENT_REQUIRED' using errcode = '23514';
  end if;
  perform app_private.assert_actor_permission(p_actor_id,
    case when original.target_type = 'RECEIVABLE' then 'receivable.adjust' else 'payable.adjust' end);
  if original.target_type = 'RECEIVABLE' then
    select receivables.outstanding_amount, receivables.original_amount
      into current_amount, document_original_amount
      from public.receivables where receivables.id = original.receivable_id for update;
  else
    select payables.outstanding_amount, payables.original_amount
      into current_amount, document_original_amount
      from public.payables where payables.id = original.payable_id for update;
  end if;
  if current_amount - original.signed_amount < 0
    or current_amount - original.signed_amount > document_original_amount then
    raise exception 'ADJUSTMENT_REVERSAL_OUT_OF_RANGE' using errcode = '23514';
  end if;
  insert into public.finance_adjustments (
    adjustment_number, target_type, receivable_id, payable_id, signed_amount,
    reason, reversal_of_id, created_by
  ) values (
    'ADJ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.adjustment_number_seq')::text, 6, '0'),
    original.target_type, original.receivable_id, original.payable_id,
    -original.signed_amount, 'Hoàn tác: ' || trim(p_reason), original.id, p_actor_id
  ) returning id into reversal_id;
  if original.target_type = 'RECEIVABLE' then
    update public.receivables set outstanding_amount = outstanding_amount - original.signed_amount,
      status = case when outstanding_amount - original.signed_amount = 0 then 'SETTLED'
        when outstanding_amount - original.signed_amount = original_amount then 'OPEN'
        else 'PARTIALLY_SETTLED' end where id = original.receivable_id;
    insert into public.receivable_ledger_entries (
      receivable_id, entry_type, signed_amount, adjustment_id, description, actor_user_id
    ) values (
      original.receivable_id, 'REVERSAL', -original.signed_amount, reversal_id,
      'Hoàn tác điều chỉnh: ' || trim(p_reason), p_actor_id
    );
  else
    update public.payables set outstanding_amount = outstanding_amount - original.signed_amount,
      status = case when outstanding_amount - original.signed_amount = 0 then 'SETTLED'
        when outstanding_amount - original.signed_amount = original_amount then 'OPEN'
        else 'PARTIALLY_SETTLED' end where id = original.payable_id;
    insert into public.payable_ledger_entries (
      payable_id, entry_type, signed_amount, adjustment_id, description, actor_user_id
    ) values (
      original.payable_id, 'REVERSAL', -original.signed_amount, reversal_id,
      'Hoàn tác điều chỉnh: ' || trim(p_reason), p_actor_id
    );
  end if;
  update public.finance_adjustments set status = 'REVERSED', reversed_at = now()
    where id = original.id;
  return reversal_id;
end;
$$;

create or replace function app_private.record_bank_transaction(
  p_account_id uuid, p_external_id text, p_transaction_date date,
  p_amount numeric, p_currency text, p_description text, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare transaction_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'reconciliation.manage');
  if not exists (select 1 from public.financial_accounts
    where id = p_account_id and account_type = 'BANK' and is_active) then
    raise exception 'ACTIVE_BANK_ACCOUNT_REQUIRED' using errcode = '23514';
  end if;
  insert into public.bank_transactions (
    financial_account_id, external_transaction_id, transaction_date,
    amount, currency, description, imported_by
  ) values (
    p_account_id, trim(p_external_id), p_transaction_date, p_amount,
    upper(trim(p_currency)), trim(p_description), p_actor_id
  ) returning id into transaction_id;
  return transaction_id;
end;
$$;

create or replace function app_private.reconcile_payment(
  p_payment_id uuid, p_bank_transaction_id uuid, p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare payment public.payments%rowtype;
  bank_transaction public.bank_transactions%rowtype;
  match_id uuid;
begin
  perform app_private.assert_actor_permission(p_actor_id, 'reconciliation.manage');
  perform set_config('app.finance_internal_write', 'on', true);
  select * into payment from public.payments where id = p_payment_id for update;
  select * into bank_transaction from public.bank_transactions
    where id = p_bank_transaction_id for update;
  if payment.status <> 'POSTED' or bank_transaction.status <> 'UNMATCHED'
    or payment.financial_account_id <> bank_transaction.financial_account_id
    or payment.currency <> bank_transaction.currency
    or abs(bank_transaction.amount) <> payment.amount
    or (payment.direction = 'RECEIPT' and bank_transaction.amount < 0)
    or (payment.direction <> 'RECEIPT' and bank_transaction.amount > 0) then
    raise exception 'RECONCILIATION_MISMATCH' using errcode = '23514';
  end if;
  insert into public.reconciliation_matches (
    bank_transaction_id, payment_id, amount, matched_by
  ) values (bank_transaction.id, payment.id, payment.amount, p_actor_id)
  returning id into match_id;
  update public.bank_transactions set status = 'MATCHED' where id = bank_transaction.id;
  update public.payments set status = 'RECONCILED', reconciled_by = p_actor_id,
    reconciled_at = now() where id = payment.id;
  return match_id;
end;
$$;

-- Backfill any P7 completion events that existed before this migration. The
-- unique delivery keys keep recognition idempotent.
select app_private.recognize_delivery_finance(event.delivery_id, event.id, event.created_by)
from public.delivery_readiness_events event
where event.event_type = 'DELIVERY_COMPLETED'
  and not exists (select 1 from public.receivables where delivery_id = event.delivery_id);

create view public.finance_aging with (security_invoker = true) as
select 'RECEIVABLE'::text as document_type, receivable.id as document_id,
  receivable.receivable_number as document_number, customer.name_vi as party_name,
  receivable.currency, receivable.outstanding_amount, receivable.due_date,
  greatest(current_date - receivable.due_date, 0) as days_overdue,
  case when receivable.due_date >= current_date then 'CHUA_DEN_HAN'
    when current_date - receivable.due_date <= 30 then 'QUA_HAN_1_30'
    when current_date - receivable.due_date <= 60 then 'QUA_HAN_31_60'
    when current_date - receivable.due_date <= 90 then 'QUA_HAN_61_90'
    else 'QUA_HAN_TREN_90' end as aging_bucket
from public.receivables receivable
join public.customers customer on customer.id = receivable.customer_id
where receivable.status in ('OPEN', 'PARTIALLY_SETTLED')
union all
select 'PAYABLE'::text, payable.id, payable.payable_number, supplier.name_vi,
  payable.currency, payable.outstanding_amount, payable.due_date,
  greatest(current_date - payable.due_date, 0),
  case when payable.due_date >= current_date then 'CHUA_DEN_HAN'
    when current_date - payable.due_date <= 30 then 'QUA_HAN_1_30'
    when current_date - payable.due_date <= 60 then 'QUA_HAN_31_60'
    when current_date - payable.due_date <= 90 then 'QUA_HAN_61_90'
    else 'QUA_HAN_TREN_90' end
from public.payables payable
join public.suppliers supplier on supplier.id = payable.supplier_id
where payable.status in ('OPEN', 'PARTIALLY_SETTLED');

create view public.finance_working_capital_summary with (security_invoker = true) as
select current_date as as_of_date,
  coalesce((select sum(outstanding_amount) from public.receivables
    where status in ('OPEN', 'PARTIALLY_SETTLED')), 0)::numeric(20,2) as receivables,
  coalesce((select sum(outstanding_amount) from public.receivables
    where status in ('OPEN', 'PARTIALLY_SETTLED') and due_date < current_date), 0)::numeric(20,2)
    as overdue_receivables,
  coalesce((select sum(outstanding_amount) from public.payables
    where status in ('OPEN', 'PARTIALLY_SETTLED')), 0)::numeric(20,2) as payables,
  coalesce((select sum(outstanding_amount) from public.payables
    where status in ('OPEN', 'PARTIALLY_SETTLED') and due_date < current_date), 0)::numeric(20,2)
    as overdue_payables,
  coalesce((select sum(case
      when movement.reversal_of_id is null
        and movement.movement_type in ('RECEIPT', 'TRANSFER_IN') then movement.amount
      when movement.reversal_of_id is null then -movement.amount
      when original.movement_type in ('RECEIPT', 'TRANSFER_IN') then -movement.amount
      else movement.amount end)
    from public.financial_movements movement
    left join public.financial_movements original on original.id = movement.reversal_of_id), 0)::numeric(20,2)
    as cash_balance,
  coalesce((select sum(remaining_amount) from public.customer_advances
    where status in ('OPEN', 'PARTIALLY_APPLIED')), 0)::numeric(20,2) as customer_advances,
  coalesce((select sum(remaining_amount) from public.supplier_advances
    where status in ('OPEN', 'PARTIALLY_APPLIED')), 0)::numeric(20,2) as supplier_advances;

alter table public.receivables enable row level security;
alter table public.payables enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_allocation_proposals enable row level security;
alter table public.customer_advances enable row level security;
alter table public.supplier_advances enable row level security;
alter table public.advance_allocations enable row level security;
alter table public.receivable_ledger_entries enable row level security;
alter table public.payable_ledger_entries enable row level security;
alter table public.financial_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_allocations enable row level security;
alter table public.finance_adjustments enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.reconciliation_matches enable row level security;

revoke all on public.receivables, public.payables, public.financial_accounts,
  public.payments, public.payment_allocations, public.payment_allocation_proposals,
  public.customer_advances, public.supplier_advances, public.advance_allocations,
  public.receivable_ledger_entries, public.payable_ledger_entries,
  public.financial_movements, public.expenses, public.expense_allocations,
  public.finance_adjustments, public.bank_transactions,
  public.reconciliation_matches from anon, authenticated;
grant select on public.receivables, public.payables, public.financial_accounts,
  public.payments, public.payment_allocations, public.payment_allocation_proposals,
  public.customer_advances, public.supplier_advances, public.advance_allocations,
  public.receivable_ledger_entries, public.payable_ledger_entries,
  public.financial_movements, public.expenses, public.expense_allocations,
  public.finance_adjustments, public.bank_transactions,
  public.reconciliation_matches to authenticated;
revoke all on public.finance_aging, public.finance_working_capital_summary from anon, authenticated;
grant select on public.finance_aging, public.finance_working_capital_summary to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'receivables', 'payables', 'financial_accounts', 'payments',
    'payment_allocations', 'payment_allocation_proposals', 'customer_advances',
    'supplier_advances', 'advance_allocations', 'receivable_ledger_entries',
    'payable_ledger_entries', 'financial_movements', 'expenses',
    'expense_allocations', 'finance_adjustments', 'bank_transactions',
    'reconciliation_matches'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select app_private.is_active_user((select auth.uid()))) and (select app_private.has_permission(''finance.read'')))',
      table_name || '_finance_read', table_name
    );
  end loop;
end;
$$;

revoke all on function app_private.require_finance_internal_write() from public;
revoke all on function app_private.recognize_delivery_finance(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.on_delivery_completed_recognize_finance() from public;
revoke all on function app_private.create_financial_account(text, text, public.financial_account_type, text, text, text, uuid) from public, anon, authenticated;
revoke all on function app_private.create_payment(public.payment_direction, uuid, uuid, uuid, uuid, text, numeric, date, text, text, uuid) from public, anon, authenticated;
revoke all on function app_private.allocate_payment(uuid, uuid, uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function app_private.post_payment(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.apply_customer_advance(uuid, uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function app_private.apply_supplier_advance(uuid, uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function app_private.reverse_payment(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.create_expense(uuid, date, text, text, text, numeric, uuid) from public, anon, authenticated;
revoke all on function app_private.post_expense(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.reverse_expense(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.post_finance_adjustment(public.finance_adjustment_target, uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function app_private.reverse_finance_adjustment(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.record_bank_transaction(uuid, text, date, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function app_private.reconcile_payment(uuid, uuid, uuid) from public, anon, authenticated;

insert into public.permissions (code, description_vi) values
  ('finance.manage', 'Quản lý tài khoản tiền và thiết lập tài chính'),
  ('receivable.read', 'Xem công nợ phải thu'),
  ('receivable.adjust', 'Điều chỉnh phải thu bằng bút toán'),
  ('payable.read', 'Xem công nợ phải trả'),
  ('payable.adjust', 'Điều chỉnh phải trả bằng bút toán'),
  ('payment.read', 'Xem khoản thu chi'),
  ('payment.create', 'Lập khoản thu chi nháp'),
  ('payment.allocate', 'Phân bổ khoản thu chi và tiền ứng trước'),
  ('payment.post', 'Ghi sổ khoản thu chi'),
  ('payment.reverse', 'Hoàn tác khoản thu chi bằng bút toán bù'),
  ('reconciliation.manage', 'Đối chiếu giao dịch ngân hàng'),
  ('expense.manage', 'Ghi nhận và phân bổ chi phí')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
cross join public.permissions permission
where role.code in ('OWNER_ADMIN', 'FINANCE') and permission.code in (
  'finance.read', 'finance.manage', 'receivable.read', 'receivable.adjust',
  'payable.read', 'payable.adjust', 'payment.read', 'payment.create',
  'payment.allocate', 'payment.post', 'payment.reverse',
  'reconciliation.manage', 'expense.manage'
) on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
cross join public.permissions permission
where role.code = 'AUDITOR_VIEWER' and permission.code in (
  'finance.read', 'receivable.read', 'payable.read', 'payment.read'
) on conflict do nothing;
