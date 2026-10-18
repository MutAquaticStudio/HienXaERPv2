-- FB6: the portal catalog names the variants of one product ("hàng cùng loại") so the customer can pick and switch them,
-- without reading the employee-only variant tables; materials outside a group carry no variant; search finds a group by name.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id, email) values ('7f230000-0000-4000-8000-0000000000a1', 'chu230@example.test');
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f230000-0000-4000-8000-000000000001', 'nt_kg230', 'Kilôgam thử 230', 'kg'),
  ('7f230000-0000-4000-8000-000000000002', 'nt_bao230', 'Bao thử 230', 'bao');
insert into public.material_groups(id, code, name) values ('7f230000-0000-4000-8000-000000000005', 'NT_G230', 'Xi măng thử 230');
insert into public.material_variant_groups(id, name, attribute_names) values
  ('7f230000-0000-4000-8000-000000000006', 'Xi măng Bút Sơn 230', array['Mác', 'Màu']);
insert into public.materials(id, group_id, code, name, base_uom_id, variant_group_id, variant_attributes) values
  ('7f230000-0000-4000-8000-000000000010', '7f230000-0000-4000-8000-000000000005', 'NT_BS30_230', 'Xi măng Bút Sơn PCB30 230', '7f230000-0000-4000-8000-000000000001',
   '7f230000-0000-4000-8000-000000000006', '{"Mác": "PCB30", "Màu": "Xám"}'),
  ('7f230000-0000-4000-8000-000000000011', '7f230000-0000-4000-8000-000000000005', 'NT_BS40_230', 'Xi măng Bút Sơn PCB40 230', '7f230000-0000-4000-8000-000000000001',
   '7f230000-0000-4000-8000-000000000006', '{"Màu": "Xám", "Mác": "PCB40"}'),
  ('7f230000-0000-4000-8000-000000000012', '7f230000-0000-4000-8000-000000000005', 'NT_TT_230', 'Xi măng trắng lẻ 230', '7f230000-0000-4000-8000-000000000001', null, null);
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type)
select m, '7f230000-0000-4000-8000-000000000002', '7f230000-0000-4000-8000-000000000001', 50, 1, 'PACKAGING'
from unnest(array['7f230000-0000-4000-8000-000000000010', '7f230000-0000-4000-8000-000000000011', '7f230000-0000-4000-8000-000000000012']::uuid[]) m;
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f230000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_KH230', 'Khách 230', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f230000-0000-4000-8000-000000000041', '7f230000-0000-4000-8000-000000000040', 'CT1', 'Công trình 230', 'Địa chỉ 230');
insert into public.pricing_rules(branch_id, scope_type, material_id, price_uom_id, unit_price_vnd, version, source_type, effective_from, created_by)
select '20000000-0000-4000-8000-00000000000a', 'DEFAULT', m.id, '7f230000-0000-4000-8000-000000000002', m.price, 1, 'LIST', now() - interval '1 day', '10000000-0000-4000-8000-000000000001'
from (values ('7f230000-0000-4000-8000-000000000010'::uuid, 80000), ('7f230000-0000-4000-8000-000000000011'::uuid, 90000), ('7f230000-0000-4000-8000-000000000012'::uuid, 120000)) m(id, price);
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f230000-0000-4000-8000-0000000000a1', '7f230000-0000-4000-8000-000000000040', 'OWNER');

do $test$
declare
  items jsonb;
  found jsonb;
  failed boolean;
begin
  perform pg_temp.act_as('7f230000-0000-4000-8000-0000000000a1');
  items := (select jsonb_agg(i) from jsonb_array_elements(public.customer_portal_catalog(null, null, 200)->'items') i where i->>'code' like 'NT_%230');
  assert jsonb_array_length(items) = 3, format('three offers %s', items);
  assert exists (select 1 from jsonb_array_elements(items) i where i->>'code' = 'NT_BS30_230' and i->>'variant_group_id' = '7f230000-0000-4000-8000-000000000006'
    and i->>'variant_name' = 'Xi măng Bút Sơn 230' and i->>'variant_label' = 'Mác: PCB30 · Màu: Xám' and i->>'unit_price_vnd' = '80000'), 'variant named, attributes in the group order';
  assert exists (select 1 from jsonb_array_elements(items) i where i->>'code' = 'NT_BS40_230' and i->>'variant_label' = 'Mác: PCB40 · Màu: Xám'
    and i->>'unit_price_vnd' = '90000'), 'second variant at its own price';
  assert exists (select 1 from jsonb_array_elements(items) i where i->>'code' = 'NT_TT_230' and i->'variant_group_id' = 'null'::jsonb
    and i->'variant_label' = 'null'::jsonb), 'a material outside a group has no variant';
  -- Variants of one product come together, in the product's place.
  assert (select string_agg(i->>'code', ',' order by n) from jsonb_array_elements(items) with ordinality e(i, n)) = 'NT_BS30_230,NT_BS40_230,NT_TT_230', 'variants together';

  -- Searching by the product's group name finds every variant.
  found := (select jsonb_agg(i) from jsonb_array_elements(public.customer_portal_catalog(null, 'bút sơn 230', 60)->'items') i);
  assert jsonb_array_length(found) = 2, format('search by variant group %s', found);

  -- An inactive group is no longer shown as a group; the materials stay on sale.
  perform pg_temp.act_as_admin();
  update public.material_variant_groups set active = false where id = '7f230000-0000-4000-8000-000000000006';
  perform pg_temp.act_as('7f230000-0000-4000-8000-0000000000a1');
  assert not exists (select 1 from jsonb_array_elements(public.customer_portal_catalog(null, null, 200)->'items') i
    where i->>'code' like 'NT_BS%230' and i->>'variant_group_id' is not null), 'inactive group hidden';

  -- Still no costs or stock numbers, still forbidden to anonymous callers.
  assert not (public.customer_portal_catalog(null, null, 200)::text like '%cost%'), 'no costs';
  perform pg_temp.act_as_admin();
  set local role anon;
  failed := false; begin perform public.customer_portal_catalog(null, null, 60); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon catalog';
  reset role;
end
$test$;
