-- FB2-D2: save_material_units adds/stops selling units and sets their general prices in one all-or-nothing command.
insert into public.units_of_measure(id, code, name, symbol) values
  ('70000000-0000-4000-8000-000000000011', 'nt_kg', 'Kilôgam thử', 'kg'),
  ('70000000-0000-4000-8000-000000000012', 'nt_bao2', 'Bao thử', 'bao'),
  ('70000000-0000-4000-8000-000000000013', 'nt_tan', 'Tấn thử', 'tấn'),
  ('70000000-0000-4000-8000-000000000014', 'nt_cay', 'Cây thử', 'cây');
insert into public.material_groups(id, code, name) values ('71000000-0000-4000-8000-000000000011', 'NT_G2', 'Nhóm thử 2');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('72000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000011', 'NT_XM', 'Xi măng thử', '70000000-0000-4000-8000-000000000011');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  other_branch constant uuid := '20000000-0000-4000-8000-00000000000b';
  kg constant uuid := '70000000-0000-4000-8000-000000000011';
  bao constant uuid := '70000000-0000-4000-8000-000000000012';
  tan constant uuid := '70000000-0000-4000-8000-000000000013';
  cay constant uuid := '70000000-0000-4000-8000-000000000014';
  xm constant uuid := '72000000-0000-4000-8000-000000000011';
  op constant uuid := '75000000-0000-4000-8000-000000000001';
  applies timestamptz := date_trunc('day', now());
  add_units jsonb;
  prices jsonb;
  result jsonb;
  failed text;
  bao_conversion uuid;
  conversions_before integer;
begin
  add_units := jsonb_build_array(
    jsonb_build_object('uom_id', bao, 'numerator', 50, 'denominator', 1, 'conversion_type', 'PACKAGING'),
    jsonb_build_object('uom_id', tan, 'numerator', 1000, 'conversion_type', 'EXACT'));
  prices := jsonb_build_array(
    jsonb_build_object('price_uom_id', kg, 'unit_price_vnd', 6000),
    jsonb_build_object('price_uom_id', bao, 'unit_price_vnd', 300000),
    jsonb_build_object('price_uom_id', tan, 'unit_price_vnd', 6000000));

  -- Read-only and other-branch actors cannot change units.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_material_units(branch, xm, add_units, '[]', '[]', null, 'Thêm đơn vị', '75000000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.save_material_units(branch, xm, add_units, '[]', '[]', null, 'Thêm đơn vị', '75000000-0000-4000-8000-0000000000a2');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch must be refused, got %s', failed);

  -- A price for a unit the material cannot be sold in fails the whole command: no unit is left behind.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_units(branch, xm, add_units, '[]', prices || jsonb_build_array(jsonb_build_object('price_uom_id', cay, 'unit_price_vnd', 1)),
      applies, 'Thêm đơn vị', '75000000-0000-4000-8000-0000000000a3');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('unsellable price unit must fail, got %s', failed);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.material_uom_conversions where material_id = xm), 'no partial conversion after a failed command';

  -- Estimated units need a source note; ratios beyond 6 decimals are refused, not rounded.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_units(branch, xm, jsonb_build_array(jsonb_build_object('uom_id', cay, 'numerator', 7.22, 'conversion_type', 'ESTIMATED')),
      '[]', '[]', null, 'Thêm cây', '75000000-0000-4000-8000-0000000000a4');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('estimated unit without note must fail, got %s', failed);
  failed := null;
  begin perform public.save_material_units(branch, xm, jsonb_build_array(jsonb_build_object('uom_id', cay, 'numerator', 7.2222222, 'conversion_type', 'EXACT')),
      '[]', '[]', null, 'Thêm cây', '75000000-0000-4000-8000-0000000000a5');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('ratio beyond 6 decimals must fail, got %s', failed);

  -- Units and their prices are saved together.
  result := public.save_material_units(branch, xm, add_units, '[]', prices, applies, 'Thêm đơn vị', op);
  assert (result->>'replayed')::boolean = false and jsonb_array_length(result->'conversion_ids') = 2
    and jsonb_array_length(result->'price_rule_ids') = 3, format('result %s', result);
  perform pg_temp.act_as_admin();
  select id into bao_conversion from public.material_uom_conversions where material_id = xm and from_uom_id = bao and active;
  assert (select numerator / denominator from public.material_uom_conversions where id = bao_conversion) = 50, '1 bao = 50 kg';
  assert (select to_uom_id from public.material_uom_conversions where id = bao_conversion) = kg, 'units convert to the base unit';
  assert (select settlement_allowed from public.material_uom_conversions where id = bao_conversion), 'selling units can be billed';
  assert (select count(*) from public.pricing_rules where material_id = xm and scope_type = 'DEFAULT' and active) = 3, 'one general price per unit';
  assert (select unit_price_vnd from public.pricing_rules where material_id = xm and price_uom_id = tan) = 6000000, 'tấn price saved';
  assert (select count(*) from public.audit_events where action = 'catalog.save_units' and trace_id = op) = 1, 'one command audit event';
  conversions_before := (select count(*) from public.material_uom_conversions where material_id = xm);

  -- Same operation and payload replays; a different payload under the same operation is a conflict.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.save_material_units(branch, xm, add_units, '[]', prices, applies, 'Thêm đơn vị', op);
  assert (result->>'replayed')::boolean, 'repeat is a replay';
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.material_uom_conversions where material_id = xm) = conversions_before, 'replay writes nothing';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_units(branch, xm, add_units, '[]', prices, applies, 'Lý do khác', op);
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict expected, got %s', failed);

  -- Adding a unit that already exists is refused; replacing it means stopping the old ratio in the same command.
  -- (Real saves run in separate transactions; move the first save back so the new version gets a later start.)
  perform pg_temp.act_as_admin();
  update public.material_uom_conversions set effective_from = effective_from - interval '1 day' where material_id = xm;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_units(branch, xm, jsonb_build_array(jsonb_build_object('uom_id', bao, 'numerator', 40, 'conversion_type', 'PACKAGING')),
      '[]', '[]', null, 'Đổi bao', '75000000-0000-4000-8000-0000000000a6');
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('duplicate unit must fail, got %s', failed);
  result := public.save_material_units(branch, xm, jsonb_build_array(jsonb_build_object('uom_id', bao, 'numerator', 40, 'conversion_type', 'PACKAGING')),
    jsonb_build_array(bao_conversion), '[]', null, 'Đổi sang bao 40 kg', '75000000-0000-4000-8000-0000000000a7');
  perform pg_temp.act_as_admin();
  assert not (select active from public.material_uom_conversions where id = bao_conversion), 'old ratio stopped, not edited';
  assert (select numerator from public.material_uom_conversions where id = bao_conversion) = 50, 'old ratio kept for history';
  assert (select numerator from public.material_uom_conversions where material_id = xm and from_uom_id = bao and active) = 40, 'new ratio active';

  -- Stopping a conversion of another material is refused.
  insert into public.materials(id, group_id, code, name, base_uom_id) values
    ('72000000-0000-4000-8000-000000000012', '71000000-0000-4000-8000-000000000011', 'NT_XM2', 'Xi măng thử 2', kg);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_units(branch, '72000000-0000-4000-8000-000000000012', '[]', jsonb_build_array(bao_conversion), '[]', null, 'Ngừng nhầm', '75000000-0000-4000-8000-0000000000a8');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('foreign conversion must be refused, got %s', failed);

  -- Anonymous callers cannot execute the command at all.
  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.save_material_units(uuid, uuid, jsonb, jsonb, jsonb, timestamptz, text, uuid)', 'execute'), 'anon cannot execute';
end
$test$;
