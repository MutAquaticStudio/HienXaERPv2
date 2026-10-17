-- FB2-D2b: save_material_variant_group creates "hàng cùng loại" with full-material variants in one command.
insert into public.units_of_measure(id, code, name, symbol) values
  ('70000000-0000-4000-8000-000000000021', 'nt_kg3', 'Kilôgam thử 3', 'kg'),
  ('70000000-0000-4000-8000-000000000022', 'nt_bao3', 'Bao thử 3', 'bao'),
  ('70000000-0000-4000-8000-000000000023', 'nt_cay3', 'Cây thử 3', 'cây');
insert into public.material_groups(id, code, name) values ('71000000-0000-4000-8000-000000000021', 'NT_G3', 'Nhóm thử 3');
insert into public.materials(id, group_id, code, name, base_uom_id) values
  ('72000000-0000-4000-8000-000000000021', '71000000-0000-4000-8000-000000000021', 'NT_OLD', 'Xi măng cũ', '70000000-0000-4000-8000-000000000021'),
  ('72000000-0000-4000-8000-000000000022', '71000000-0000-4000-8000-000000000021', 'NT_OFF', 'Vật tư ngừng', '70000000-0000-4000-8000-000000000021');
update public.materials set active = false where id = '72000000-0000-4000-8000-000000000022';

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  kg constant uuid := '70000000-0000-4000-8000-000000000021';
  bao constant uuid := '70000000-0000-4000-8000-000000000022';
  material_group constant uuid := '71000000-0000-4000-8000-000000000021';
  old_material constant uuid := '72000000-0000-4000-8000-000000000021';
  inactive_material constant uuid := '72000000-0000-4000-8000-000000000022';
  bs constant uuid := '76000000-0000-4000-8000-000000000001';
  op constant uuid := '77000000-0000-4000-8000-000000000001';
  applies timestamptz := date_trunc('day', now());
  template jsonb;
  variants jsonb;
  result jsonb;
  failed text;
  pcb30 uuid;
  pcb40 uuid;
  materials_before integer;
begin
  template := jsonb_build_object('group_id', material_group, 'base_uom_id', kg, 'sale_enabled', true, 'purchase_enabled', true,
    'units', jsonb_build_array(jsonb_build_object('uom_id', bao, 'numerator', 50, 'conversion_type', 'PACKAGING')));
  variants := jsonb_build_array(
    jsonb_build_object('attributes', jsonb_build_object('Mác', 'PCB30'), 'code', 'nt_bs30', 'name', 'Xi măng Bút Sơn PCB30',
      'prices', jsonb_build_array(jsonb_build_object('price_uom_id', bao, 'unit_price_vnd', 90000))),
    jsonb_build_object('attributes', jsonb_build_object('Mác', ' PCB40 '), 'code', 'NT_BS40', 'name', 'Xi măng Bút Sơn PCB40'));

  -- Read-only actors cannot create groups.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác')),
      null, template, variants, applies, 'Tạo hàng cùng loại', '77000000-0000-4000-8000-0000000000a1');
  exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);

  -- A variant whose attributes do not match the group fails the whole command: nothing is created.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác')),
      null, template, variants || jsonb_build_array(jsonb_build_object('attributes', jsonb_build_object('Màu', 'Xám'), 'code', 'NT_BSX', 'name', 'Xi măng xám')),
      applies, 'Tạo hàng cùng loại', '77000000-0000-4000-8000-0000000000a2');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('mismatched attributes must fail, got %s', failed);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.material_variant_groups where id = bs), 'no group after a failed command';
  assert not exists (select 1 from public.materials where code in ('NT_BS30', 'NT_BS40')), 'no variant after a failed command';

  -- Two variants with the same attribute values are refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác')),
      null, template, variants || jsonb_build_array(jsonb_build_object('attributes', jsonb_build_object('Mác', 'PCB30'), 'code', 'NT_BS30B', 'name', 'Trùng')),
      applies, 'Tạo hàng cùng loại', '77000000-0000-4000-8000-0000000000a3');
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('duplicate variant must fail, got %s', failed);

  -- Group, variants, shared selling unit and the variant price are saved together.
  result := public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác')),
    null, template, variants, applies, 'Tạo hàng cùng loại', op);
  assert (result->>'replayed')::boolean = false and jsonb_array_length(result->'material_ids') = 2, format('result %s', result);
  perform pg_temp.act_as_admin();
  select id into pcb30 from public.materials where code = 'NT_BS30';
  select id into pcb40 from public.materials where code = 'NT_BS40';
  assert pcb30 is not null and pcb40 is not null, 'variant codes are upper-cased materials';
  assert (select variant_attributes from public.materials where id = pcb40) = '{"Mác": "PCB40"}'::jsonb, 'attribute values are trimmed';
  assert (select base_uom_id from public.materials where id = pcb30) = kg, 'variants use the template base unit';
  assert (select count(*) from public.material_uom_conversions where material_id in (pcb30, pcb40) and from_uom_id = bao and active and numerator = 50) = 2,
    'each variant gets its own copy of the template unit';
  assert (select unit_price_vnd from public.pricing_rules where material_id = pcb30 and price_uom_id = bao and active) = 90000, 'variant price saved';
  assert not exists (select 1 from public.pricing_rules where material_id = pcb40), 'no price when none given';
  assert (select count(*) from public.audit_events where action = 'catalog.variant_group_create' and trace_id = op) = 1, 'one command audit event';
  materials_before := (select count(*) from public.materials);

  -- Same operation and payload replays; another payload under the same operation is a conflict.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  result := public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác')),
    null, template, variants, applies, 'Tạo hàng cùng loại', op);
  assert (result->>'replayed')::boolean and (result->'material_ids'->>0)::uuid = pcb30, format('replay %s', result);
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.materials) = materials_before, 'replay writes nothing';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác')),
      null, template, variants, applies, 'Lý do khác', op);
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict expected, got %s', failed);

  -- Editing needs the version that was read; a stale editor is refused.
  failed := null;
  begin perform public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng BS'),
      jsonb_build_object('name', 'Tên cũ', 'attribute_names', jsonb_build_array('Mác'), 'active', true), null, '[]', null, 'Đổi tên', '77000000-0000-4000-8000-0000000000a4');
  exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('stale group must be refused, got %s', failed);

  -- An existing material joins; inactive materials cannot join; members of another group cannot be taken.
  failed := null;
  begin perform public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn'),
      jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác'), 'active', true), null,
      jsonb_build_array(jsonb_build_object('material_id', inactive_material, 'attributes', jsonb_build_object('Mác', 'OFF'))), null, 'Gộp', '77000000-0000-4000-8000-0000000000a5');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('inactive material must be refused, got %s', failed);
  perform public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn'),
    jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác'), 'active', true), null,
    jsonb_build_array(jsonb_build_object('material_id', old_material, 'attributes', jsonb_build_object('Mác', 'PCB50'))), null, 'Gộp vật tư cũ', '77000000-0000-4000-8000-0000000000a6');
  perform pg_temp.act_as_admin();
  assert (select variant_group_id from public.materials where id = old_material) = bs, 'existing material joined the group';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_material_variant_group(branch, '76000000-0000-4000-8000-000000000002', jsonb_build_object('name', 'Nhóm khác', 'attribute_names', jsonb_build_array('Loại')),
      null, null, jsonb_build_array(jsonb_build_object('material_id', old_material, 'attributes', jsonb_build_object('Loại', 'A'))), null, 'Lấy nhầm', '77000000-0000-4000-8000-0000000000a7');
  exception when others then failed := sqlstate; end;
  assert failed = '23505', format('member of another group must be refused, got %s', failed);

  -- Renaming the attribute needs every member re-labelled in the same command.
  failed := null;
  begin perform public.save_material_variant_group(branch, bs, jsonb_build_object('attribute_names', jsonb_build_array('Mác xi măng')),
      jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác'), 'active', true), null, '[]', null, 'Đổi tên thuộc tính', '77000000-0000-4000-8000-0000000000a8');
  exception when others then failed := sqlstate; end;
  assert failed = '22023', format('unlabelled members must fail, got %s', failed);

  -- Leaving the group keeps the material as it is.
  perform public.save_material_variant_group(branch, bs, jsonb_build_object('name', 'Xi măng Bút Sơn'),
    jsonb_build_object('name', 'Xi măng Bút Sơn', 'attribute_names', jsonb_build_array('Mác'), 'active', true), null,
    jsonb_build_array(jsonb_build_object('material_id', old_material, 'detach', true)), null, 'Tách ra', '77000000-0000-4000-8000-0000000000a9');
  perform pg_temp.act_as_admin();
  assert (select variant_group_id is null and variant_attributes is null and active from public.materials where id = old_material), 'detached material unchanged otherwise';

  -- Readers in any branch can see groups; anonymous callers cannot read or execute.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.material_variant_groups where id = bs) = 1, 'employees read groups';
  perform pg_temp.act_as_admin();
  assert not has_table_privilege('anon', 'public.material_variant_groups', 'select'), 'anon cannot read groups';
  assert not has_table_privilege('authenticated', 'public.material_variant_groups', 'insert'), 'groups are written only by the command';
  assert not has_function_privilege('anon', 'public.save_material_variant_group(uuid, uuid, jsonb, jsonb, jsonb, jsonb, timestamptz, text, uuid)', 'execute'), 'anon cannot execute';
end
$test$;
