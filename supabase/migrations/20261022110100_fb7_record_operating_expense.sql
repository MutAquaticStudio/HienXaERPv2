-- FB7 2/3: "Ghi chi phí" like KiotViet — any payee, paid now from a cash/bank account or owed to a supplier.
begin;

-- "Ghi chi phí": recorded and approved in one step. PAID_NOW posts the disbursement from the chosen account (to a supplier it
-- also settles that supplier's payable at once, so their balance does not move); PAYABLE leaves it owed to the supplier.
create or replace function public.record_operating_expense(target_branch_id uuid, target_category_id uuid, new_category_name text,
  amount_vnd bigint, effective_at timestamptz, payee_kind text, target_supplier_id uuid, target_employee_id uuid, payee_name text,
  settlement text, target_account_id uuid, counts_in_profit boolean, description text, target_sales_order_id uuid, operation_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  hash text; receipt public.command_receipts%rowtype; category public.expense_categories%rowtype; supplier public.suppliers%rowtype;
  employee_name text; account public.finance_accounts%rowtype; source_order public.sales_orders%rowtype;
  expense_id uuid; payable_id uuid; payment_id uuid; local_day date; text_note text; payee text;
begin
  if not private.has_permission(target_branch_id, 'finance.expense.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if settlement = 'PAID_NOW' and not private.has_permission(target_branch_id, 'finance.payment.post') then raise exception 'forbidden' using errcode = '42501'; end if;
  if record_operating_expense.operation_id is null or amount_vnd is null or amount_vnd <= 0 or effective_at is null or not isfinite(effective_at)
    or payee_kind is null or payee_kind not in ('OTHER', 'SUPPLIER', 'EMPLOYEE') or settlement is null or settlement not in ('PAID_NOW', 'PAYABLE')
    or (settlement = 'PAYABLE' and payee_kind <> 'SUPPLIER') or (settlement = 'PAID_NOW' and target_account_id is null)
    or (target_category_id is null and char_length(coalesce(trim(new_category_name), '')) not between 2 and 120)
    or char_length(coalesce(trim(description), '')) > 500 or char_length(coalesce(trim(payee_name), '')) > 160 then
    raise exception 'invalid_expense' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'category', target_category_id,
    'new_category', nullif(trim(new_category_name), ''), 'amount', amount_vnd, 'effective_at', effective_at, 'payee_kind', payee_kind,
    'supplier', target_supplier_id, 'employee', target_employee_id, 'payee', nullif(trim(payee_name), ''), 'settlement', settlement,
    'account', target_account_id, 'in_profit', coalesce(counts_in_profit, true), 'description', nullif(trim(description), ''), 'order', target_sales_order_id));
  perform pg_advisory_xact_lock(hashtextextended('record_operating_expense:' || record_operating_expense.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = record_operating_expense.operation_id;
  if found then
    if receipt.command_name <> 'record_operating_expense' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;

  if target_category_id is not null then
    select * into category from public.expense_categories c where c.id = target_category_id and c.branch_id = target_branch_id and c.active;
  else
    select * into category from public.expense_categories c where c.branch_id = target_branch_id and c.active
      and lower(c.name) = lower(trim(new_category_name)) order by c.created_at limit 1;
    if category.id is null then
      insert into public.expense_categories(branch_id, code, name, created_by)
      values (target_branch_id, 'LC' || upper(substr(md5(record_operating_expense.operation_id::text), 1, 8)), trim(new_category_name), (select auth.uid()))
      returning * into category;
    end if;
  end if;
  if category.id is null then raise exception 'invalid_expense_category' using errcode = '23503'; end if;

  if payee_kind = 'SUPPLIER' then
    select * into supplier from public.suppliers s where s.id = target_supplier_id and s.branch_id = target_branch_id and s.active;
    if supplier.id is null then raise exception 'invalid_expense_supplier' using errcode = '23503'; end if;
    payee := supplier.name;
  elsif payee_kind = 'EMPLOYEE' then
    select e.display_name into employee_name from public.employees e join public.employee_branch_access a on a.employee_id = e.id
      where e.id = target_employee_id and e.active and a.branch_id = target_branch_id and a.active limit 1;
    if employee_name is null then raise exception 'invalid_expense_employee' using errcode = '23503'; end if;
    payee := employee_name;
  else
    payee := coalesce(nullif(trim(payee_name), ''), 'Khác');
  end if;
  if target_sales_order_id is not null then
    select * into source_order from public.sales_orders o where o.id = target_sales_order_id and o.branch_id = target_branch_id;
    if source_order.id is null then raise exception 'invalid_expense_source' using errcode = '23503'; end if;
  end if;
  if settlement = 'PAID_NOW' then
    select * into account from public.finance_accounts f where f.id = target_account_id and f.branch_id = target_branch_id and f.active for update;
    if account.id is null then raise exception 'invalid_finance_account' using errcode = '23503'; end if;
  end if;

  local_day := (effective_at at time zone 'Asia/Ho_Chi_Minh')::date;
  text_note := coalesce(nullif(trim(description), ''), category.name || ' · ' || payee);
  if char_length(text_note) < 3 then text_note := 'Chi ' || text_note; end if;
  insert into public.expenses(branch_id, expense_number, category_id, supplier_id, amount_vnd, effective_at, due_date, description,
    activity_kind, sales_order_id, customer_id, site_id, sales_employee_id, approval_state, created_by, approved_by, approved_at,
    payee_kind, payee_name, employee_id, settlement, counts_in_profit)
  values (target_branch_id, 'EXP-' || to_char(local_day, 'YYYYMM') || '-' || lpad(nextval('public.finance_expense_number_seq')::text, 6, '0'),
    category.id, case when payee_kind = 'SUPPLIER' then supplier.id end, amount_vnd, effective_at,
    local_day + case when settlement = 'PAYABLE' then coalesce(supplier.payment_terms_days, 0) else 0 end,
    left(text_note, 500), case when target_sales_order_id is not null then 'SALES' else 'OPERATIONS' end, source_order.id, source_order.customer_id,
    source_order.site_id, source_order.sales_owner_employee_id, 'APPROVED', (select auth.uid()), (select auth.uid()), now(),
    payee_kind, case when payee_kind = 'OTHER' then payee end, case when payee_kind = 'EMPLOYEE' then target_employee_id end,
    settlement, coalesce(counts_in_profit, true))
  returning id into expense_id;

  if payee_kind = 'SUPPLIER' then
    insert into public.payable_obligations(branch_id, supplier_id, expense_id, original_amount_vnd, due_date, recorded_at, recorded_by)
    values (target_branch_id, supplier.id, expense_id, amount_vnd,
      local_day + case when settlement = 'PAYABLE' then coalesce(supplier.payment_terms_days, 0) else 0 end, now(), (select auth.uid()))
    returning id into payable_id;
  end if;
  if settlement = 'PAID_NOW' then
    insert into public.payments(branch_id, payment_number, direction, supplier_id, account_id, amount_vnd, method, external_reference,
      effective_at, posted_by, expense_id, payee_name)
    values (target_branch_id, 'PAY-' || to_char(local_day, 'YYYYMM') || '-' || lpad(nextval('public.finance_payment_number_seq')::text, 6, '0'),
      'DISBURSEMENT', case when payee_kind = 'SUPPLIER' then supplier.id end, account.id, amount_vnd,
      case when account.account_kind = 'CASH' then 'CASH' else 'BANK_TRANSFER' end, left('Chi phí: ' || category.name, 160),
      effective_at, (select auth.uid()), expense_id, case when payee_kind <> 'SUPPLIER' then payee end)
    returning id into payment_id;
    if payable_id is not null then
      perform private.allocate_payment_lines(payment_id, jsonb_build_array(jsonb_build_object('obligation_id', payable_id, 'amount_vnd', amount_vnd)), (select auth.uid()));
    end if;
  end if;
  insert into public.command_receipts values (record_operating_expense.operation_id, (select auth.uid()), 'record_operating_expense', hash, 'expense', expense_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), target_branch_id, 'expense.recorded', 'expense', expense_id, record_operating_expense.operation_id,
    array['category_id', 'payee', 'amount_vnd', 'settlement', 'counts_in_profit']);
  return expense_id;
end
$function$;
revoke all on function public.record_operating_expense(uuid, uuid, text, bigint, timestamptz, text, uuid, uuid, text, text, uuid, boolean, text, uuid, uuid) from public, anon;
grant execute on function public.record_operating_expense(uuid, uuid, text, bigint, timestamptz, text, uuid, uuid, text, text, uuid, boolean, text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
