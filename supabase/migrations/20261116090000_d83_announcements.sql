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

-- No foreign key on purpose: a full price list for hundreds of customers writes over a hundred thousand lines at commit, and the
-- per-row key check would double that time. The lines of a deleted announcement are deleted with it (announcements_lines_cleanup).
create table public.announcement_lines (
  announcement_id uuid not null,
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
) with (fillfactor = 60);  -- room on each page, so saving again before anyone saw it updates its lines in place (HOT)

create or replace function private.announcement_lines_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.announcement_lines l where l.announcement_id in (select g.id from gone g);
  return null;
end $$;
revoke all on function private.announcement_lines_cleanup() from public, anon, authenticated, service_role;
create trigger announcements_lines_cleanup after delete on public.announcements
  referencing old table as gone for each statement execute function private.announcement_lines_cleanup();

create table public.announcement_seen (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (announcement_id, auth_user_id)
);
create index announcement_seen_user_idx on public.announcement_seen(auth_user_id);

-- Work tables of one transaction, read at commit. A price change only records the rule as it was before (one small row per
-- changed rule); every price is worked out once, set-based, at commit.
create table private.announcement_rule_change (
  txid bigint not null,
  ord bigint generated always as identity,
  rule_id uuid not null,
  inserted boolean not null,  -- a rule made in this transaction: it did not exist before
  branch_id uuid not null,
  scope_type text not null,
  customer_id uuid,
  material_id uuid,
  material_group_id uuid,
  customer_tier_code text,
  price_uom_id uuid not null,
  unit_price_vnd bigint not null,
  version integer not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  active boolean not null,
  at timestamptz not null,    -- when the change takes effect
  primary key (txid, rule_id)
);
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
revoke all on private.announcement_rule_change, private.announcement_pay_stage, private.announcement_flush
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
            -- office staff: some permission beyond the worker portal's own (D85: a lead worker's work.field_dispatch is a worker's too)
            and (exists (select 1 from public.role_permissions rp where rp.role_id = r.id
                and rp.permission_code not in ('work.read', 'work.claim', 'work.field_dispatch'))
              or exists (select 1 from public.employee_permission_grants g where g.employee_id = e.id and g.branch_id = acc.branch_id
                and g.permission_code not in ('work.read', 'work.claim', 'work.field_dispatch')))) end
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

-- ===== prices =====
-- Each portal customer's effective price of each item, before (B) and after (A) the transaction's changes, all at once at commit.
-- Same choice as private.preferred_commercial_price_rule (SPEC-PRI-001: customer + material → customer + material group → customer
-- tier → default; within one of them the highest version, which the unique indexes make unambiguous), on the day the change takes
-- effect instead of now(), so a price saved for a later day is compared on that day. "Before" is today's rules with the ones changed
-- in this transaction put back as they were and the ones made in it left out. Rows per customer, and rows without a customer for the
-- common price (the office); only items whose price changed and that had a price before. Hash joins only: the work table is never
-- analyzed, and a nested loop over customers × items would grow with their product.
create or replace function private.announcement_price_changes(tx bigint, b uuid, cust_ids uuid[], cust_tiers text[], key_materials uuid[],
  key_uoms uuid[], key_ats timestamptz[], key_groups uuid[])
returns table(customer_id uuid, material_id uuid, uom_id uuid, at timestamptz, old_price bigint, new_price bigint)
language sql stable security definer set search_path = '' set enable_nestloop = off set jit = off as $$
  with keys as materialized (
    select k.material_id, k.uom_id, k.at, k.group_id from unnest(key_materials, key_uoms, key_ats, key_groups) k(material_id, uom_id, at, group_id)
  ), changed as materialized (
    select c.* from private.announcement_rule_change c where c.txid = tx and c.branch_id = b
  ), current_rules as materialized (
    select r.id, r.scope_type, r.customer_id, r.material_id, r.material_group_id, r.customer_tier_code, r.price_uom_id, r.unit_price_vnd,
      r.version, r.effective_from, r.effective_to, r.active
    from public.pricing_rules r where r.branch_id = b and r.material_id = any(key_materials) and r.price_uom_id = any(key_uoms)
    union all
    select r.id, r.scope_type, r.customer_id, r.material_id, r.material_group_id, r.customer_tier_code, r.price_uom_id, r.unit_price_vnd,
      r.version, r.effective_from, r.effective_to, r.active
    from public.pricing_rules r where r.branch_id = b and r.material_id is null and r.material_group_id = any(key_groups)
      and r.price_uom_id = any(key_uoms)
  ), states as materialized (
    select 'A'::text st, r.* from current_rules r
    union all
    select 'B', r.* from current_rules r where not exists (select 1 from changed c where c.rule_id = r.id)
    union all
    select 'B', c.rule_id, c.scope_type, c.customer_id, c.material_id, c.material_group_id, c.customer_tier_code, c.price_uom_id,
      c.unit_price_vnd, c.version, c.effective_from, c.effective_to, c.active
    from changed c where not c.inserted
  ), applying as (
    select s.st, s.scope_type, s.customer_id, s.customer_tier_code, k.material_id, k.uom_id, s.unit_price_vnd, s.version
    from states s join keys k on k.material_id = s.material_id and k.uom_id = s.price_uom_id
    where s.active and s.effective_from <= k.at and (s.effective_to is null or s.effective_to > k.at)
    union all
    select s.st, s.scope_type, s.customer_id, s.customer_tier_code, k.material_id, k.uom_id, s.unit_price_vnd, s.version
    from states s join keys k on k.group_id = s.material_group_id and k.uom_id = s.price_uom_id
    where s.scope_type = 'CUSTOMER_GROUP' and s.active and s.effective_from <= k.at and (s.effective_to is null or s.effective_to > k.at)
  ), best as materialized (
    select distinct on (x.st, x.scope_type, x.customer_id, x.customer_tier_code, x.material_id, x.uom_id)
      x.st, x.scope_type, x.customer_id, x.customer_tier_code, x.material_id, x.uom_id, x.unit_price_vnd price
    from applying x order by x.st, x.scope_type, x.customer_id, x.customer_tier_code, x.material_id, x.uom_id, x.version desc
  ), levels as materialized (
    select x.scope_type, x.customer_id, x.customer_tier_code, x.material_id, x.uom_id,
      max(x.price) filter (where x.st = 'B') before_price, max(x.price) filter (where x.st = 'A') after_price
    from best x group by 1, 2, 3, 4, 5
  ), dm as materialized (select * from levels l where l.scope_type = 'DEFAULT'),
  tm as materialized (select * from levels l where l.scope_type = 'CUSTOMER_TIER'),
  cg as materialized (select * from levels l where l.scope_type = 'CUSTOMER_GROUP'),
  cm as materialized (select * from levels l where l.scope_type = 'CUSTOMER_MATERIAL'),
  custs as materialized (select c.id, c.tier from unnest(cust_ids, cust_tiers) c(id, tier))
  select x.customer_id, x.material_id, x.uom_id, x.at, x.old_price, x.new_price from (
    select c.id customer_id, k.material_id, k.uom_id, k.at,
      coalesce(cm.before_price, cg.before_price, tm.before_price, dm.before_price) old_price,
      coalesce(cm.after_price, cg.after_price, tm.after_price, dm.after_price) new_price
    from custs c cross join keys k
    left join cm on cm.customer_id = c.id and cm.material_id = k.material_id and cm.uom_id = k.uom_id
    left join cg on cg.customer_id = c.id and cg.material_id = k.material_id and cg.uom_id = k.uom_id
    left join tm on tm.customer_tier_code = c.tier and tm.material_id = k.material_id and tm.uom_id = k.uom_id
    left join dm on dm.material_id = k.material_id and dm.uom_id = k.uom_id
    union all
    select null, k.material_id, k.uom_id, k.at, dm.before_price, dm.after_price
    from dm join keys k on k.material_id = dm.material_id and k.uom_id = dm.uom_id
  ) x
  where x.old_price is not null and x.new_price is not null and x.old_price <> x.new_price
$$;
revoke all on function private.announcement_price_changes(bigint, uuid, uuid[], text[], uuid[], uuid[], timestamptz[], uuid[])
  from public, anon, authenticated, service_role;

-- Inside the save: only the rule as it was before its first change in the transaction is kept (one small row, no price work), so a
-- save of any size stays as fast as without announcements. Nothing here may ever fail the save.
create or replace function private.announce_price_rule_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.pricing_rules%rowtype; at_time timestamptz;
begin
  if tg_op = 'UPDATE' and new.unit_price_vnd = old.unit_price_vnd and new.active = old.active and new.effective_from = old.effective_from
    and new.effective_to is not distinct from old.effective_to then return null; end if;
  begin
    if tg_op = 'INSERT' then r := new; else r := old; end if;
    -- A replaced rule ends when its successor starts; a new rule from its first day; a stopped rule now.
    at_time := greatest(now(), case when tg_op = 'UPDATE' and new.effective_to is distinct from old.effective_to and new.effective_to is not null
      then new.effective_to else new.effective_from end);
    insert into private.announcement_rule_change(txid, rule_id, inserted, branch_id, scope_type, customer_id, material_id, material_group_id,
      customer_tier_code, price_uom_id, unit_price_vnd, version, effective_from, effective_to, active, at)
    values (txid_current(), r.id, tg_op = 'INSERT', r.branch_id, r.scope_type, r.customer_id, r.material_id, r.material_group_id,
      r.customer_tier_code, r.price_uom_id, r.unit_price_vnd, r.version, r.effective_from, r.effective_to, r.active, at_time)
    on conflict (txid, rule_id) do nothing;
    insert into private.announcement_flush(txid, actor) values (txid_current(), auth.uid()) on conflict do nothing;
  exception when others then
    raise warning 'announcement_stage_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.announce_price_rule_change() from public, anon, authenticated, service_role;
create trigger pricing_rules_announce after insert or update on public.pricing_rules
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
  begin
    perform private.stage_pay_change(new.branch_id, 'transport:' || new.material_id || ':' || new.uom_id,
      (select m.code from public.materials m where m.id = new.material_id), (select m.name from public.materials m where m.id = new.material_id),
      (select u.name from public.units_of_measure u where u.id = new.uom_id), 'VND', before_v, 'VND', after_v);
  exception when others then
    raise warning 'announcement_stage_failed: %', sqlerrm;
  end;
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
  begin
    select * into st from public.service_types t where t.id = new.service_type_id;
    perform private.stage_pay_change(new.branch_id, 'service:' || new.service_type_id, st.code, st.name, st.unit_label, before_k, before_v, after_k, after_v);
  exception when others then
    raise warning 'announcement_stage_failed: %', sqlerrm;
  end;
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
  begin
    perform private.stage_pay_change(new.branch_id, 'trip:' || new.id, new.code, new.name, 'chuyến', 'VND', before_v, 'VND', after_v);
  exception when others then
    raise warning 'announcement_stage_failed: %', sqlerrm;
  end;
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

-- An announcement that goes away before anyone saw it (every line changed back, or "Ngừng hiện"): its pushes not handed over yet
-- (PENDING, or FAILED waiting for a retry) are cancelled. One already handed to the sender (SENDING / SENT) cannot be called back.
create or replace function private.announcement_cancel_push(target_id uuid, target_branch uuid, made_at timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare cancelled integer;
begin
  update public.outbound_jobs j set state = 'DEAD', lease_until = null, request_id = null, last_error_safe = 'Thông báo đã thu hồi trước khi gửi'
  where j.branch_id = target_branch and j.created_at >= made_at and j.channel = 'PUSH' and j.state in ('PENDING', 'FAILED')
    and j.dedupe_key like 'announcement:' || target_id || ':%';
  get diagnostics cancelled = row_count;
  return cancelled;
end $$;
revoke all on function private.announcement_cancel_push(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-- After lines were added, changed or dropped: an announcement left without lines goes (its unsent pushes cancelled); the others get
-- their title and text for their lines and 30 more days. Returns the ones that remain.
create or replace function private.announcement_finish(ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare emptied uuid[];
begin
  select coalesce(array_agg(a.id), '{}') into emptied from public.announcements a
  where a.id = any(ids) and not exists (select 1 from public.announcement_lines l where l.announcement_id = a.id);
  perform private.announcement_cancel_push(a.id, a.branch_id, a.created_at) from public.announcements a where a.id = any(emptied);
  delete from public.announcements a where a.id = any(emptied);
  update public.announcements a set
    title = case
      when a.kind = 'PRICE' and a.audience = 'CUSTOMER' then 'Giá mới từ ' || private.announcement_day(a.effective_at)
      when a.kind = 'PRICE' then 'Giá chung đổi ' || c.n || ' mặt hàng từ ' || to_char(a.effective_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')
      else 'Đơn giá công mới' end,
    body = case
      when a.kind = 'PRICE' and a.audience = 'CUSTOMER' then 'Cửa hàng điều chỉnh giá ' || c.n || ' mặt hàng của bạn. Đơn đã chốt trước đó giữ nguyên giá cũ.'
      when a.kind = 'PRICE' then concat_ws(' ',
        (select 'Lý do: ' || left(e.reason, 300) || '.' from public.audit_events e
          where e.entity_type = 'pricing_rules' and e.entity_id = any(a.price_rule_ids) and e.action = 'pricing.save' and e.reason is not null
            and e.reason not in ('Cập nhật giá', 'Ngừng sử dụng giá') order by e.id desc limit 1),
        'Khách có giá nhóm hoặc giá riêng cho mặt hàng nào thì mặt hàng đó không đổi với họ.',
        (select 'Đã báo ' || count(distinct x.customer_id) || ' khách có giá thay đổi; mỗi khách chỉ thấy giá của mình.' from public.announcements x
          where x.branch_id = a.branch_id and x.audience = 'CUSTOMER' and x.kind = 'PRICE' and x.withdrawn_at is null
            and cardinality(a.price_rule_ids) > 0 and x.price_rule_ids && a.price_rule_ids having count(*) > 0))
      else 'Văn phòng đổi ' || c.n || ' đơn giá công lúc ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI, DD/MM/YYYY') || '. Phiếu lương đã chốt giữ nguyên.' end,
    updated_at = now(), expires_at = now() + interval '30 days'
  from (select l.announcement_id id, count(*) n from public.announcement_lines l where l.announcement_id = any(ids) group by 1) c
  where a.id = c.id;
  return array(select x from unnest(ids) x where x <> all(emptied));
end $$;
revoke all on function private.announcement_finish(uuid[]) from public, anon, authenticated, service_role;

-- One announcement: fold changed lines into the unseen one of the same kind (and day, for prices; and author, for staff), or make a
-- new one and push it. Used for the office, the workers, and a customer one by one when the bulk path below fails.
-- lines: [{key, code, name, unit, old, old_kind, new, new_kind}]
create or replace function private.merge_announcement(b uuid, a_audience text, a_kind text, a_customer uuid, at_time timestamptz,
  lines jsonb, rules uuid[], flush_group uuid, actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target public.announcements%rowtype;
  made boolean := false;
begin
  select * into target from public.announcements a
  where a.branch_id = b and a.audience = a_audience and a.kind = a_kind and a.customer_id is not distinct from a_customer
    and (a_kind <> 'PRICE' or (a.effective_at at time zone 'Asia/Ho_Chi_Minh')::date = (at_time at time zone 'Asia/Ho_Chi_Minh')::date)
    -- Staff announcements leave out their author: only fold one made by the same person.
    and (a_audience = 'CUSTOMER' or a.created_by is not distinct from actor)
    and a.withdrawn_at is null and a.expires_at > now()
    and not exists (select 1 from public.announcement_seen s where s.announcement_id = a.id)
  order by a.created_at desc limit 1 for update;
  if target.id is null then
    insert into public.announcements(branch_id, group_id, audience, kind, customer_id, title, effective_at, price_rule_ids, created_by, expires_at)
    values (b, flush_group, a_audience, a_kind, a_customer, 'Thông báo cập nhật', case when a_kind = 'PRICE' then at_time end, rules, actor,
      now() + interval '30 days')
    returning * into target;
    made := true;
  else
    update public.announcements a set price_rule_ids = (select coalesce(array_agg(distinct x), '{}') from unnest(a.price_rule_ids || rules) x)
    where a.id = target.id;
  end if;
  -- Names are clamped so a blank or very long name never loses the announcement.
  with incoming as materialized (
    select left(x.key, 120) item_key, left(nullif(btrim(x.code), ''), 60) item_code,
      left(coalesce(nullif(btrim(x.name), ''), nullif(btrim(x.code), ''), '—'), 200) item_name, left(nullif(btrim(x.unit), ''), 60) unit_name,
      x.old old_value, case when x.old is null then null else coalesce(x.old_kind, 'VND') end old_kind,
      x.new new_value, case when x.new is null then null else coalesce(x.new_kind, 'VND') end new_kind
    from jsonb_to_recordset(lines) x(key text, code text, name text, unit text, old bigint, old_kind text, new bigint, new_kind text)
    where x.key is not null
  ), existing as materialized (
    select l.item_key, l.old_value, l.old_kind from public.announcement_lines l where l.announcement_id = target.id
  ), gone as (
    -- Changed back before anyone saw it: nothing to tell about this line.
    delete from public.announcement_lines l using incoming i, existing e
    where l.announcement_id = target.id and l.item_key = i.item_key and e.item_key = i.item_key
      and (e.old_value, e.old_kind) is not distinct from (i.new_value, i.new_kind)
  ), moved as (
    update public.announcement_lines l set new_value = i.new_value, new_kind = i.new_kind, item_name = i.item_name, unit_name = i.unit_name,
      item_code = coalesce(i.item_code, l.item_code)
    from incoming i join existing e on e.item_key = i.item_key
    where l.announcement_id = target.id and l.item_key = i.item_key and (e.old_value, e.old_kind) is distinct from (i.new_value, i.new_kind)
  )
  insert into public.announcement_lines(announcement_id, item_key, item_code, item_name, unit_name, old_value, old_kind, new_value, new_kind)
  select target.id, i.item_key, i.item_code, i.item_name, i.unit_name, i.old_value, i.old_kind, i.new_value, i.new_kind
  from incoming i
  where not exists (select 1 from existing e where e.item_key = i.item_key)
    and (i.old_value, i.old_kind) is distinct from (i.new_value, i.new_kind);
  if cardinality(private.announcement_finish(array[target.id])) = 0 then return null; end if;
  if made then perform private.announcement_push(target.id); end if;
  return target.id;
end $$;
revoke all on function private.merge_announcement(uuid, text, text, uuid, timestamptz, jsonb, uuid[], uuid, uuid) from public, anon, authenticated, service_role;

-- Every customer's price announcement of one save in a few set-based statements (a full price list for hundreds of customers):
-- one per customer and day the new prices start, folded into that customer's unseen one of the same day, or new and pushed.
-- ch_*: the customers' changed lines (customer, item, unit, day, old, new), as private.announcement_price_changes gives them.
create or replace function private.announce_customer_prices(b uuid, ch_c uuid[], ch_m uuid[], ch_u uuid[], ch_at timestamptz[], ch_old bigint[],
  ch_new bigint[], rules uuid[], flush_group uuid, actor uuid) returns void
language plpgsql security definer set search_path = '' set enable_nestloop = off set jit = off as $$
declare
  g_c uuid[]; g_d date[]; g_at timestamptz[]; g_t uuid[];
  made uuid[];
  kept uuid[];
  a uuid;
begin
  -- 1. The announcement of each customer and day: the newest unseen one to fold into (locked), or none yet.
  select array_agg(g.c order by g.c, g.d), array_agg(g.d order by g.c, g.d), array_agg(g.at order by g.c, g.d), array_agg(t.id order by g.c, g.d)
  into g_c, g_d, g_at, g_t
  from (select x.c, (x.at at time zone 'Asia/Ho_Chi_Minh')::date d, min(x.at) at from unnest(ch_c, ch_at) x(c, at) where x.c is not null group by 1, 2) g
  left join (
    select distinct on (o.customer_id, o.d) o.id, o.customer_id, o.d from (
      select a2.id, a2.customer_id, (a2.effective_at at time zone 'Asia/Ho_Chi_Minh')::date d, a2.created_at from public.announcements a2
      where a2.branch_id = b and a2.audience = 'CUSTOMER' and a2.kind = 'PRICE' and a2.customer_id = any(ch_c)
        and a2.withdrawn_at is null and a2.expires_at > now() and not exists (select 1 from public.announcement_seen s where s.announcement_id = a2.id)
    ) o order by o.customer_id, o.d, o.created_at desc
  ) t on t.customer_id = g.c and t.d = g.d;
  if g_c is null then return; end if;
  perform 1 from public.announcements x where x.id = any(g_t) order by x.id for update;
  update public.announcements x set price_rule_ids = (select coalesce(array_agg(distinct r), '{}') from unnest(x.price_rule_ids || rules) r)
  where x.id = any(g_t);
  -- 2. New announcements for the others.
  with ins as (
    insert into public.announcements(branch_id, group_id, audience, kind, customer_id, title, effective_at, price_rule_ids, created_by, expires_at)
    select b, flush_group, 'CUSTOMER', 'PRICE', g.c, 'Thông báo cập nhật', g.at, rules, actor, now() + interval '30 days'
    from unnest(g_c, g_at, g_t) g(c, at, t) where g.t is null
    returning id
  ) select coalesce(array_agg(ins.id), '{}') into made from ins;
  -- 3. All lines at once: added, changed (the price first told stays the old one), or dropped when back to that price.
  with targets as materialized (
    select g.c, g.d, coalesce(g.t, n.id) aid from unnest(g_c, g_d, g_t) g(c, d, t)
    left join (select x.id, x.customer_id, (x.effective_at at time zone 'Asia/Ho_Chi_Minh')::date d from public.announcements x where x.id = any(made)) n
      on g.t is null and n.customer_id = g.c and n.d = g.d
  ), incoming as materialized (
    select t.aid announcement_id, 'price:' || x.m || ':' || x.u item_key, left(nullif(btrim(m.code), ''), 60) item_code,
      left(coalesce(nullif(btrim(m.name), ''), nullif(btrim(m.code), ''), '—'), 200) item_name, left(nullif(btrim(u.name), ''), 60) unit_name,
      x.old old_value, 'VND'::text old_kind, x.new new_value, 'VND'::text new_kind
    from unnest(ch_c, ch_m, ch_u, ch_at, ch_old, ch_new) x(c, m, u, at, old, new)
    join targets t on t.c = x.c and t.d = (x.at at time zone 'Asia/Ho_Chi_Minh')::date
    join public.materials m on m.id = x.m join public.units_of_measure u on u.id = x.u
    where x.old is distinct from x.new
  ), existing as materialized (
    select l.announcement_id, l.item_key, l.old_value, l.old_kind from public.announcement_lines l where l.announcement_id = any(g_t)
  ), gone as (
    delete from public.announcement_lines l using incoming i, existing e
    where l.announcement_id = i.announcement_id and l.item_key = i.item_key and e.announcement_id = i.announcement_id and e.item_key = i.item_key
      and (e.old_value, e.old_kind) is not distinct from (i.new_value, i.new_kind)
  ), moved as (
    update public.announcement_lines l set new_value = i.new_value, new_kind = i.new_kind, item_name = i.item_name, unit_name = i.unit_name,
      item_code = coalesce(i.item_code, l.item_code)
    from incoming i join existing e on e.announcement_id = i.announcement_id and e.item_key = i.item_key
    where l.announcement_id = i.announcement_id and l.item_key = i.item_key and (e.old_value, e.old_kind) is distinct from (i.new_value, i.new_kind)
  )
  insert into public.announcement_lines(announcement_id, item_key, item_code, item_name, unit_name, old_value, old_kind, new_value, new_kind)
  select i.announcement_id, i.item_key, i.item_code, i.item_name, i.unit_name, i.old_value, i.old_kind, i.new_value, i.new_kind
  from incoming i where not exists (select 1 from existing e where e.announcement_id = i.announcement_id and e.item_key = i.item_key);
  -- 4. Text for the lines; empty ones go; new ones are pushed.
  kept := private.announcement_finish(array(select x from unnest(g_t) x where x is not null) || made);
  foreach a in array made loop
    if a = any(kept) then perform private.announcement_push(a); end if;
  end loop;
end $$;
revoke all on function private.announce_customer_prices(uuid, uuid[], uuid[], uuid[], timestamptz[], bigint[], bigint[], uuid[], uuid, uuid)
  from public, anon, authenticated, service_role;

-- Prices changed in this transaction: the changes are worked out once per branch, then the customers' announcements (in bulk; one
-- by one, each on its own, if the bulk fails) and the office's. One failing announcement never loses the others.
create or replace function private.flush_price_announcements(tx bigint, actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  branch uuid;
  flush_group uuid := gen_random_uuid();
  rules uuid[];
  km uuid[]; ku uuid[]; ka timestamptz[]; kg uuid[];
  cids uuid[]; ctiers text[];
  ch_c uuid[]; ch_m uuid[]; ch_u uuid[]; ch_at timestamptz[]; ch_old bigint[]; ch_new bigint[];
  grp record;
begin
  -- The save's first new rule: what "Đã báo N khách" after saving looks the announcements up by.
  rules := coalesce((select array[c.rule_id] from private.announcement_rule_change c where c.txid = tx and c.inserted order by c.ord limit 1), '{}');
  for branch in select distinct c.branch_id from private.announcement_rule_change c where c.txid = tx loop
    -- Items whose price may have changed (a customer's material-group rule concerns each material of the group), from the first
    -- day a change takes effect.
    select array_agg(k.material_id order by k.material_id, k.uom_id), array_agg(k.uom_id order by k.material_id, k.uom_id),
      array_agg(k.at order by k.material_id, k.uom_id), array_agg(k.group_id order by k.material_id, k.uom_id)
    into km, ku, ka, kg
    from (
      select x.material_id, x.uom_id, min(x.at) at, (array_agg(x.group_id))[1] group_id from (
        select m.id material_id, c.price_uom_id uom_id, c.at, m.group_id
        from private.announcement_rule_change c join public.materials m on m.id = c.material_id
        where c.txid = tx and c.branch_id = branch and m.active and m.sale_enabled
        union all
        select m.id, c.price_uom_id, c.at, m.group_id
        from private.announcement_rule_change c join public.materials m on m.group_id = c.material_group_id
        where c.txid = tx and c.branch_id = branch and c.material_id is null and m.active and m.sale_enabled
      ) x group by x.material_id, x.uom_id
    ) k;
    continue when km is null;
    -- Customers who receive price announcements: a portal owner or accountant.
    select coalesce(array_agg(c.id order by c.id), '{}'), coalesce(array_agg(c.tier_code order by c.id), '{}') into cids, ctiers
    from public.customers c where c.branch_id = branch and c.active and exists (select 1 from public.customer_portal_memberships m
      where m.customer_id = c.id and m.active and m.membership_role in ('OWNER', 'FINANCE_CONTACT'));
    select array_agg(p.customer_id), array_agg(p.material_id), array_agg(p.uom_id), array_agg(p.at), array_agg(p.old_price), array_agg(p.new_price)
    into ch_c, ch_m, ch_u, ch_at, ch_old, ch_new
    from private.announcement_price_changes(tx, branch, cids, ctiers, km, ku, ka, kg) p;
    continue when ch_c is null;
    -- 1. The customers. Commit time grows with customers × changed items (about 1.5 s per 150 000 lines); far beyond that the commit
    -- could pass the statement time limit and undo the save itself, so the customers are then not told (the office still is).
    if (select count(*) from unnest(ch_c) x where x is not null) > 200000 then
      raise warning 'announcement_too_large: % customer lines, customers not told', (select count(*) from unnest(ch_c) x where x is not null);
    else begin
      perform private.announce_customer_prices(branch, ch_c, ch_m, ch_u, ch_at, ch_old, ch_new, rules, flush_group, actor);
    exception when others then
      raise warning 'announcement_failed: %', sqlerrm;
      for grp in
        select x.c, min(x.at) at, jsonb_agg(jsonb_build_object('key', 'price:' || x.m || ':' || x.u, 'code', m.code, 'name', m.name, 'unit', u.name,
          'old', x.old, 'new', x.new) order by m.name, x.m, x.u) lines
        from unnest(ch_c, ch_m, ch_u, ch_at, ch_old, ch_new) x(c, m, u, at, old, new)
        join public.materials m on m.id = x.m join public.units_of_measure u on u.id = x.u
        where x.c is not null group by x.c, (x.at at time zone 'Asia/Ho_Chi_Minh')::date
      loop
        begin
          perform private.merge_announcement(branch, 'CUSTOMER', 'PRICE', grp.c, grp.at, grp.lines, rules, flush_group, actor);
        exception when others then
          raise warning 'announcement_failed: %', sqlerrm;
        end;
      end loop;
    end; end if;
    -- 2. The office: the common price (after the customers, so it can say how many were told).
    for grp in
      select min(x.at) at, jsonb_agg(jsonb_build_object('key', 'price:' || x.m || ':' || x.u, 'code', m.code, 'name', m.name, 'unit', u.name,
        'old', x.old, 'new', x.new) order by m.name, x.m, x.u) lines
      from unnest(ch_c, ch_m, ch_u, ch_at, ch_old, ch_new) x(c, m, u, at, old, new)
      join public.materials m on m.id = x.m join public.units_of_measure u on u.id = x.u
      where x.c is null group by (x.at at time zone 'Asia/Ho_Chi_Minh')::date
    loop
      begin
        perform private.merge_announcement(branch, 'OFFICE', 'PRICE', null, grp.at, grp.lines, rules, gen_random_uuid(), actor);
      exception when others then
        raise warning 'announcement_failed: %', sqlerrm;
      end;
    end loop;
  end loop;
end $$;
revoke all on function private.flush_price_announcements(bigint, uuid) from public, anon, authenticated, service_role;

create or replace function private.flush_announcements(tx bigint, actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare grp record;
begin
  if exists (select 1 from private.announcement_rule_change c where c.txid = tx) then
    perform private.flush_price_announcements(tx, actor);
  end if;
  -- Workers: the pay rates that changed.
  for grp in
    select s.branch_id, jsonb_agg(jsonb_build_object('key', s.item_key, 'code', s.item_code, 'name', s.item_name, 'unit', s.unit_name,
      'old', s.old_value, 'old_kind', s.old_kind, 'new', s.new_value, 'new_kind', s.new_kind) order by s.item_name, s.item_key) as lines
    from private.announcement_pay_stage s
    where s.txid = tx and (s.old_value, s.old_kind) is distinct from (s.new_value, s.new_kind)
    group by 1 order by 1
  loop
    begin
      perform private.merge_announcement(grp.branch_id, 'WORKER', 'PAY_RATE', null, null, grp.lines, '{}', gen_random_uuid(), actor);
    exception when others then
      raise warning 'announcement_failed: %', sqlerrm;
    end;
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
  delete from private.announcement_rule_change where txid = new.txid;
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
  -- Pushes not handed over yet are cancelled too.
  perform private.announcement_cancel_push(a.id, a.branch_id, a.created_at) from public.announcements a where a.group_id = target_group_id;
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
