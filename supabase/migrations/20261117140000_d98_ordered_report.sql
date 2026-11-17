-- D98 (Owner 17/11/2026): "Báo cáo hàng đã đặt" on the customer portal + a morning summary push.
-- A customer who orders by Zalo / phone sees one order per sales-ledger line, so at the end of the day he cannot tell what he
-- ordered. This gives him one report per period (the day by default): goods grouped by material + ordered unit, what was delivered
-- (VERIFIED deliveries only), the orders behind each line, a per-day list and the customer's service jobs; money only for the
-- "Chủ tài khoản" / "Kế toán" (same rule as private.customer_order_extras), never for "Người nhận hàng" (RECEIVER).
-- * private.customer_ordered_report: the one reader (no membership check; callers decide the role and whether money is shown).
-- * public.customer_portal_ordered_report(customer, from, to): checks the portal membership like public.customer_portal_order.
-- * private.customer_daily_order_summary: 08:46 push (pg_cron) about yesterday's orders, one per customer and day; orders imported
--   from the sales ledger ARE counted (Owner exception to the D93 rule that skips them for the per-order pushes).
-- * 'customer.daily_summary' joins the built-in pushes the Owner can switch off (notification_builtin_settings).
-- * public.customer_portal_snapshot: orders newest first (by creation time) instead of by uuid; the rest is unchanged
--   (latest body 20261117110000).
-- The day of an order is private.business_today(created_at), the Vietnam calendar day (D96).
begin;

-- ===== 1. Number text as the app shows it: 1.000 / 1.000,5 =====
create or replace function private.vn_number_text(amount numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(to_char(trunc(abs(trim_scale(amount))), 'FM999,999,999,999,990'), ',', '.')
    || coalesce(',' || nullif(split_part(trim_scale(abs(amount))::text, '.', 2), ''), '')
$$;
revoke all on function private.vn_number_text(numeric) from public, anon, authenticated, service_role;

-- ===== 2. The report =====
create or replace function private.customer_ordered_report(target_customer_id uuid, from_day date, to_day date, show_money boolean, member_role text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  from_ts timestamptz := from_day::timestamp at time zone 'Asia/Ho_Chi_Minh';
  to_ts timestamptz := (to_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  result jsonb;
begin
  with ord as (
    select o.id, o.order_number, o.commercial_state, o.created_at, private.business_today(o.created_at) as day
    from public.sales_orders o
    where o.customer_id = target_customer_id and o.created_at >= from_ts and o.created_at < to_ts
  ),
  live as (select * from ord where commercial_state <> 'CANCELLED'),
  lines as (
    select l.id as line_id, l.material_id, l.ordered_uom_id, u.symbol, l.material_name_snapshot as name, l.quantity, l.line_total_vnd,
      live.id as order_id, live.order_number, live.day, live.created_at, live.commercial_state as state,
      -- delivered in the ordered unit: accepted base quantity of VERIFIED deliveries, converted back with the line's conversion
      round(coalesce((select sum(v.accepted_base_quantity) from public.delivery_verification_lines v
          join public.delivery_lines dl on dl.id = v.delivery_line_id
          join public.deliveries d on d.id = dl.delivery_id and d.execution_state = 'VERIFIED'
          where dl.sales_order_line_id = l.id), 0) * l.conversion_denominator / l.conversion_numerator, 6) as delivered
    from live
    join public.sales_order_lines l on l.sales_order_id = live.id
    join public.units_of_measure u on u.id = l.ordered_uom_id
  ),
  goods as (
    select g.*, greatest(g.ordered - g.delivered, 0) as remaining,
      (select jsonb_agg(jsonb_build_object('order_id', x.order_id, 'order_number', x.order_number, 'day', x.day,
          'quantity', trim_scale(x.qty)::text, 'state', x.state) order by x.created_at desc, x.order_id desc)
        from (select l2.order_id, l2.order_number, l2.day, l2.created_at, l2.state, sum(l2.quantity) as qty
          from lines l2 where l2.material_id = g.material_id and l2.ordered_uom_id = g.uom_id
          group by l2.order_id, l2.order_number, l2.day, l2.created_at, l2.state) x) as orders
    from (select l.material_id, l.ordered_uom_id as uom_id, (array_agg(l.name order by l.created_at desc, l.order_id desc))[1] as name,
        max(l.symbol) as symbol, sum(l.quantity) as ordered, sum(l.delivered) as delivered, sum(l.line_total_vnd)::bigint as amount
      from lines l group by l.material_id, l.ordered_uom_id) g
  ),
  days as (
    select d.day, count(*)::integer as order_count,
      coalesce((select sum(l.line_total_vnd) from lines l where l.day = d.day), 0)::bigint as amount
    from live d group by d.day
  ),
  services as (
    select j.id, j.service_type, j.unit_label, j.execution_state, j.created_at, private.business_today(j.created_at) as day,
      coalesce(v.billable_quantity, j.planned_quantity) as qty, coalesce(v.billable_amount_vnd, 0)::bigint as amount
    from public.service_jobs j left join public.service_verifications v on v.service_job_id = j.id
    where j.customer_id = target_customer_id and j.created_at >= from_ts and j.created_at < to_ts and j.execution_state <> 'CANCELLED'
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'from', from_day, 'to', to_day, 'generated_at', now(), 'role', member_role, 'show_money', show_money,
    'order_count', (select count(*) from live),
    'cancelled_count', (select count(*) from ord where commercial_state = 'CANCELLED'),
    'material_kinds', (select count(distinct material_id) from goods),
    'delivered_kinds', (select count(*) from (select material_id from goods group by material_id having bool_and(delivered >= ordered)) k),
    'total_vnd', case when show_money then (select coalesce(sum(amount), 0) from goods)::text end,
    'goods', coalesce((select jsonb_agg(jsonb_build_object('material_id', g.material_id, 'name', g.name, 'uom_symbol', g.symbol,
        'ordered_qty', trim_scale(g.ordered)::text, 'delivered_qty', trim_scale(g.delivered)::text, 'remaining_qty', trim_scale(g.remaining)::text,
        'amount_vnd', case when show_money then g.amount::text end, 'orders', g.orders) order by g.name, g.symbol, g.material_id) from goods g), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'order_count', d.order_count,
        'amount_vnd', case when show_money then d.amount::text end) order by d.day desc) from days d), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('service_job_id', s.id, 'name', s.service_type, 'unit_label', s.unit_label,
        'quantity', trim_scale(s.qty)::text, 'day', s.day, 'state', s.execution_state,
        'amount_vnd', case when show_money then s.amount::text end) order by s.created_at desc, s.id desc) from services s), '[]'::jsonb)
  )) into result;
  return result;
end
$function$;
revoke all on function private.customer_ordered_report(uuid, date, date, boolean, text) from public, anon, authenticated, service_role;

create or replace function public.customer_portal_ordered_report(target_customer_id uuid, from_day date, to_day date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  member_role text;
begin
  if target_customer_id is null or from_day is null or to_day is null or from_day > to_day or to_day - from_day + 1 > 92 then
    raise exception 'invalid_report_period' using errcode = '22023';
  end if;
  member_role := private.portal_customer_role(target_customer_id);
  if member_role is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.customer_ordered_report(target_customer_id, from_day, to_day, member_role in ('OWNER', 'FINANCE_CONTACT'), member_role);
end
$function$;
revoke all on function public.customer_portal_ordered_report(uuid, date, date) from public, anon;
grant execute on function public.customer_portal_ordered_report(uuid, date, date) to authenticated;

-- ===== 3. The morning summary (08:46, about the day before) =====
-- One push per customer with a non-cancelled order that day. Devices of "Chủ tài khoản" / "Kế toán" get the total, devices of
-- "Người nhận hàng" do not: the money version goes first (money = true reaches only the money roles); the plain version then
-- reaches everyone else because a device already pushed has the same dedupe key (customer:key:ref:device) and is skipped.
create or replace function private.customer_daily_order_summary(at_day date default private.business_today() - 1) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  row record;
  report jsonb;
  goods jsonb;
  shown text;
  more integer;
  title text := 'Hàng anh/chị đặt ngày ' || to_char(at_day, 'DD/MM');
  link text := '/customer/reports/ordered?from=' || at_day || '&to=' || at_day;
  ref text;
  sent integer;
  made integer := 0;
begin
  for row in
    select distinct o.customer_id
    from public.sales_orders o join public.customers c on c.id = o.customer_id and c.active
    where o.commercial_state <> 'CANCELLED' and private.business_today(o.created_at) = at_day
    order by o.customer_id
  loop
    report := private.customer_ordered_report(row.customer_id, at_day, at_day, true, null);
    goods := report->'goods';
    continue when jsonb_array_length(goods) = 0;
    select string_agg(g->>'name' || ' ' || private.vn_number_text((g->>'ordered_qty')::numeric) || ' ' || (g->>'uom_symbol'), ' · ' order by n)
    into shown from jsonb_array_elements(goods) with ordinality as t(g, n) where n <= 3;
    more := jsonb_array_length(goods) - 3;
    shown := shown || case when more > 0 then ' · và ' || more || ' món khác' else '' end;
    ref := row.customer_id || ':' || at_day;
    sent := private.customer_push(row.customer_id, 'customer.daily_summary', title,
      shown || ' · Tổng ' || private.vnd_text((report->>'total_vnd')::bigint),
      link, true, ref);
    sent := sent + private.customer_push(row.customer_id, 'customer.daily_summary', title, shown, link, false, ref);
    if sent > 0 then made := made + 1; end if;
  end loop;
  return made;
end $$;
revoke all on function private.customer_daily_order_summary(date) from public, anon, authenticated, service_role;

-- ===== 4. Built-in push 'customer.daily_summary' can be switched off in Cài đặt → Quy tắc tự động =====
alter table public.notification_builtin_settings drop constraint notification_builtin_settings_builtin_key_check;
alter table public.notification_builtin_settings add constraint notification_builtin_settings_builtin_key_check
  check (builtin_key in ('work.assigned', 'delivery.pool_open', 'field_dispatch', 'announcement.customer_price',
    'announcement.office_price', 'announcement.pay_rate', 'announcement.manual', 'customer.order_confirmed', 'customer.delivery_dispatched',
    'customer.delivery_done', 'customer.delivery_problem', 'customer.payment_received', 'customer.debt_reminder', 'customer.order_cancelled',
    'customer.daily_summary'));

-- ===== 5. Schedule: 01:46 UTC = 08:46 Vietnam (after the 07:00 ledger import, 15 minutes after the 08:31 debt reminders) =====
do $schedule$
declare
  job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for job_id in select j.jobid from cron.job j where j.jobname = 'hx-customer-ordered-summary' loop
      perform cron.unschedule(job_id);
    end loop;
    perform cron.schedule('hx-customer-ordered-summary', '46 1 * * *', 'select private.customer_daily_order_summary()');
  end if;
end
$schedule$;

-- ===== 6. Portal snapshot: orders newest first (body of 20261117110000, only the order of the orders changed) =====
CREATE OR REPLACE FUNCTION public.customer_portal_snapshot(target_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_customer_id uuid;
  member_role text;
  customer_json jsonb;
  quote_json jsonb;
  orders_json jsonb;
  debt_json jsonb;
  notices_json jsonb;
begin
  select m.customer_id, m.membership_role::text
  into selected_customer_id, member_role
  from public.customer_portal_memberships m
  where m.auth_user_id = (select auth.uid())
    and m.active
    and (target_customer_id is null or m.customer_id = target_customer_id)
  order by m.customer_id
  limit 1;
  if selected_customer_id is null then raise exception 'active_customer_membership_required' using errcode = '42501'; end if;

  select jsonb_build_object('id', c.id, 'code', c.code, 'display_name', c.display_name)
  into customer_json from public.customers c where c.id = selected_customer_id;

  if member_role in ('OWNER','FINANCE_CONTACT') then
    select jsonb_strip_nulls(jsonb_build_object(
      'id', item->>'id',
      'number', coalesce(item->>'quotation_number', item->>'number'),
      'state', coalesce(item->>'quotation_state', item->>'status'),
      'current_revision_id', item->>'current_revision_id',
      'valid_until', item->>'valid_until'
    )) into quote_json
    from (
      select to_jsonb(q) item
      from public.quotations q
      where to_jsonb(q)->>'customer_id' = selected_customer_id::text
      order by to_jsonb(q)->>'created_at' desc nulls last, q.id desc
      limit 1
    ) quote_row;
  end if;

  select coalesce(jsonb_agg(private.customer_order_payload(o.id) order by o.created_at desc, o.id desc), '[]'::jsonb)
  into orders_json
  from public.sales_orders o
  where to_jsonb(o)->>'customer_id' = selected_customer_id::text;

  if member_role in ('OWNER','FINANCE_CONTACT') then
    select jsonb_build_object(
      'outstanding_amount_vnd', coalesce(sum((item->>'outstanding_amount_vnd')::bigint), 0)::text,
      'overdue_amount_vnd', coalesce(sum((item->>'outstanding_amount_vnd')::bigint) filter (
        where nullif(item->>'due_date', '') is not null and (item->>'due_date')::date < private.business_today()
      ), 0)::text,
      'items', coalesce(
        jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'id', item->>'id',
            'source_type', item->>'source_type',
            'source_number', coalesce(item->>'source_number', item->>'reference_number'),
            'original_amount_vnd', item->>'original_amount_vnd',
            'outstanding_amount_vnd', item->>'outstanding_amount_vnd',
            'due_date', item->>'due_date'
          ))
          order by item->>'due_date' nulls first
        ),
        '[]'::jsonb
      )
    ) into debt_json
    from (
      select to_jsonb(r) item
      from public.receivable_read r
      where to_jsonb(r)->>'customer_id' = selected_customer_id::text
        and coalesce((to_jsonb(r)->>'outstanding_amount_vnd')::bigint, 0) > 0
    ) debt_rows;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'amount_vnd', n.declared_amount_vnd::text,
      'paid_on', n.paid_on,
      'reference', n.payment_reference,
      'state', n.review_state,
      'version', n.version,
      'submitted_at', n.submitted_at,
      'evidence_id', n.evidence_id,
      'review_note', n.review_note
    ) order by n.submitted_at desc), '[]'::jsonb)
    into notices_json
    from public.payment_notices n
    where n.customer_id = selected_customer_id;
  else
    debt_json := null;
    notices_json := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'customer', customer_json,
    'membership_role', member_role,
    'can_view_debt', member_role in ('OWNER','FINANCE_CONTACT'),
    'quotation', quote_json,
    'orders', orders_json,
    'debt', debt_json,
    'payment_notices', notices_json
  );
end $function$
;

notify pgrst, 'reload schema';
commit;
