-- D80 (Owner 15/11/2026: "xử lý thêm push notify cho tài khoản thợ"): a worker's phone is told, without any automation rule,
-- 1. when a job is given to him ("Việc mới: …", the existing work.assigned notification), and
-- 2. when a delivery he may take is waiting in "Nhận việc" (D79): one notification per worker who can take it, kind
--    delivery.pool_open, link /work/pool. It is decided at the END of the transaction (deferred constraint trigger), so a
--    delivery that is created and given to someone (or to "Khách tự lấy") in the same transaction — the daily sales-ledger
--    import, a portal order the office assigns at once — never calls anyone.
-- The push goes to every device the worker switched on ("Báo việc mới về điện thoại"), through the existing outbound queue.
-- An active PUSH rule for the same event (Cài đặt → Quy tắc tự động) takes over, so nobody gets the same push twice.

begin;

-- 1. The built-in worker push, next to the rule-based one.
create or replace function private.fire_automation() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  rule public.automation_rules%rowtype;
  sub public.push_subscriptions%rowtype;
  payload jsonb;
  amount bigint;
begin
  payload := jsonb_strip_nulls(jsonb_build_object('kind', new.kind, 'title', new.title, 'body', new.body, 'link', new.link,
    'entity_type', new.entity_type, 'entity_id', new.entity_id, 'notification_id', new.id, 'created_at', new.created_at));
  for rule in select * from public.automation_rules r where r.branch_id = new.branch_id and r.active and r.event = new.kind order by r.id loop
    if rule.min_amount_vnd is not null then
      amount := private.automation_amount(new.entity_type, new.entity_id);
      if coalesce(amount, 0) < rule.min_amount_vnd then continue; end if;
    end if;
    if rule.problems_only and not (new.kind = 'delivery.result_submitted'
      and exists (select 1 from public.deliveries d where d.id = new.entity_id and d.result_kind in ('PARTIAL', 'FAILED'))) then continue; end if;
    if rule.channel = 'PUSH' then
      for sub in select s.* from public.push_subscriptions s
        where private.login_has_permission(s.auth_user_id, new.branch_id, new.required_permission)
          and (new.recipient_employee_id is null or exists (select 1 from public.employees e where e.id = new.recipient_employee_id and e.auth_user_id = s.auth_user_id))
        order by s.id
      loop
        perform private.enqueue_outbound_job(new.branch_id, rule.id, new.id, 'PUSH', sub.id::text, payload, 'rule:' || rule.id || ':' || new.id || ':' || sub.id);
      end loop;
    else
      perform private.enqueue_outbound_job(new.branch_id, rule.id, new.id, rule.channel, rule.target, payload, 'rule:' || rule.id || ':' || new.id);
    end if;
  end loop;
  -- D80: the worker's own jobs reach his phone without a rule (unless a PUSH rule for the event already sends them).
  if new.recipient_employee_id is not null and new.kind in ('work.assigned', 'delivery.pool_open')
    and not exists (select 1 from public.automation_rules r where r.branch_id = new.branch_id and r.active and r.event = new.kind and r.channel = 'PUSH') then
    for sub in select s.* from public.push_subscriptions s join public.employees e on e.auth_user_id = s.auth_user_id
      where e.id = new.recipient_employee_id and e.active order by s.id
    loop
      perform private.enqueue_outbound_job(new.branch_id, null, new.id, 'PUSH', sub.id::text, payload, 'worker:' || new.id || ':' || sub.id);
    end loop;
  end if;
  return null;
end
$function$;
revoke all on function private.fire_automation() from public, anon, authenticated, service_role;

-- 2. "Phiếu giao chờ người nhận": one notification for each worker who could take the delivery now (same rules as the pool).
create or replace function private.notify_delivery_pool(target_delivery_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  d public.deliveries%rowtype;
  worker record;
  goods text;
  sent integer := 0;
begin
  select * into d from public.deliveries x where x.id = target_delivery_id;
  if d.id is null or not private.delivery_pool_open(d.id) then return 0; end if;
  select string_agg(sl.material_name_snapshot || ' ' || trim_scale(round(l.planned_base_quantity * sl.conversion_denominator / sl.conversion_numerator, 6))::text
      || ' ' || coalesce(su.symbol, u.symbol), ', ' order by sl.line_number, l.id)
  into goods from public.delivery_lines l join public.sales_order_lines sl on sl.id = l.sales_order_line_id
    join public.units_of_measure u on u.id = l.base_uom_id left join public.units_of_measure su on su.id = sl.ordered_uom_id
  where l.delivery_id = d.id;
  for worker in select distinct e.id from public.employees e
      join public.employee_branch_access a on a.employee_id = e.id and a.active and a.branch_id = d.branch_id
    where e.active and e.auth_user_id is not null order by e.id
  loop
    continue when not exists (select 1 from private.worker_pool_deliveries(worker.id) x where x = d.id);
    continue when jsonb_array_length(private.delivery_pool_options(d.id, worker.id)->'vehicles') = 0;
    perform private.notify(d.branch_id, 'delivery.pool_open', 'delivery', d.id,
      'Phiếu giao chờ người nhận: ' || coalesce(d.site_name_snapshot, d.customer_name_snapshot, d.delivery_number),
      concat_ws(' · ', d.delivery_number, left(goods, 300), nullif(d.delivery_address_snapshot, '')),
      '/work/pool', 'work.claim', worker.id, 'delivery.pool_open:' || d.id || ':' || worker.id || ':' || d.version);
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke all on function private.notify_delivery_pool(uuid) from public, anon, authenticated, service_role;

create or replace function private.delivery_pool_notify_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- deliveries rows carry the delivery as id, dispatch proposals as delivery_id.
  -- A notification must never undo the dispatch it reports on.
  begin
    perform private.notify_delivery_pool(coalesce(to_jsonb(new)->>'delivery_id', to_jsonb(new)->>'id')::uuid);
  exception when others then
    raise warning 'delivery_pool_notify_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.delivery_pool_notify_trigger() from public, anon, authenticated, service_role;

-- A dispatch suggestion (SUGGEST mode) puts a delivery in the pool; a worker declining puts it back (PLANNED again).
-- Both checked at commit, when the delivery may already have been given to someone.
create constraint trigger delivery_dispatch_proposals_pool_notify
  after insert or update on public.delivery_dispatch_proposals
  deferrable initially deferred
  for each row execute function private.delivery_pool_notify_trigger();
create constraint trigger deliveries_pool_notify
  after update of execution_state on public.deliveries
  deferrable initially deferred
  for each row when (new.execution_state = 'PLANNED' and old.execution_state is distinct from 'PLANNED')
  execute function private.delivery_pool_notify_trigger();

notify pgrst, 'reload schema';
commit;
