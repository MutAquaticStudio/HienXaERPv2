-- D61: materials are assigned to suppliers (the rows of the supplier's purchase price book), and a whole book of prices is
-- saved for one day all or nothing; a same-day change replaces that day's price; purchase-order pricing is untouched.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.units_of_measure(id, code, name, symbol) values
  ('7f328000-0000-4000-8000-000000000001', 'nt_bao328', 'Bao thử 328', 'bao'),
  ('7f328000-0000-4000-8000-000000000002', 'nt_tan328', 'Tấn thử 328', 'tấn'),
  ('7f328000-0000-4000-8000-000000000003', 'nt_khoi328', 'Khối thử 328', 'khối');
insert into public.material_groups(id, code, name) values ('7f328100-0000-4000-8000-000000000001', 'NT_G328', 'Nhóm thử 328');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('7f328200-0000-4000-8000-000000000001', '7f328100-0000-4000-8000-000000000001', 'NT_XM328', 'Xi măng thử 328', '7f328000-0000-4000-8000-000000000001'),
  ('7f328200-0000-4000-8000-000000000002', '7f328100-0000-4000-8000-000000000001', 'NT_CAT328', 'Cát thử 328', '7f328000-0000-4000-8000-000000000003');
insert into public.material_uom_conversions(material_id, from_uom_id, to_uom_id, numerator, denominator, conversion_type, settlement_allowed) values
  ('7f328200-0000-4000-8000-000000000001', '7f328000-0000-4000-8000-000000000002', '7f328000-0000-4000-8000-000000000001', 20, 1, 'PACKAGING', true);
insert into public.suppliers(id, branch_id, code, name) values
  ('7f328300-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_NCC328A', 'NCC thử 328 A'),
  ('7f328300-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_NCC328B', 'NCC thử 328 B'),
  ('7f328300-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000b', 'NT_NCC328C', 'NCC chi nhánh B');
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  a constant uuid := '7f328300-0000-4000-8000-000000000001';
  b constant uuid := '7f328300-0000-4000-8000-000000000002';
  other constant uuid := '7f328300-0000-4000-8000-000000000003';
  cement constant uuid := '7f328200-0000-4000-8000-000000000001';
  sand constant uuid := '7f328200-0000-4000-8000-000000000002';
  bao constant uuid := '7f328000-0000-4000-8000-000000000001';
  tan constant uuid := '7f328000-0000-4000-8000-000000000002';
  khoi constant uuid := '7f328000-0000-4000-8000-000000000003';
  today constant timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
  result jsonb;
  first_rule uuid;
  failed text;
begin
  -- Assigning needs the purchase-price right; a reader is refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.set_supplier_material_assignments(branch, jsonb_build_array(jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', bao)), '7f328400-0000-4000-8000-000000000001');
  exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'a reader cannot assign';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  -- A unit the material is not bought in is refused; tấn (a settlement conversion of cement) is fine.
  failed := null;
  begin perform public.set_supplier_material_assignments(branch, jsonb_build_array(jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', khoi)), '7f328400-0000-4000-8000-000000000002');
  exception when others then failed := sqlerrm; end;
  assert failed = 'material_or_uom_invalid', format('wrong unit refused, got %s', failed);
  -- Another branch's supplier is refused.
  failed := null;
  begin perform public.set_supplier_material_assignments(branch, jsonb_build_array(jsonb_build_object('supplier_id', other, 'material_id', cement, 'purchase_uom_id', bao)), '7f328400-0000-4000-8000-000000000003');
  exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'another branch supplier refused';

  result := public.set_supplier_material_assignments(branch, jsonb_build_array(
    jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', tan),
    jsonb_build_object('supplier_id', a, 'material_id', sand, 'purchase_uom_id', khoi),
    jsonb_build_object('supplier_id', b, 'material_id', cement, 'purchase_uom_id', bao)), '7f328400-0000-4000-8000-000000000004');
  assert (result->>'count')::int = 3, 'three assignments';
  assert (public.set_supplier_material_assignments(branch, jsonb_build_array(
    jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', tan),
    jsonb_build_object('supplier_id', a, 'material_id', sand, 'purchase_uom_id', khoi),
    jsonb_build_object('supplier_id', b, 'material_id', cement, 'purchase_uom_id', bao)), '7f328400-0000-4000-8000-000000000004')->>'replayed')::boolean, 'replay';
  assert (select count(*) from public.supplier_materials where supplier_id in (a, b) and active) = 3, 'stored';

  -- A book of prices for supplier A, one day, all or nothing: a bad line saves none.
  failed := null;
  begin perform public.save_purchase_price_book(branch, jsonb_build_array(
      jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', tan, 'unit_cost_vnd', '1700000'),
      jsonb_build_object('supplier_id', a, 'material_id', sand, 'purchase_uom_id', khoi, 'unit_cost_vnd', '0')), today, 'Giá mua hôm nay', '7f328400-0000-4000-8000-000000000010');
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_price', format('a zero price refuses the whole book, got %s', failed);
  assert not exists (select 1 from public.purchase_price_rules where supplier_id = a), 'nothing saved from the refused book';

  result := public.save_purchase_price_book(branch, jsonb_build_array(
    jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', tan, 'unit_cost_vnd', '1700000'),
    jsonb_build_object('supplier_id', a, 'material_id', sand, 'purchase_uom_id', khoi, 'unit_cost_vnd', '420000')), today, 'Giá mua hôm nay', '7f328400-0000-4000-8000-000000000011');
  assert (result->>'count')::int = 2, 'two prices';
  first_rule := (result->'rule_ids'->>0)::uuid;
  assert (select unit_cost_vnd from public.purchase_price_rules where id = first_rule) = 1700000, 'price stored';
  assert (public.save_purchase_price_book(branch, jsonb_build_array(
    jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', tan, 'unit_cost_vnd', '1700000'),
    jsonb_build_object('supplier_id', a, 'material_id', sand, 'purchase_uom_id', khoi, 'unit_cost_vnd', '420000')), today, 'Giá mua hôm nay', '7f328400-0000-4000-8000-000000000011')->>'replayed')::boolean,
    'a replay changes nothing';
  assert (select count(*) from public.purchase_price_rules where supplier_id = a) = 2, 'no duplicate on replay';

  -- Same day, a new price replaces that day's price; the old one stops.
  result := public.save_purchase_price_book(branch, jsonb_build_array(
    jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', tan, 'unit_cost_vnd', '1750000', 'supersedes_id', first_rule, 'expected_version', 1)),
    today, 'Giá mua chiều', '7f328400-0000-4000-8000-000000000012');
  assert (select count(*) from public.purchase_price_rules where supplier_id = a and material_id = cement and active) = 1, 'one active price for the day';
  assert (select unit_cost_vnd from public.purchase_price_rules where supplier_id = a and material_id = cement and active) = 1750000, 'the later price wins';
  -- A stale version is refused.
  failed := null;
  begin perform public.save_purchase_price_book(branch, jsonb_build_array(
      jsonb_build_object('supplier_id', a, 'material_id', cement, 'purchase_uom_id', tan, 'unit_cost_vnd', '1800000', 'supersedes_id', first_rule, 'expected_version', 1)),
      today, 'Giá cũ', '7f328400-0000-4000-8000-000000000013');
  exception when others then failed := sqlerrm; end;
  assert failed = 'stale_price_rule', format('stale version refused, got %s', failed);

  -- A price for a pair not assigned yet assigns it; unassigning keeps the prices.
  perform public.save_purchase_price_book(branch, jsonb_build_array(
    jsonb_build_object('supplier_id', b, 'material_id', sand, 'purchase_uom_id', khoi, 'unit_cost_vnd', '400000')), today, 'Giá NCC B', '7f328400-0000-4000-8000-000000000014');
  assert exists (select 1 from public.supplier_materials where supplier_id = b and material_id = sand and active), 'pricing assigns';
  perform public.set_supplier_material_assignments(branch, jsonb_build_array(jsonb_build_object('supplier_id', b, 'material_id', sand, 'active', false)), '7f328400-0000-4000-8000-000000000015');
  assert not (select active from public.supplier_materials where supplier_id = b and material_id = sand), 'unassigned';
  assert exists (select 1 from public.purchase_price_rules where supplier_id = b and material_id = sand and active), 'its price stays';
  assert exists (select 1 from public.audit_events where action = 'purchase_pricing.save_book'), 'book save audited';
  assert exists (select 1 from public.audit_events where action = 'supplier_material.unassigned'), 'unassign audited';

  -- A reader of the branch sees the assignments; another branch does not.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  assert not exists (select 1 from public.supplier_materials where supplier_id = a), 'another branch reads nothing';
  perform pg_temp.act_as_admin();
end $$;

do $$ begin
  assert not has_table_privilege('anon', 'public.supplier_materials', 'SELECT'), 'anon cannot read assignments';
  assert not has_function_privilege('anon', 'public.save_purchase_price_book(uuid, jsonb, timestamptz, text, uuid)', 'EXECUTE'), 'anon cannot save prices';
end $$;
