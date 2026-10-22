-- FB7 item 7 (Owner 22/10): a stock count that finds less than the books is a loss. When the count is approved, the value
-- of the decreases (average cost × quantity, as the adjustment movements already carry it) is recorded as one approved
-- expense of type "Hao hụt kiểm kho": it shows in Chi phí and Sổ quỹ (as a non-cash line), lowers profit, and moves no
-- money and no supplier balance. Increases record nothing. approve_stock_count itself is unchanged.
begin;

create or replace function private.record_stock_count_loss() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  loss bigint; detail text; category public.expense_categories%rowtype; warehouse_name text; actor uuid; local_day date;
begin
  if new.state <> 'APPROVED' or old.state = 'APPROVED' then return new; end if;
  select coalesce(-sum(mv.inventory_value_delta_vnd), 0)::bigint,
    string_agg(m.name || ' −' || trim_scale(-mv.base_quantity_delta)::text || ' ' || u.symbol
      || coalesce(' (' || nullif(trim(l.reason), '') || ')', ''), '; ' order by m.name)
    into loss, detail
  from public.inventory_movements mv
  join public.stock_count_lines l on l.id = mv.source_stock_count_line_id
  join public.materials m on m.id = mv.material_id
  join public.units_of_measure u on u.id = m.base_uom_id
  where l.stock_count_id = new.id and mv.movement_type = 'STOCK_ADJUSTMENT' and mv.inventory_value_delta_vnd < 0;
  if loss <= 0 then return new; end if;

  actor := coalesce(new.approved_by, (select auth.uid()));
  select * into category from public.expense_categories c
    where c.branch_id = new.branch_id and c.active and lower(c.name) = 'hao hụt kiểm kho' order by c.created_at limit 1;
  if category.id is null then
    insert into public.expense_categories(branch_id, code, name, created_by) values (new.branch_id, 'HAOHUT', 'Hao hụt kiểm kho', actor)
      on conflict (branch_id, code) do nothing returning * into category;
    if category.id is null then
      insert into public.expense_categories(branch_id, code, name, created_by)
      values (new.branch_id, 'HAOHUT-' || upper(substr(md5(new.id::text), 1, 6)), 'Hao hụt kiểm kho', actor) returning * into category;
    end if;
  end if;
  select w.name into warehouse_name from public.warehouses w where w.id = new.warehouse_id;
  local_day := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  insert into public.expenses(branch_id, expense_number, category_id, supplier_id, amount_vnd, effective_at, due_date, description,
    activity_kind, approval_state, created_by, approved_by, approved_at, payee_kind, payee_name, settlement, counts_in_profit, stock_count_id)
  values (new.branch_id, 'EXP-' || to_char(local_day, 'YYYYMM') || '-' || lpad(nextval('public.finance_expense_number_seq')::text, 6, '0'),
    category.id, null, loss, coalesce(new.approved_at, now()), local_day, left('Kiểm kho ' || new.count_number || ': ' || detail, 500),
    'OPERATIONS', 'APPROVED', actor, actor, now(), 'OTHER', left('Kho ' || coalesce(warehouse_name, ''), 160), 'NON_CASH', true, new.id);
  return new;
end
$function$;
revoke all on function private.record_stock_count_loss() from public, anon, authenticated;

create trigger stock_counts_record_loss after update of state on public.stock_counts
  for each row execute function private.record_stock_count_loss();

commit;
