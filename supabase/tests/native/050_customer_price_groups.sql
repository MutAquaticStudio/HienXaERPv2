-- FB2-D2: customer price groups are a per-branch catalog; codes are enforced by foreign keys and the price book
-- saves group prices through save_pricing_rules_batch.
insert into public.units_of_measure(id, code, name, symbol) values ('70000000-0000-4000-8000-000000000021', 'nt_bao3', 'Bao thử 3', 'bao');
insert into public.material_groups(id, code, name) values ('71000000-0000-4000-8000-000000000021', 'NT_G3', 'Nhóm thử 3');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('72000000-0000-4000-8000-000000000021', '71000000-0000-4000-8000-000000000021', 'NT_GM', 'Vật tư nhóm giá', '70000000-0000-4000-8000-000000000021');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  other_branch constant uuid := '20000000-0000-4000-8000-00000000000b';
  bao constant uuid := '70000000-0000-4000-8000-000000000021';
  material constant uuid := '72000000-0000-4000-8000-000000000021';
  customer constant uuid := '76000000-0000-4000-8000-000000000001';
  applies timestamptz := date_trunc('day', now());
  result jsonb;
  failed text;
begin
  -- Only pricing managers define groups, and new codes are upper-case.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_customer_price_group(branch, 'SI', 'Khách sỉ', true, 'Tạo nhóm sỉ', '77000000-0000-4000-8000-000000000001');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_customer_price_group(branch, 'si', 'Khách sỉ', true, 'Tạo nhóm sỉ', '77000000-0000-4000-8000-000000000002');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('lower-case code must be refused, got %s', failed);
  assert public.save_customer_price_group(branch, 'SI', 'Khách sỉ', true, 'Tạo nhóm sỉ', '77000000-0000-4000-8000-000000000003') = 'SI', 'group created';
  assert public.save_customer_price_group(branch, 'SI', 'Khách sỉ', true, 'Tạo nhóm sỉ', '77000000-0000-4000-8000-000000000003') = 'SI', 'replay returns the code';
  perform public.save_customer_price_group(branch, 'DAILY', 'Đại lý', true, 'Tạo nhóm đại lý', '77000000-0000-4000-8000-000000000004');
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.customer_price_groups where branch_id = branch and code in ('SI', 'DAILY')) = 2, 'two groups';
  assert (select count(*) from public.audit_events where action = 'pricing.group_create' and branch_id = branch) = 2, 'one audit event per new group';

  -- A customer can only carry a code that is a group of its own branch.
  insert into public.customers(id, branch_id, code, display_name, customer_type, tier_code) values (customer, branch, 'NT_KH_SI', 'Khách sỉ thử', 'BUSINESS', 'SI');
  failed := null;
  begin update public.customers set tier_code = 'KHONG_CO' where id = customer;
  exception when others then failed := sqlstate; end;
  assert failed = '23503', format('unknown group must be refused, got %s', failed);
  failed := null;
  begin insert into public.customers(id, branch_id, code, display_name, customer_type, tier_code) values ('76000000-0000-4000-8000-000000000002', other_branch, 'NT_KH_B', 'Khách chi nhánh B', 'BUSINESS', 'SI');
  exception when others then failed := sqlstate; end;
  assert failed = '23503', format('group of another branch must be refused, got %s', failed);

  -- The price book saves a group price next to the general price, in one batch.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.save_pricing_rules_batch(branch, jsonb_build_array(
      jsonb_build_object('material_id', material, 'price_uom_id', bao, 'unit_price_vnd', 100000),
      jsonb_build_object('material_id', material, 'price_uom_id', bao, 'unit_price_vnd', 92000, 'customer_tier_code', 'SI')),
    applies, 'Giá chung và giá sỉ', '77000000-0000-4000-8000-000000000005');
  perform pg_temp.act_as_admin();
  assert (select scope_type || ':' || unit_price_vnd from public.pricing_rules where id = (result->'rule_ids'->>1)::uuid) = 'CUSTOMER_TIER:92000', 'group price saved';
  assert (select customer_tier_code from public.pricing_rules where id = (result->'rule_ids'->>1)::uuid) = 'SI', 'group price carries the code';

  -- Changing the group price supersedes the group rule, never the general one.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_pricing_rules_batch(branch, jsonb_build_array(jsonb_build_object('material_id', material, 'price_uom_id', bao, 'unit_price_vnd', 90000,
      'customer_tier_code', 'SI', 'supersedes_id', result->'rule_ids'->>0, 'expected_version', 1)), applies, 'Sai phạm vi', '77000000-0000-4000-8000-000000000006');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('group item must not supersede the general rule, got %s', failed);

  -- A stopped group takes no new prices.
  perform public.save_customer_price_group(branch, 'DAILY', 'Đại lý', false, 'Tạm ngừng nhóm', '77000000-0000-4000-8000-000000000007');
  failed := null;
  begin perform public.save_pricing_rules_batch(branch, jsonb_build_array(jsonb_build_object('material_id', material, 'price_uom_id', bao, 'unit_price_vnd', 85000,
      'customer_tier_code', 'DAILY')), applies, 'Giá đại lý', '77000000-0000-4000-8000-000000000008');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('inactive group must be refused, got %s', failed);

  perform pg_temp.act_as_admin();
  assert not has_table_privilege('anon', 'public.customer_price_groups', 'select'), 'anon cannot read groups';
  assert not has_table_privilege('authenticated', 'public.customer_price_groups', 'insert'), 'groups are written only through the command';
end
$test$;
