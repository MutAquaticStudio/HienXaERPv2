-- D83 at scale (review 16/11/2026): a whole common price list for many portal customers. The save only records each changed rule
-- (no price work per row); at commit every price is worked out ONCE, set-based, and the customers' announcements are written in
-- bulk, not one statement per customer or per item. Guards against the per-row / per-customer slowness found in review.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values ('7f348100-0000-4000-8000-000000000001', 'nt_bao3481', 'Bao thử 3481', 'bao');
insert into public.material_groups(id, code, name) values ('7f348100-0000-4000-8000-000000000002', 'NT_G3481', 'Nhóm thử 3481');
insert into public.materials(id, group_id, code, name, base_uom_id)
  select md5('nt348m' || g)::uuid, '7f348100-0000-4000-8000-000000000002', 'NT_M3481_' || g, 'Vật tư thử ' || g, '7f348100-0000-4000-8000-000000000001'
  from generate_series(1, 120) g;
insert into public.customers(id, branch_id, code, display_name, customer_type)
  select md5('nt348c' || g)::uuid, '20000000-0000-4000-8000-00000000000a', 'NT_C3481_' || g, 'Khách thử ' || g, 'BUSINESS' from generate_series(1, 60) g;
insert into auth.users(id) select md5('nt348u' || g)::uuid from generate_series(1, 60) g;
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role)
  select md5('nt348u' || g)::uuid, md5('nt348c' || g)::uuid, 'OWNER' from generate_series(1, 60) g;
insert into public.pricing_rules(branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by)
  select '20000000-0000-4000-8000-00000000000a', 'DEFAULT', md5('nt348m' || g)::uuid, '7f348100-0000-4000-8000-000000000001', 10000 + g, 1, 'LIST',
    now() - interval '1 day', '10000000-0000-4000-8000-000000000001' from generate_series(1, 120) g;
-- Each customer has its own price for two items: those two do not change for it.
insert into public.pricing_rules(branch_id, scope_type, customer_id, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by)
  select '20000000-0000-4000-8000-00000000000a', 'CUSTOMER_MATERIAL', md5('nt348c' || c)::uuid, md5('nt348m' || ((c + k) % 120 + 1))::uuid,
    '7f348100-0000-4000-8000-000000000001', 9000, 1, 'CONTRACT', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'
  from generate_series(1, 60) c, generate_series(0, 1) k;
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  owner constant uuid := '10000000-0000-4000-8000-000000000001';
  items jsonb;
  started timestamptz;
  save_ms numeric;
  flush_ms numeric;
  calls_before jsonb;
  calls jsonb;
begin
  set constraints all immediate;
  set constraints all deferred;
  set local track_functions = 'all';
  select jsonb_agg(jsonb_build_object('material_id', md5('nt348m' || g)::uuid, 'price_uom_id', '7f348100-0000-4000-8000-000000000001',
    'unit_price_vnd', 20000 + g, 'supersedes_id', (select p.id from public.pricing_rules p where p.scope_type = 'DEFAULT' and p.material_id = md5('nt348m' || g)::uuid),
    'expected_version', 1)) into items from generate_series(1, 120) g;
  select coalesce(jsonb_object_agg(f.funcname, f.calls), '{}') into calls_before from pg_stat_xact_user_functions f where f.schemaname = 'private';

  perform pg_temp.act_as(owner);
  started := clock_timestamp();
  perform public.save_pricing_rules_batch(branch, items, date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh',
    'Bảng giá mới', '7f348100-0000-4000-8000-000000000101');
  save_ms := extract(epoch from clock_timestamp() - started) * 1000;
  perform pg_temp.act_as_admin();
  select coalesce(jsonb_object_agg(f.funcname, f.calls), '{}') into calls from pg_stat_xact_user_functions f where f.schemaname = 'private';
  assert coalesce((calls->>'announcement_price_changes')::integer, 0) = coalesce((calls_before->>'announcement_price_changes')::integer, 0),
    'no price is worked out inside the save';
  assert (calls->>'announce_price_rule_change')::integer - coalesce((calls_before->>'announce_price_rule_change')::integer, 0) = 240,
    'one light trigger call per changed rule row (120 replaced + 120 new)';

  calls_before := calls;
  started := clock_timestamp();
  set constraints all immediate;
  flush_ms := extract(epoch from clock_timestamp() - started) * 1000;
  set constraints all deferred;
  select coalesce(jsonb_object_agg(f.funcname, f.calls), '{}') into calls from pg_stat_xact_user_functions f where f.schemaname = 'private';
  assert (calls->>'announcement_price_changes')::integer - coalesce((calls_before->>'announcement_price_changes')::integer, 0) = 1,
    'prices worked out once per commit, not per item or per customer';
  assert (calls->>'announce_customer_prices')::integer - coalesce((calls_before->>'announce_customer_prices')::integer, 0) = 1,
    'all customers'' announcements in one pass';
  assert (calls->>'merge_announcement')::integer - coalesce((calls_before->>'merge_announcement')::integer, 0) = 1, 'one by one only for the office';

  -- Every customer told, each without its two own prices; the office about all 120.
  assert (select count(*) from public.announcements where audience = 'CUSTOMER' and kind = 'PRICE') = 60, 'sixty customers';
  assert (select count(*) from public.announcement_lines l join public.announcements a on a.id = l.announcement_id where a.audience = 'CUSTOMER') = 60 * 118,
    'their own lines only';
  assert (select count(*) from public.announcement_lines l join public.announcements a on a.id = l.announcement_id where a.audience = 'OFFICE') = 120, 'office';
  assert (select count(distinct body) from public.announcements where audience = 'CUSTOMER') = 1
    and (select body from public.announcements where audience = 'CUSTOMER' limit 1) like 'Cửa hàng điều chỉnh giá 118 mặt hàng của bạn.%', 'text per customer';

  -- Generous bounds (the review measured 60 s+ before): both stay far below the 8 s statement limit.
  assert save_ms < 3000, format('save took %s ms', round(save_ms));
  assert flush_ms < 3000, format('commit work took %s ms', round(flush_ms));
end
$test$;
