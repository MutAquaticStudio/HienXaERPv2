-- D56: one search box finds the branch's customers, sites, suppliers and materials, accent-free and by phone,
-- and only in the groups the caller may read.
insert into public.customers(id, branch_id, code, display_name, phone) values
  ('7e560000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'KH-AP', 'Công ty TNHH Xây dựng An Phát', '0912 345 678'),
  ('7e560000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000b', 'KH-AP2', 'An Phát chi nhánh B', '0912 000 111');
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_phone) values
  ('7e560000-0000-4000-8000-000000000011', '7e560000-0000-4000-8000-000000000001', 'CT-ST', 'Nhà xưởng Sóng Thần', 'KCN Sóng Thần, Dĩ An', '0987 654 321');
insert into public.suppliers(id, branch_id, code, name, phone) values
  ('7e560000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-00000000000a', 'NCC-PT', 'Công ty VLXD Phú Thành', '0283 111 222');

do $$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  found jsonb;
  failed text;
begin
  assert private.search_fold('Xây Dựng ĐẠI PHÁT') = 'xay dung dai phat', private.search_fold('Xây Dựng ĐẠI PHÁT');
  -- Decomposed marks (NFD) fold the same.
  assert private.search_fold(normalize('Sóng Thần', NFD)) = 'song than', 'NFD input folds too';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  found := public.global_search(branch, 'an phat');
  assert jsonb_array_length(found->'customers') = 1, format('one customer of this branch: %s', found);
  assert found->'customers'->0->>'code' = 'KH-AP', 'the branch A customer, not branch B';
  found := public.global_search(branch, 'song than');
  assert found->'sites'->0->>'customer_name' = 'Công ty TNHH Xây dựng An Phát', format('site found without marks: %s', found);
  found := public.global_search(branch, '0912345');
  assert found->'customers'->0->>'code' = 'KH-AP', format('found by phone digits: %s', found);
  found := public.global_search(branch, '654 321');
  assert jsonb_array_length(found->'sites') = 1, 'site found by receiver phone';
  found := public.global_search(branch, 'phu thanh');
  assert found->'suppliers'->0->>'code' = 'NCC-PT', 'supplier found';
  assert public.global_search(branch, 'a') = '{}'::jsonb, 'one letter searches nothing';

  -- A reader with orders.read only gets the order groups, never customers or suppliers.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  found := public.global_search(branch, 'an phat');
  assert not found ? 'customers' and not found ? 'suppliers' and found ? 'orders', format('reader sees only orders: %s', found);

  -- Not a member of the branch: refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.global_search(branch, 'an phat'); exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'another branch cannot search this one';
end $$;

do $$ begin
  assert not has_function_privilege('anon', 'public.global_search(uuid, text)', 'EXECUTE'), 'anon cannot search';
end $$;
