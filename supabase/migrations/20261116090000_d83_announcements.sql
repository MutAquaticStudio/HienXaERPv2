-- D83 (Owner 16/11/2026) "Thông báo cập nhật": a popup on the home page of each portal, shown once per account (seen on the
-- server, so a phone and a computer agree), and the same announcement as a web push to every device each recipient switched on.
-- 1. Sales prices: EVERY save of a sales price (giá chung, a price group's list, a customer's own price; saved, replaced or
--    stopped) announces, at the end of the same transaction, to each customer whose own effective price of an item changed
--    (customer → group → common, as the price resolver chooses), only that customer's lines, to its "Chủ tài khoản" and
--    "Kế toán" (never "Người nhận hàng"); and, when the common price changed, to the office staff who read sales prices.
--    Saving again before anyone of them saw it folds the change into the unseen announcement instead of stacking another.
-- 2. Worker pay rates (D76 transport and service rates, D70 trip pay per vehicle): announced to the workers of the branch.
-- 3. The owner (roles.manage) composes other announcements for customers, workers or office staff ("Soạn thông báo").
-- An unseen announcement stops showing after 30 days. Pushes go through the existing outbound queue (as D80).
-- A failure to announce never undoes the save it reports on.

begin;

-- ===== tables =====
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  -- The customer announcements of one price save share it (the owner's list shows them as one row); otherwise its own id.
  group_id uuid not null,
  audience text not null check (audience in ('CUSTOMER', 'WORKER', 'OFFICE')),
  kind text not null check (kind in ('PRICE', 'PAY_RATE', 'MANUAL')),
  -- What the owner calls a composed announcement: "Tin từ cửa hàng", "Tính năng mới", "Quy định mới".
  label text check (label in ('NEWS', 'FEATURE', 'RULE')),
  -- A customer's price announcement: whose prices (one announcement per customer, so nobody sees another customer's price).
  customer_id uuid references public.customers(id) on delete cascade,
  -- A composed office announcement for some roles only (null: every office employee of the branch).
  target_role_ids uuid[],
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text check (char_length(body) <= 1000),
  link text check (link is null or link ~ '^/(customer|work|admin)(/[a-z0-9_-]+)*$'),
  effective_at timestamptz,
  -- The price rules whose save made or updated it ("Đã báo N khách có giá thay đổi" after saving).
  price_rule_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id) on delete set null,
  operation_id uuid unique,
  check ((kind = 'PRICE') = (effective_at is not null)),
  check ((kind = 'MANUAL') = (label is not null)),
  check (kind <> 'PAY_RATE' or audience = 'WORKER'),
  check (kind <> 'PRICE' or audience in ('CUSTOMER', 'OFFICE')),
  check ((audience = 'CUSTOMER' and kind = 'PRICE') = (customer_id is not null)),
  check (target_role_ids is null or (audience = 'OFFICE' and kind = 'MANUAL')),
  check (expires_at > created_at)
);
create index announcements_open_idx on public.announcements(audience, expires_at) where withdrawn_at is null;
create index announcements_branch_idx on public.announcements(branch_id, created_at desc);
create index announcements_customer_idx on public.announcements(customer_id) where customer_id is not null;
create index announcements_group_idx on public.announcements(group_id);

create table public.announcement_lines (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  -- price:<material>:<unit>, transport:<material>:<unit>, service:<service type>, trip:<payroll component>
  item_key text not null check (char_length(item_key) between 3 and 120),
  item_code text check (char_length(item_code) <= 60),
  item_name text not null check (char_length(item_name) between 1 and 200),
  unit_name text check (char_length(unit_name) <= 60),
  -- A rate is an amount (VND) or a share of what the customer is billed (BPS); null = none before / stopped.
  old_value bigint check (old_value is null or old_value >= 0),
  old_kind text check (old_kind in ('VND', 'BPS')),
  new_value bigint check (new_value is null or new_value >= 0),
  new_kind text check (new_kind in ('VND', 'BPS')),
  primary key (announcement_id, item_key),
  check ((old_value is null) = (old_kind is null) and (new_value is null) = (new_kind is null)),
  check ((old_value, old_kind) is distinct from (new_value, new_kind))
);

create table public.announcement_seen (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (announcement_id, auth_user_id)
);
create index announcement_seen_user_idx on public.announcement_seen(auth_user_id);

-- Work tables of one transaction: what a price / rate was before its first change, read at commit.
create table private.announcement_price_stage (
  txid bigint not null,
  branch_id uuid not null,
  customer_id uuid,           -- null: the common price (for the office)
  material_id uuid not null,
  uom_id uuid not null,
  at timestamptz not null,    -- when the change takes effect
  old_price bigint
);
create unique index announcement_price_stage_key on private.announcement_price_stage(txid, coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid), material_id, uom_id);
create table private.announcement_rule_stage (txid bigint not null, rule_id uuid not null, primary key (txid, rule_id));
create table private.announcement_pay_stage (
  txid bigint not null,
  branch_id uuid not null,
  item_key text not null,
  item_code text,
  item_name text not null,
  unit_name text,
  old_value bigint,
  old_kind text,
  new_value bigint,
  new_kind text,
  primary key (txid, branch_id, item_key)
);
-- One row per transaction that changed something to announce; `actor` is who made the change (the author, never told).
create table private.announcement_flush (txid bigint primary key, actor uuid);
revoke all on private.announcement_price_stage, private.announcement_rule_stage, private.announcement_pay_stage, private.announcement_flush
  from public, anon, authenticated, service_role;

-- ===== who receives an announcement =====
-- One rule for the popup, the history, the push and the table's row security. The author never receives their own.
create or replace function private.announcement_for(viewer uuid, a_branch uuid, a_audience text, a_kind text, a_customer uuid,
  a_roles uuid[], a_created_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select viewer is not null and viewer is distinct from a_created_by and private.auth_identity_active(viewer)
    and case a_audience
      when 'CUSTOMER' then exists (select 1 from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id and c.active
        where m.auth_user_id = viewer and m.active and c.branch_id = a_branch and (a_customer is null or m.customer_id = a_customer)
          and (a_kind <> 'PRICE' or m.membership_role in ('OWNER', 'FINANCE_CONTACT')))
      when 'WORKER' then private.login_has_permission(viewer, a_branch, 'work.read')
      when 'OFFICE' then case when a_kind = 'PRICE' then private.login_has_permission(viewer, a_branch, 'pricing.read')
        else exists (select 1 from public.employees e
          join public.employee_branch_access acc on acc.employee_id = e.id and acc.active and acc.branch_id = a_branch
          join public.branches b on b.id = acc.branch_id and b.active
          join public.roles r on r.id = acc.role_id and r.active
          where e.auth_user_id = viewer and e.active and (a_roles is null or acc.role_id = any(a_roles))
            -- office staff: some permission beyond the worker portal's own
            and (exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_code not in ('work.read', 'work.claim'))
              or exists (select 1 from public.employee_permission_grants g where g.employee_id = e.id and g.branch_id = acc.branch_id
                and g.permission_code not in ('work.read', 'work.claim')))) end
      else false end
$$;
revoke all on function private.announcement_for(uuid, uuid, text, text, uuid, uuid[], uuid) from public, anon, authenticated, service_role;
grant execute on function private.announcement_for(uuid, uuid, text, text, uuid, uuid[], uuid) to authenticated;

create or replace function private.announcement_audience(a_branch uuid, a_audience text, a_kind text, a_customer uuid, a_roles uuid[], a_created_by uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select u.id from (
    select m.auth_user_id id from public.customer_portal_memberships m join public.customers c on c.id = m.customer_id
      where a_audience = 'CUSTOMER' and m.active and c.branch_id = a_branch and (a_customer is null or m.customer_id = a_customer)
    union
    select e.auth_user_id from public.employees e join public.employee_branch_access acc on acc.employee_id = e.id and acc.active
      where a_audience <> 'CUSTOMER' and acc.branch_id = a_branch and e.active and e.auth_user_id is not null
  ) u
  where private.announcement_for(u.id, a_branch, a_audience, a_kind, a_customer, a_roles, a_created_by)
$$;
revoke all on function private.announcement_audience(uuid, text, text, uuid, uuid[], uuid) from public, anon, authenticated, service_role;

create or replace function private.announcement_recipients(target_announcement_id uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select r from public.announcements a
  cross join lateral private.announcement_audience(a.branch_id, a.audience, a.kind, a.customer_id, a.target_role_ids, a.created_by) r
  where a.id = target_announcement_id
$$;
revoke all on function private.announcement_recipients(uuid) from public, anon, authenticated, service_role;

-- ===== row security: recipients read their own (not withdrawn), the owner reads the branch's =====
alter table public.announcements enable row level security;
alter table public.announcement_lines enable row level security;
alter table public.announcement_seen enable row level security;
revoke all on public.announcements, public.announcement_lines, public.announcement_seen from anon, public, authenticated;
grant select on public.announcements, public.announcement_lines, public.announcement_seen to authenticated;
create policy announcements_select on public.announcements for select to authenticated using (
  (select private.has_permission(branch_id, 'roles.manage'))
  or (withdrawn_at is null and private.announcement_for((select auth.uid()), branch_id, audience, kind, customer_id, target_role_ids, created_by)));
create policy announcement_lines_select on public.announcement_lines for select to authenticated using (
  exists (select 1 from public.announcements a where a.id = announcement_lines.announcement_id));
create policy announcement_seen_select on public.announcement_seen for select to authenticated using (auth_user_id = (select auth.uid()));

-- ===== prices: the resolver's priority at a given time, for many customers at once =====
-- Same choice as private.preferred_commercial_price_rule (SPEC-PRI-001: customer + material → customer + material group →
-- customer tier → default; then the highest version), at `at_time` instead of now(), so a price saved for a later day is
-- compared on that day. Two rules of the same priority and version: no price (the resolver refuses it too).
create or replace function private.announcement_prices(b uuid, m uuid, u uuid, at_time timestamptz, customer_ids uuid[])
returns table(customer_id uuid, unit_price_vnd bigint)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select cu.id cid, p.unit_price_vnd price,
      rank() over (partition by cu.id order by case p.scope_type when 'CUSTOMER_MATERIAL' then 4 when 'CUSTOMER_GROUP' then 3
        when 'CUSTOMER_TIER' then 2 else 1 end desc, p.version desc) rnk
    from public.customers cu
    join public.materials mat on mat.id = m and mat.active and mat.sale_enabled
    join public.pricing_rules p on p.branch_id = b and p.price_uom_id = u and p.active
      and p.effective_from <= at_time and (p.effective_to is null or p.effective_to > at_time)
      and ((p.scope_type = 'CUSTOMER_MATERIAL' and p.customer_id = cu.id and p.material_id = m)
        or (p.scope_type = 'CUSTOMER_GROUP' and p.customer_id = cu.id and p.material_group_id = mat.group_id)
        or (p.scope_type = 'CUSTOMER_TIER' and p.customer_tier_code = cu.tier_code and p.material_id = m)
        or (p.scope_type = 'DEFAULT' and p.material_id = m))
    where cu.id = any(customer_ids) and cu.branch_id = b and cu.active
  )
  select r.cid, case when count(*) = 1 then min(r.price) end from ranked r where r.rnk = 1 group by r.cid
$$;
revoke all on function private.announcement_prices(uuid, uuid, uuid, timestamptz, uuid[]) from public, anon, authenticated, service_role;

-- The common price ("giá chung") of an item at a time.
create or replace function private.announcement_default_price(b uuid, m uuid, u uuid, at_time timestamptz) returns bigint
language sql stable security definer set search_path = '' as $$
  select (array_agg(p.unit_price_vnd order by p.version desc))[1]
  from public.pricing_rules p join public.materials mat on mat.id = p.material_id and mat.active and mat.sale_enabled
  where p.branch_id = b and p.scope_type = 'DEFAULT' and p.material_id = m and p.price_uom_id = u and p.active
    and p.effective_from <= at_time and (p.effective_to is null or p.effective_to > at_time)
$$;
revoke all on function private.announcement_default_price(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-- Customers a change of this rule can concern: those with a portal owner or accountant (who receive price announcements).
create or replace function private.announcement_price_customers(b uuid, scope text, c uuid, tier text) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m.customer_id), '{}') from public.customer_portal_memberships m
  join public.customers cu on cu.id = m.customer_id and cu.active
  where cu.branch_id = b and m.active and m.membership_role in ('OWNER', 'FINANCE_CONTACT')
    and (c is null or m.customer_id = c) and (scope <> 'CUSTOMER_TIER' or cu.tier_code = tier)
$$;
revoke all on function private.announcement_price_customers(uuid, text, uuid, text) from public, anon, authenticated, service_role;

-- Before a rule's first change in the transaction touches a (customer, item, unit), keep that customer's price then.
create or replace function private.stage_price_change(r public.pricing_rules, at_time timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare tx bigint := txid_current(); cids uuid[];
begin
  cids := private.announcement_price_customers(r.branch_id, r.scope_type, r.customer_id, r.customer_tier_code);
  if cardinality(cids) > 0 then
    -- Customers without a price yet are kept too (old price null), so a later change in the same transaction is not taken as "before".
    insert into private.announcement_price_stage(txid, branch_id, customer_id, material_id, uom_id, at, old_price)
    with mats as materialized (
      select x.id from public.materials x
      where (r.material_id is not null and x.id = r.material_id) or (r.material_id is null and x.group_id = r.material_group_id and x.active and x.sale_enabled)
    ), prices as materialized (
      select mats.id material_id, p.customer_id, p.unit_price_vnd
      from mats cross join lateral private.announcement_prices(r.branch_id, mats.id, r.price_uom_id, at_time, cids) p
    )
    select tx, r.branch_id, cid, mats.id, r.price_uom_id, at_time, prices.unit_price_vnd
    from mats cross join unnest(cids) cid left join prices on prices.material_id = mats.id and prices.customer_id = cid
    on conflict do nothing;
  end if;
  if r.scope_type = 'DEFAULT' then
    insert into private.announcement_price_stage(txid, branch_id, customer_id, material_id, uom_id, at, old_price)
    values (tx, r.branch_id, null, r.material_id, r.price_uom_id, at_time, private.announcement_default_price(r.branch_id, r.material_id, r.price_uom_id, at_time))
    on conflict do nothing;
  end if;
  insert into private.announcement_flush(txid, actor) values (tx, auth.uid()) on conflict do nothing;
end $$;
revoke all on function private.stage_price_change(public.pricing_rules, timestamptz) from public, anon, authenticated, service_role;

create or replace function private.announce_price_rule_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.unit_price_vnd = old.unit_price_vnd and new.active = old.active and new.effective_from = old.effective_from
    and new.effective_to is not distinct from old.effective_to then return new; end if;
  -- A replaced rule ends when its successor starts; a new rule from its first day; a stopped rule now.
  perform private.stage_price_change(new, greatest(now(), case when tg_op = 'UPDATE' and new.effective_to is distinct from old.effective_to
    and new.effective_to is not null then new.effective_to else new.effective_from end));
  if tg_op = 'INSERT' then
    insert into private.announcement_rule_stage(txid, rule_id) values (txid_current(), new.id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function private.announce_price_rule_change() from public, anon, authenticated, service_role;
create trigger pricing_rules_announce before insert or update on public.pricing_rules
  for each row execute function private.announce_price_rule_change();

-- ===== worker pay rates =====
create or replace function private.stage_pay_change(b uuid, key text, code text, name text, unit text, kind_old text, value_old bigint,
  kind_new text, value_new bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare tx bigint := txid_current();
begin
  insert into private.announcement_pay_stage(txid, branch_id, item_key, item_code, item_name, unit_name, old_value, old_kind, new_value, new_kind)
  values (tx, b, key, code, left(coalesce(name, '—'), 200), left(unit, 60), value_old, case when value_old is null then null else kind_old end,
    value_new, case when value_new is null then null else kind_new end)
  on conflict (txid, branch_id, item_key) do update set new_value = excluded.new_value, new_kind = excluded.new_kind,
    item_name = excluded.item_name, unit_name = excluded.unit_name;
  insert into private.announcement_flush(txid, actor) values (tx, auth.uid()) on conflict do nothing;
end $$;
revoke all on function private.stage_pay_change(uuid, text, text, text, text, text, bigint, text, bigint) from public, anon, authenticated, service_role;

create or replace function private.announce_transport_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before_v bigint; after_v bigint;
begin
  before_v := case when tg_op = 'UPDATE' and old.active then old.rate_vnd end;
  after_v := case when new.active then new.rate_vnd end;
  if before_v is not distinct from after_v then return null; end if;
  perform private.stage_pay_change(new.branch_id, 'transport:' || new.material_id || ':' || new.uom_id,
    (select m.code from public.materials m where m.id = new.material_id), (select m.name from public.materials m where m.id = new.material_id),
    (select u.name from public.units_of_measure u where u.id = new.uom_id), 'VND', before_v, 'VND', after_v);
  return null;
end $$;
revoke all on function private.announce_transport_rate() from public, anon, authenticated, service_role;
create trigger transport_pay_rates_announce after insert or update on public.transport_pay_rates
  for each row execute function private.announce_transport_rate();

create or replace function private.announce_service_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before_v bigint; before_k text; after_v bigint; after_k text; st public.service_types%rowtype;
begin
  if tg_op = 'UPDATE' and old.active then
    before_v := coalesce(old.rate_vnd, old.rate_bps::bigint); before_k := case when old.rate_vnd is not null then 'VND' else 'BPS' end;
  end if;
  if new.active then
    after_v := coalesce(new.rate_vnd, new.rate_bps::bigint); after_k := case when new.rate_vnd is not null then 'VND' else 'BPS' end;
  end if;
  if (before_v, before_k) is not distinct from (after_v, after_k) then return null; end if;
  select * into st from public.service_types t where t.id = new.service_type_id;
  perform private.stage_pay_change(new.branch_id, 'service:' || new.service_type_id, st.code, st.name, st.unit_label, before_k, before_v, after_k, after_v);
  return null;
end $$;
revoke all on function private.announce_service_rate() from public, anon, authenticated, service_role;
create trigger service_pay_rates_announce after insert or update on public.service_pay_rates
  for each row execute function private.announce_service_rate();

-- D70: a trip price for the whole branch (one vehicle, or vehicles without their own price). A person's own component is private.
create or replace function private.announce_trip_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before_v bigint; after_v bigint;
begin
  before_v := case when tg_op = 'UPDATE' and old.active and old.method = 'PER_TRIP' and old.employee_id is null then old.amount_vnd end;
  after_v := case when new.active and new.method = 'PER_TRIP' and new.employee_id is null then new.amount_vnd end;
  if before_v is not distinct from after_v then return null; end if;
  perform private.stage_pay_change(new.branch_id, 'trip:' || new.id, new.code, new.name, 'chuyến', 'VND', before_v, 'VND', after_v);
  return null;
end $$;
revoke all on function private.announce_trip_rate() from public, anon, authenticated, service_role;
create trigger payroll_components_announce after insert or update on public.payroll_components
  for each row execute function private.announce_trip_rate();

-- ===== making the announcements, at commit =====
create or replace function private.announcement_day(at_time timestamptz) returns text
language sql stable set search_path = '' as $$
  select (array['thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy', 'Chủ nhật'])[extract(isodow from (at_time at time zone 'Asia/Ho_Chi_Minh'))::integer]
    || ', ' || to_char(at_time at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')
$$;
revoke all on function private.announcement_day(timestamptz) from public, anon, authenticated, service_role;

-- Push to every device of every recipient: title + one short line, opening the home page of the portal where the popup shows.
create or replace function private.announcement_push(target_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare a public.announcements%rowtype; sub public.push_subscriptions%rowtype; payload jsonb; lines integer; short text; sent integer := 0;
begin
  select * into a from public.announcements x where x.id = target_id;
  if a.id is null then return 0; end if;
  select count(*) into lines from public.announcement_lines l where l.announcement_id = a.id;
  short := case
    when a.kind = 'PRICE' then lines || ' mặt hàng đổi giá từ ' || to_char(a.effective_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')
    when a.kind = 'PAY_RATE' then lines || ' đơn giá công đổi lúc ' || to_char(a.updated_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI, DD/MM/YYYY')
    else left(coalesce(a.body, ''), 140) end;
  payload := jsonb_strip_nulls(jsonb_build_object('kind', 'announcement', 'title', left(a.title, 200), 'body', nullif(short, ''),
    'link', case a.audience when 'CUSTOMER' then '/customer' when 'WORKER' then '/work' else '/' end, 'announcement_id', a.id));
  for sub in select s.* from public.push_subscriptions s where s.auth_user_id in (select private.announcement_recipients(a.id)) order by s.id loop
    if private.enqueue_outbound_job(a.branch_id, null, null, 'PUSH', sub.id::text, payload, 'announcement:' || a.id || ':' || sub.id) is not null then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;
revoke all on function private.announcement_push(uuid) from public, anon, authenticated, service_role;

-- Fold changed lines into the unseen announcement of the same kind (and day, for prices), or make a new one and push it.
-- lines: [{key, code, name, unit, old, old_kind, new, new_kind}]
create or replace function private.merge_announcement(b uuid, a_audience text, a_kind text, a_customer uuid, at_time timestamptz,
  lines jsonb, rules uuid[], flush_group uuid, actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target public.announcements%rowtype;
  item jsonb;
  existing public.announcement_lines%rowtype;
  value_now bigint;
  kind_now text;
  made boolean := false;
  n integer;
  told integer;
  reason text;
begin
  select * into target from public.announcements a
  where a.branch_id = b and a.audience = a_audience and a.kind = a_kind and a.customer_id is not distinct from a_customer
    and (a_kind <> 'PRICE' or (a.effective_at at time zone 'Asia/Ho_Chi_Minh')::date = (at_time at time zone 'Asia/Ho_Chi_Minh')::date)
    and a.withdrawn_at is null and a.expires_at > now()
    and not exists (select 1 from public.announcement_seen s where s.announcement_id = a.id)
  order by a.created_at desc limit 1 for update;
  if target.id is null then
    insert into public.announcements(branch_id, group_id, audience, kind, customer_id, title, effective_at, price_rule_ids, created_by, expires_at)
    values (b, flush_group, a_audience, a_kind, a_customer, 'Thông báo cập nhật', case when a_kind = 'PRICE' then at_time end, rules, actor,
      now() + interval '30 days')
    returning * into target;
    made := true;
  end if;
  for item in select value from jsonb_array_elements(lines) loop
    value_now := (item->>'new')::bigint;
    kind_now := case when value_now is null then null else coalesce(item->>'new_kind', 'VND') end;
    select * into existing from public.announcement_lines l where l.announcement_id = target.id and l.item_key = item->>'key';
    if existing.announcement_id is null then
      insert into public.announcement_lines(announcement_id, item_key, item_code, item_name, unit_name, old_value, old_kind, new_value, new_kind)
      values (target.id, item->>'key', left(item->>'code', 60), left(coalesce(item->>'name', '—'), 200), left(item->>'unit', 60), (item->>'old')::bigint,
        case when item->>'old' is null then null else coalesce(item->>'old_kind', 'VND') end, value_now, kind_now);
    elsif (existing.old_value, existing.old_kind) is not distinct from (value_now, kind_now) then
      -- Changed back before anyone saw it: nothing to tell about this line.
      delete from public.announcement_lines l where l.announcement_id = target.id and l.item_key = existing.item_key;
    else
      update public.announcement_lines l set new_value = value_now, new_kind = kind_now,
        item_name = left(coalesce(item->>'name', l.item_name), 200), unit_name = left(coalesce(item->>'unit', l.unit_name), 60)
      where l.announcement_id = target.id and l.item_key = existing.item_key;
    end if;
  end loop;
  select count(*) into n from public.announcement_lines l where l.announcement_id = target.id;
  if n = 0 then
    delete from public.announcements a where a.id = target.id;
    return null;
  end if;
  if not made then
    update public.announcements a set price_rule_ids = (select coalesce(array_agg(distinct x), '{}') from unnest(a.price_rule_ids || rules) x)
    where a.id = target.id returning * into target;
  end if;
  if a_kind = 'PRICE' and a_audience = 'OFFICE' then
    select count(distinct x.customer_id) into told from public.announcements x
    where x.branch_id = b and x.audience = 'CUSTOMER' and x.kind = 'PRICE' and x.withdrawn_at is null and x.price_rule_ids && target.price_rule_ids;
    select e.reason into reason from public.audit_events e
    where e.entity_type = 'pricing_rules' and e.entity_id = any(target.price_rule_ids) and e.action = 'pricing.save' and e.reason is not null
    order by e.id desc limit 1;
  end if;
  update public.announcements a set
    title = case
      when a_kind = 'PRICE' and a_audience = 'CUSTOMER' then 'Giá mới từ ' || private.announcement_day(a.effective_at)
      when a_kind = 'PRICE' then 'Giá chung đổi ' || n || ' mặt hàng từ ' || to_char(a.effective_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')
      else 'Đơn giá công mới' end,
    body = case
      when a_kind = 'PRICE' and a_audience = 'CUSTOMER' then 'Cửa hàng điều chỉnh giá ' || n || ' mặt hàng của bạn. Đơn đã chốt trước đó giữ nguyên giá cũ.'
      when a_kind = 'PRICE' then concat_ws(' ', case when reason is not null and reason not in ('Cập nhật giá', 'Ngừng sử dụng giá') then 'Lý do: ' || left(reason, 300) || '.' end,
        'Khách có giá nhóm hoặc giá riêng cho mặt hàng nào thì mặt hàng đó không đổi với họ.',
        case when told > 0 then 'Đã báo ' || told || ' khách có giá thay đổi; mỗi khách chỉ thấy giá của mình.' end)
      else 'Văn phòng đổi ' || n || ' đơn giá công lúc ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI, DD/MM/YYYY') || '. Phiếu lương đã chốt giữ nguyên.' end,
    updated_at = now(), expires_at = now() + interval '30 days'
  where a.id = target.id;
  if made then perform private.announcement_push(target.id); end if;
  return target.id;
end $$;
revoke all on function private.merge_announcement(uuid, text, text, uuid, timestamptz, jsonb, uuid[], uuid, uuid) from public, anon, authenticated, service_role;

create or replace function private.flush_announcements(tx bigint, actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  flush_group uuid := gen_random_uuid();
  rules uuid[];
  grp record;
begin
  select coalesce(array_agg(s.rule_id order by s.rule_id), '{}') into rules from private.announcement_rule_stage s where s.txid = tx;
  -- 1. Each customer: the lines whose own effective price changed, one announcement per day the new prices start.
  for grp in
    with keys as (
      select s.branch_id, s.material_id, s.uom_id, s.at, array_agg(s.customer_id) cids
      from private.announcement_price_stage s where s.txid = tx and s.customer_id is not null group by 1, 2, 3, 4
    ), after_price as (
      select k.branch_id, k.material_id, k.uom_id, k.at, p.customer_id, p.unit_price_vnd
      from keys k cross join lateral private.announcement_prices(k.branch_id, k.material_id, k.uom_id, k.at, k.cids) p
    ), changed as (
      select s.branch_id, s.customer_id, s.material_id, s.uom_id, s.at, s.old_price, a.unit_price_vnd new_price
      from private.announcement_price_stage s
      join after_price a on a.branch_id = s.branch_id and a.material_id = s.material_id and a.uom_id = s.uom_id and a.at = s.at
        and a.customer_id = s.customer_id
      where s.txid = tx and s.old_price is not null and a.unit_price_vnd is not null and a.unit_price_vnd <> s.old_price
    )
    select c.branch_id, c.customer_id, (c.at at time zone 'Asia/Ho_Chi_Minh')::date as day, min(c.at) as at,
      jsonb_agg(jsonb_build_object('key', 'price:' || c.material_id || ':' || c.uom_id, 'code', m.code, 'name', m.name, 'unit', u.name,
        'old', c.old_price, 'new', c.new_price) order by m.name, c.material_id, c.uom_id) as lines
    from changed c join public.materials m on m.id = c.material_id join public.units_of_measure u on u.id = c.uom_id
    group by 1, 2, 3 order by 1, 2, 3
  loop
    perform private.merge_announcement(grp.branch_id, 'CUSTOMER', 'PRICE', grp.customer_id, grp.at, grp.lines, rules, flush_group, actor);
  end loop;
  -- 2. The office: the common price that changed (after the customers, so it can say how many were told).
  for grp in
    select s.branch_id, (s.at at time zone 'Asia/Ho_Chi_Minh')::date as day, min(s.at) as at,
      jsonb_agg(jsonb_build_object('key', 'price:' || s.material_id || ':' || s.uom_id, 'code', m.code, 'name', m.name, 'unit', u.name,
        'old', s.old_price, 'new', d.new_price) order by m.name, s.material_id, s.uom_id) as lines
    from private.announcement_price_stage s
    cross join lateral (select private.announcement_default_price(s.branch_id, s.material_id, s.uom_id, s.at) new_price) d
    join public.materials m on m.id = s.material_id join public.units_of_measure u on u.id = s.uom_id
    where s.txid = tx and s.customer_id is null and s.old_price is not null and d.new_price is not null and d.new_price <> s.old_price
    group by 1, 2 order by 1, 2
  loop
    perform private.merge_announcement(grp.branch_id, 'OFFICE', 'PRICE', null, grp.at, grp.lines, rules, gen_random_uuid(), actor);
  end loop;
  -- 3. Workers: the pay rates that changed.
  for grp in
    select s.branch_id, jsonb_agg(jsonb_build_object('key', s.item_key, 'code', s.item_code, 'name', s.item_name, 'unit', s.unit_name,
      'old', s.old_value, 'old_kind', s.old_kind, 'new', s.new_value, 'new_kind', s.new_kind) order by s.item_name, s.item_key) as lines
    from private.announcement_pay_stage s
    where s.txid = tx and (s.old_value, s.old_kind) is distinct from (s.new_value, s.new_kind)
    group by 1 order by 1
  loop
    perform private.merge_announcement(grp.branch_id, 'WORKER', 'PAY_RATE', null, null, grp.lines, '{}', gen_random_uuid(), actor);
  end loop;
end $$;
revoke all on function private.flush_announcements(bigint, uuid) from public, anon, authenticated, service_role;

create or replace function private.announcement_flush_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- An announcement must never undo the save it reports on.
  begin
    perform private.flush_announcements(new.txid, new.actor);
  exception when others then
    raise warning 'announcement_flush_failed: %', sqlerrm;
  end;
  delete from private.announcement_price_stage where txid = new.txid;
  delete from private.announcement_rule_stage where txid = new.txid;
  delete from private.announcement_pay_stage where txid = new.txid;
  delete from private.announcement_flush where txid = new.txid;
  return null;
end $$;
revoke all on function private.announcement_flush_trigger() from public, anon, authenticated, service_role;
create constraint trigger announcement_flush_at_commit after insert on private.announcement_flush
  deferrable initially deferred for each row execute function private.announcement_flush_trigger();

-- ===== reading =====
create or replace function private.announcement_payload(target_id uuid, viewer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'audience', a.audience, 'kind', a.kind, 'label', a.label, 'title', a.title, 'body', a.body,
    'link', a.link, 'effective_at', a.effective_at, 'created_at', a.created_at, 'updated_at', a.updated_at,
    'seen_at', (select s.seen_at from public.announcement_seen s where s.announcement_id = a.id and s.auth_user_id = viewer),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('code', l.item_code, 'name', l.item_name, 'unit', l.unit_name,
        'old', l.old_value::text, 'old_kind', l.old_kind, 'new', l.new_value::text, 'new_kind', l.new_kind) order by l.item_name, l.item_key)
      from public.announcement_lines l where l.announcement_id = a.id), '[]'::jsonb))
  from public.announcements a where a.id = target_id
$$;
revoke all on function private.announcement_payload(uuid, uuid) from public, anon, authenticated, service_role;

-- Announcements this login may read on a portal: candidates first narrowed cheaply (a customer: its own customers).
create or replace function private.announcement_candidates(surface text, viewer uuid) returns setof public.announcements
language sql stable security definer set search_path = '' as $$
  select a.* from public.announcements a
  where a.audience = surface and a.withdrawn_at is null
    and (surface <> 'CUSTOMER' or a.customer_id is null or a.customer_id in (select m.customer_id from public.customer_portal_memberships m
      where m.auth_user_id = viewer and m.active))
    and private.announcement_for(viewer, a.branch_id, a.audience, a.kind, a.customer_id, a.target_role_ids, a.created_by)
$$;
revoke all on function private.announcement_candidates(text, uuid) from public, anon, authenticated, service_role;

-- The popup: at most 5 not seen yet and not older than 30 days; prices and pay rates first, then oldest first.
create or replace function public.pending_announcements(surface text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not private.auth_actor_active() or surface is null or surface not in ('CUSTOMER', 'WORKER', 'OFFICE') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(private.announcement_payload(x.id, me) order by x.manual, x.starts, x.created_at, x.id) from (
    select a.id, a.kind = 'MANUAL' manual, coalesce(a.effective_at, a.created_at) starts, a.created_at
    from private.announcement_candidates(surface, me) a
    where a.expires_at > now() and not exists (select 1 from public.announcement_seen s where s.announcement_id = a.id and s.auth_user_id = me)
    order by 2, 3, 4, 1 limit 5) x), '[]'::jsonb);
end $$;
revoke all on function public.pending_announcements(text) from public, anon;
grant execute on function public.pending_announcements(text) to authenticated;

-- "Thông báo từ cửa hàng": what this login received, newest first, seen or not.
create or replace function public.announcement_history(surface text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not private.auth_actor_active() or surface is null or surface not in ('CUSTOMER', 'WORKER', 'OFFICE') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(private.announcement_payload(x.id, me) order by x.created_at desc, x.id) from (
    select a.id, a.created_at from private.announcement_candidates(surface, me) a order by a.created_at desc, a.id limit 30) x), '[]'::jsonb);
end $$;
revoke all on function public.announcement_history(text) from public, anon;
grant execute on function public.announcement_history(text) to authenticated;

-- Seen once per account: "Đã hiểu", "Đóng" or Esc on the popup. Repeating it changes nothing.
create or replace function public.mark_announcements_seen(target_ids uuid[], operation_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); made integer;
begin
  if me is null or not private.auth_actor_active() then raise exception 'forbidden' using errcode = '42501'; end if;
  if mark_announcements_seen.operation_id is null or target_ids is null or cardinality(target_ids) not between 1 and 20 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.announcement_seen(announcement_id, auth_user_id)
  select a.id, me from public.announcements a
  where a.id = any(target_ids) and private.announcement_for(me, a.branch_id, a.audience, a.kind, a.customer_id, a.target_role_ids, a.created_by)
  on conflict do nothing;
  get diagnostics made = row_count;
  return made;
end $$;
revoke all on function public.mark_announcements_seen(uuid[], uuid) from public, anon;
grant execute on function public.mark_announcements_seen(uuid[], uuid) to authenticated;

-- After saving prices: how many customers were told (the save's first new rule).
create or replace function public.price_announcement_reach(target_branch_id uuid, target_rule_id uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'pricing.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(distinct a.customer_id)::integer from public.announcements a
    where a.branch_id = target_branch_id and a.audience = 'CUSTOMER' and a.kind = 'PRICE' and a.withdrawn_at is null
      and target_rule_id = any(a.price_rule_ids));
end $$;
revoke all on function public.price_announcement_reach(uuid, uuid) from public, anon;
grant execute on function public.price_announcement_reach(uuid, uuid) to authenticated;

-- ===== the owner composes =====
-- Pages a composed announcement may open, per portal (only pages of the app, never an outside link).
create or replace function private.announcement_link_allowed(a_audience text, a_link text) returns boolean
language sql immutable set search_path = '' as $$
  select a_link is null or a_link = any(case a_audience
    when 'CUSTOMER' then array['/customer/orders/new', '/customer/services/new', '/customer/orders', '/customer/debts']
    when 'WORKER' then array['/work/pool', '/work/earnings', '/work/attendance']
    when 'OFFICE' then array['/admin/dispatch', '/admin/products/pricing', '/admin/orders']
    else array[]::text[] end)
$$;
revoke all on function private.announcement_link_allowed(text, text) from public, anon, authenticated, service_role;

create or replace function public.announcement_composer_options(target_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not private.has_permission(target_branch_id, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'customers', (select count(*) from private.announcement_audience(target_branch_id, 'CUSTOMER', 'MANUAL', null, null, me)),
    'workers', (select count(*) from private.announcement_audience(target_branch_id, 'WORKER', 'MANUAL', null, null, me)),
    'office', (select count(*) from private.announcement_audience(target_branch_id, 'OFFICE', 'MANUAL', null, null, me)),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'count', r.n) order by r.name, r.id) from (
      select ro.id, ro.name, (select count(*) from private.announcement_audience(target_branch_id, 'OFFICE', 'MANUAL', null, array[ro.id], me)) n
      from public.roles ro where ro.active and exists (select 1 from public.employee_branch_access acc where acc.role_id = ro.id
        and acc.branch_id = target_branch_id and acc.active)) r where r.n > 0), '[]'::jsonb));
end $$;
revoke all on function public.announcement_composer_options(uuid) from public, anon;
grant execute on function public.announcement_composer_options(uuid) to authenticated;

create or replace function public.create_announcement(target_branch_id uuid, target_audience text, target_label text, announcement_title text,
  announcement_body text, announcement_link text, role_ids uuid[], operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  payload_hash text;
  receipt public.command_receipts%rowtype;
  made uuid := gen_random_uuid();
  chosen_roles uuid[] := case when cardinality(role_ids) > 0 then role_ids end;
begin
  if me is null or not private.has_permission(target_branch_id, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if create_announcement.operation_id is null or target_audience is null or target_audience not in ('CUSTOMER', 'WORKER', 'OFFICE')
    or target_label is null or target_label not in ('NEWS', 'FEATURE', 'RULE')
    or char_length(btrim(coalesce(announcement_title, ''))) not between 3 and 80 or char_length(coalesce(announcement_body, '')) > 600
    or not private.announcement_link_allowed(target_audience, nullif(announcement_link, ''))
    or (chosen_roles is not null and (target_audience <> 'OFFICE' or cardinality(chosen_roles) > 50
      or exists (select 1 from unnest(chosen_roles) x where not exists (select 1 from public.roles r where r.id = x and r.active)))) then
    raise exception 'invalid_announcement' using errcode = '22023';
  end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'audience', target_audience, 'label', target_label,
    'title', btrim(announcement_title), 'body', nullif(btrim(coalesce(announcement_body, '')), ''), 'link', nullif(announcement_link, ''), 'roles', chosen_roles));
  perform pg_advisory_xact_lock(hashtextextended(create_announcement.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = create_announcement.operation_id;
  if found then
    if receipt.command_name <> 'create_announcement' or receipt.payload_hash <> payload_hash or receipt.actor_auth_user_id is distinct from me then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if not exists (select 1 from private.announcement_audience(target_branch_id, target_audience, 'MANUAL', null, chosen_roles, me)) then
    raise exception 'announcement_no_recipient' using errcode = '22023';
  end if;
  insert into public.announcements(id, branch_id, group_id, audience, kind, label, target_role_ids, title, body, link, created_by, expires_at, operation_id)
  values (made, target_branch_id, made, target_audience, 'MANUAL', target_label, chosen_roles, btrim(announcement_title),
    nullif(btrim(coalesce(announcement_body, '')), ''), nullif(announcement_link, ''), me, now() + interval '30 days', create_announcement.operation_id);
  insert into public.command_receipts values (create_announcement.operation_id, me, 'create_announcement', payload_hash, 'announcement', made, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (me, target_branch_id, 'announcement.create', 'announcement', made, create_announcement.operation_id,
    array['audience', 'title', 'body'], left(btrim(announcement_title), 120));
  perform private.announcement_push(made);
  return made;
end $$;
revoke all on function public.create_announcement(uuid, text, text, text, text, text, uuid[], uuid) from public, anon;
grant execute on function public.create_announcement(uuid, text, text, text, text, text, uuid[], uuid) to authenticated;

-- "Ngừng hiện": the announcement (or every customer's announcement of one price save) stops showing and leaves the history.
create or replace function public.stop_announcement(target_group_id uuid, operation_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); branch uuid; made integer;
begin
  select a.branch_id into branch from public.announcements a where a.group_id = target_group_id limit 1;
  if me is null or branch is null or not private.has_permission(branch, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if stop_announcement.operation_id is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.announcements a set withdrawn_at = now(), withdrawn_by = me where a.group_id = target_group_id and a.withdrawn_at is null;
  get diagnostics made = row_count;
  if made > 0 then
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (me, branch, 'announcement.stop', 'announcement', target_group_id, stop_announcement.operation_id, array['withdrawn_at']);
  end if;
  return made;
end $$;
revoke all on function public.stop_announcement(uuid, uuid) from public, anon;
grant execute on function public.stop_announcement(uuid, uuid) to authenticated;

-- "Đã gửi gần đây" for the owner: one row per announcement, or per price save for the customers' announcements.
create or replace function public.sent_announcements(target_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(g)::jsonb order by g.created_at desc, g.group_id) from (
    select a.group_id, min(a.audience) audience, min(a.kind) kind, min(a.label) label,
      (array_agg(a.title order by a.created_at, a.id))[1] title, min(a.created_at) created_at, max(a.expires_at) expires_at,
      max(a.withdrawn_at) withdrawn_at, count(*)::integer announcements,
      sum((select count(*) from private.announcement_recipients(a.id)))::integer recipients,
      sum((select count(*) from public.announcement_seen s where s.announcement_id = a.id))::integer seen
    from public.announcements a where a.branch_id = target_branch_id and a.created_at > now() - interval '90 days'
    group by a.group_id order by min(a.created_at) desc limit 30) g), '[]'::jsonb);
end $$;
revoke all on function public.sent_announcements(uuid) from public, anon;
grant execute on function public.sent_announcements(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
