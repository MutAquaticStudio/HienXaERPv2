-- D88 (Owner 16/11/2026): "Lúc khách đặt mà kho chưa đủ, đơn nằm 'Chờ duyệt'. Sau đó kho có hàng (nhập hàng, kiểm kho, chuyển
-- kho), hệ thống nên làm gì với các đơn khách đang chờ duyệt đó?" → "Tự duyệt lại".
-- D79 tried the automatic approval of a portal order only once, when the customer submitted it. Now every transaction that
-- ADDS stock to a warehouse (any positive WAREHOUSE row of inventory_movements: purchase receipt, stock count / adjustment,
-- transfer receipt, return, opening…) tries again, at the end of that transaction, for the waiting portal orders (DRAFT,
-- CUSTOMER_PORTAL) of the same branch with a line of a material that came in: the D79 conditions unchanged (within the credit
-- limit, no overdue debt, every line fully from warehouse stock), then approve + auto-source + delivery, oldest order first,
-- one after the other so an earlier approval takes its stock before the next order is checked.
-- * Inside the stock transaction only one set-based insert per statement (the (branch, material) pairs that have a waiting
--   portal order); the work happens once, at commit (deferred constraint trigger, as D80 / D83), for at most
--   private.portal_reapprove_cap() = 10 orders per transaction; the others stay waiting for the next stock-in or the office.
-- * Nothing here may fail or undo the stock transaction: every attempt is in its own sub-transaction, failures are swallowed.
-- * The office is told: the order's notification (order.portal_submitted) now reads "Đơn mới từ khách (đã tự duyệt): …"
--   " — đã tự duyệt khi kho có hàng, đang điều phối giao", and a NEW notification order.portal_auto_approved (orders.read,
--   link to the order, once per order) reaches everyone — also those who had already read the first one — and drives the
--   push through the automation rules ("Đơn khách tự duyệt khi kho có hàng → báo văn phòng", PUSH, like the 17/10 starters).
-- * Still not approvable: the body ends " — chờ duyệt (<lý do mới nhất>)", the reason replaced, never appended (also fixes
--   the D79 rewrite, whose pattern no longer matched after one failed attempt).
begin;

-- ===== 1. The approval (D79), with the notification text fixed and a "later" mode for D88 =====
create or replace function private.portal_auto_approve(target_sales_order_id uuid, trace uuid, later boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_orders%rowtype;
  caller text := current_setting('request.jwt.claim.sub', true);
  actor uuid;
  plan jsonb;
  status text := 'WAITING';
  why text;
  sourced jsonb;
  line_count integer;
  total bigint;
begin
  select * into o from public.sales_orders x where x.id = target_sales_order_id;
  if o.id is null or o.commercial_state <> 'DRAFT' or o.order_channel <> 'CUSTOMER_PORTAL' then return jsonb_build_object('status', 'SKIPPED'); end if;
  actor := private.portal_auto_approve_actor(o.branch_id);
  if actor is null then
    why := 'chưa có tài khoản duyệt thay';
  else
    perform set_config('request.jwt.claim.sub', actor::text, true);
    begin
      plan := private.solve_order_sourcing(o.id);
      if jsonb_array_length(plan->'lines') = 0 or exists (select 1 from jsonb_array_elements(plan->'lines') x where x->>'choice' <> 'WAREHOUSE') then
        why := 'kho chưa đủ hàng';
      else
        perform public.confirm_sales_order(o.id, md5(trace::text || ':auto-confirm')::uuid);
        sourced := public.auto_source_sales_order(o.id, md5(trace::text || ':auto-source')::uuid);
        status := 'APPROVED';
      end if;
    exception when others then
      why := case
        when sqlerrm = 'credit_limit_exceeded' then 'vượt hạn mức nợ'
        when sqlerrm = 'overdue_receivable_blocks_credit' then 'khách có nợ quá hạn'
        when sqlerrm = 'credit_limit_not_approved' then 'khách chưa có hạn mức nợ'
        else 'chưa tự duyệt được' end;
    end;
    perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  end if;
  -- The body ends " — chờ duyệt", " — chờ duyệt (<lý do>)" or " — đã tự duyệt…": only that ending is rewritten.
  if status = 'APPROVED' then
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (actor, o.branch_id, 'sales_order.portal_auto_approved', 'sales_order', o.id, trace, array['commercial_state', 'credit_commitment', 'supply_allocations'],
      case when later then 'Tự duyệt lại đơn khách đặt khi kho có hàng: trong hạn mức, đủ hàng trong kho (D88)'
        else 'Tự duyệt đơn khách đặt: trong hạn mức, đủ hàng trong kho (D79)' end);
    update public.notifications n set title = 'Đơn mới từ khách (đã tự duyệt): ' || o.customer_name_snapshot,
      body = regexp_replace(coalesce(n.body, ''), ' — (chờ duyệt|đã tự duyệt)[^—]*$',
        case when later then ' — đã tự duyệt khi kho có hàng, đang điều phối giao' else ' — đã tự duyệt, đang điều phối giao' end)
    where n.branch_id = o.branch_id and n.dedupe_key = 'order.portal_submitted:' || o.id;
    if later then
      select count(*), coalesce(sum(l.line_total_vnd), 0)::bigint into line_count, total from public.sales_order_lines l where l.sales_order_id = o.id;
      perform private.notify(o.branch_id, 'order.portal_auto_approved', 'sales_order', o.id,
        'Đã tự duyệt đơn khách: ' || o.customer_name_snapshot,
        coalesce(o.order_number || ' · ', '') || line_count || ' mặt hàng · ' || replace(to_char(total, 'FM999,999,999,999,990'), ',', '.') || ' ₫ · '
          || coalesce(o.site_name_snapshot, '') || ' — kho đã có hàng, đã tự duyệt, đang điều phối giao',
        '/admin/orders/' || o.id, 'orders.read', null, 'order.portal_auto_approved:' || o.id);
    end if;
  else
    update public.notifications n set body = regexp_replace(coalesce(n.body, ''), ' — chờ duyệt[^—]*$', ' — chờ duyệt (' || why || ')')
    where n.branch_id = o.branch_id and n.dedupe_key = 'order.portal_submitted:' || o.id;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('status', status, 'reason', why, 'deliveries', sourced->'deliveries'));
end $$;
revoke all on function private.portal_auto_approve(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- The D79 call at submit (unchanged signature).
create or replace function private.portal_auto_approve(target_sales_order_id uuid, trace uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.portal_auto_approve(target_sales_order_id, trace, false)
$$;
revoke all on function private.portal_auto_approve(uuid, uuid) from public, anon, authenticated, service_role;

-- ===== 2. Inside the stock transaction: note which (branch, material) got stock and has a waiting portal order =====
create table private.portal_reapprove_stage (
  txid bigint not null,
  branch_id uuid not null,
  material_id uuid not null,
  primary key (txid, branch_id, material_id)
);
create table private.portal_reapprove_flush (txid bigint primary key);
revoke all on private.portal_reapprove_stage, private.portal_reapprove_flush from public, anon, authenticated, service_role;

-- How many waiting orders one transaction tries again at most (the rest wait for the next stock-in or the office).
create or replace function private.portal_reapprove_cap() returns integer language sql immutable set search_path = '' as $$ select 10 $$;
revoke all on function private.portal_reapprove_cap() from public, anon, authenticated, service_role;

create or replace function private.stage_portal_reapprove() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Never fails the stock movement.
  begin
    insert into private.portal_reapprove_stage(txid, branch_id, material_id)
    select distinct txid_current(), a.branch_id, a.material_id from added a
    where a.base_quantity_delta > 0 and a.location_kind = 'WAREHOUSE'
      and exists (select 1 from public.sales_orders o join public.sales_order_lines l on l.sales_order_id = o.id
        where o.branch_id = a.branch_id and o.order_channel = 'CUSTOMER_PORTAL' and o.commercial_state = 'DRAFT' and l.material_id = a.material_id)
    on conflict do nothing;
    if found then
      insert into private.portal_reapprove_flush(txid) values (txid_current()) on conflict do nothing;
    end if;
  exception when others then
    raise warning 'portal_reapprove_stage_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.stage_portal_reapprove() from public, anon, authenticated, service_role;
create trigger inventory_movements_portal_reapprove after insert on public.inventory_movements
  referencing new table as added for each statement execute function private.stage_portal_reapprove();

-- ===== 3. At commit: try the waiting orders again, oldest first, one by one =====
create or replace function private.flush_portal_reapprove(tx bigint) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  tried integer := 0;
begin
  for target in
    select o.id from public.sales_orders o
    where o.order_channel = 'CUSTOMER_PORTAL' and o.commercial_state = 'DRAFT'
      and exists (select 1 from public.sales_order_lines l join private.portal_reapprove_stage s
        on s.txid = tx and s.branch_id = o.branch_id and s.material_id = l.material_id where l.sales_order_id = o.id)
    order by o.created_at, o.id
    limit private.portal_reapprove_cap()
  loop
    tried := tried + 1;
    begin
      perform private.portal_auto_approve(target, md5('d88:' || target || ':' || tx)::uuid, true);
    exception when others then
      raise warning 'portal_reapprove_failed: %', sqlerrm;
    end;
  end loop;
  return tried;
end $$;
revoke all on function private.flush_portal_reapprove(bigint) from public, anon, authenticated, service_role;

create or replace function private.portal_reapprove_flush_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.flush_portal_reapprove(new.txid);
  exception when others then
    raise warning 'portal_reapprove_flush_failed: %', sqlerrm;
  end;
  delete from private.portal_reapprove_stage where txid = new.txid;
  delete from private.portal_reapprove_flush where txid = new.txid;
  return null;
end $$;
revoke all on function private.portal_reapprove_flush_trigger() from public, anon, authenticated, service_role;
create constraint trigger portal_reapprove_at_commit after insert on private.portal_reapprove_flush
  deferrable initially deferred for each row execute function private.portal_reapprove_flush_trigger();

-- ===== 4. The office notification can drive automation rules (push to phones, Telegram…) =====
alter table public.automation_rules drop constraint automation_rules_event_check;
alter table public.automation_rules add constraint automation_rules_event_check check (event in ('order.portal_submitted', 'order.portal_cancelled',
  'order.portal_auto_approved', 'customer.self_registered', 'purchase.draft_ready', 'sales_order.needs_purchase', 'sales_order.short_source',
  'sales_order.needs_delivery', 'delivery.waiting_dispatch', 'delivery.dispatch_suggested', 'delivery.result_submitted', 'delivery.claimed',
  'work.assigned', 'work.declined', 'finance.overdue_digest', 'inventory.low_stock_digest', 'purchase.unsent_digest'));

insert into public.automation_rules(branch_id, name, event, problems_only, channel)
select b.id, 'Đơn khách tự duyệt khi kho có hàng → báo văn phòng', 'order.portal_auto_approved', false, 'PUSH'
from public.branches b
where b.active
  and not exists (select 1 from public.automation_rules r where r.branch_id = b.id and r.event = 'order.portal_auto_approved' and r.channel = 'PUSH');

notify pgrst, 'reload schema';
commit;
