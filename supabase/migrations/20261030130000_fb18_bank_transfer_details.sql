-- FB18: the bank details customers transfer to come from the cash book. A bank account ("Ngân hàng" fund) may carry its
-- bank, account number and holder; the owner marks one of them "Hiện cho khách" and the customer portal shows exactly
-- that one on Công nợ (with a copy button). Only people who may see the customer's debts read it.
begin;

alter table public.finance_accounts
  add column bank_name text check (bank_name is null or char_length(bank_name) between 2 and 120),
  add column bank_account_number text check (bank_account_number is null or bank_account_number ~ '^[0-9A-Za-z.-]{4,32}$'),
  add column bank_account_holder text check (bank_account_holder is null or char_length(bank_account_holder) between 2 and 120),
  add column shown_to_customers boolean not null default false,
  add constraint finance_accounts_shown_needs_details check (not shown_to_customers or (account_kind = 'BANK' and bank_name is not null and bank_account_number is not null and bank_account_holder is not null));
create unique index finance_accounts_one_shown on public.finance_accounts(branch_id) where shown_to_customers;

create or replace function public.set_finance_account_bank_details(target_account_id uuid, bank text, account_number text, account_holder text,
  show_to_customers boolean, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account public.finance_accounts%rowtype;
  number_clean text := nullif(regexp_replace(coalesce(account_number, ''), '\s', '', 'g'), '');
  hash text := private.command_payload_hash(jsonb_build_object('account', target_account_id, 'bank', trim(coalesce(bank, '')), 'number', number_clean,
    'holder', upper(trim(coalesce(account_holder, ''))), 'show', show_to_customers));
  receipt public.command_receipts%rowtype;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into receipt from public.command_receipts r where r.operation_id = set_finance_account_bank_details.operation_id;
  if receipt.operation_id is not null then
    if receipt.actor_auth_user_id <> auth.uid() or receipt.command_name <> 'set_finance_account_bank_details' or receipt.payload_hash <> hash then
      raise exception 'operation_payload_conflict' using errcode = '22023';
    end if;
    return receipt.result_entity_id;
  end if;
  select * into account from public.finance_accounts a where a.id = target_account_id for update;
  if account.id is null or not private.has_permission(account.branch_id, 'finance.account.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if account.account_kind <> 'BANK' then raise exception 'bank_details_need_bank_account' using errcode = '22023'; end if;
  if show_to_customers and (nullif(trim(bank), '') is null or number_clean is null or nullif(trim(account_holder), '') is null) then
    raise exception 'bank_details_incomplete' using errcode = '22023';
  end if;
  if show_to_customers then
    update public.finance_accounts set shown_to_customers = false where branch_id = account.branch_id and shown_to_customers and id <> account.id;
  end if;
  update public.finance_accounts set bank_name = nullif(trim(bank), ''), bank_account_number = number_clean,
    bank_account_holder = nullif(upper(trim(account_holder)), ''), shown_to_customers = coalesce(show_to_customers, false)
  where id = account.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values (auth.uid(), account.branch_id, 'finance.account.bank_details', 'finance_account', account.id, set_finance_account_bank_details.operation_id,
    array['bank_name', 'bank_account_number', 'bank_account_holder', 'shown_to_customers']);
  insert into public.command_receipts values (set_finance_account_bank_details.operation_id, auth.uid(), 'set_finance_account_bank_details', hash, 'finance_account', account.id, now());
  return account.id;
end $$;

-- The account a customer transfers to: the one marked for customers in the customer's branch.
create or replace function public.portal_payment_account(target_customer_id uuid)
returns table(bank_name text, account_number text, account_holder text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_customer_membership(target_customer_id, array['OWNER', 'FINANCE_CONTACT']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select a.bank_name, a.bank_account_number, a.bank_account_holder
  from public.finance_accounts a join public.customers c on c.branch_id = a.branch_id
  where c.id = target_customer_id and a.shown_to_customers and a.active
  limit 1;
end $$;

revoke all on function public.set_finance_account_bank_details(uuid, text, text, text, boolean, uuid), public.portal_payment_account(uuid) from public, anon;
grant execute on function public.set_finance_account_bank_details(uuid, text, text, text, boolean, uuid), public.portal_payment_account(uuid) to authenticated;

commit;
