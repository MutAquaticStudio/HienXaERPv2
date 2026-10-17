-- FB2 Đợt 7 (D10): save_company_profile keeps one company row printed on documents; only roles.manage may write it,
-- every signed-in user may read it, and edits are idempotent and version-checked.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  op constant uuid := '7f000000-0000-4000-8000-000000000001';
  profile constant jsonb := jsonb_build_object('legal_name', '  Công ty TNHH Hiền Xa ', 'tax_code', '0101234567', 'address', 'Thôn Đông, Hà Nội',
    'phone', '0912 345 678', 'email', '', 'bank_name', 'Vietcombank', 'bank_account_number', '0011001234567', 'bank_account_holder', 'CONG TY HIEN XA', 'logo', 'bỏ qua');
  version_now integer;
  failed text;
begin
  -- Readers and other branches cannot write.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_company_profile(branch, profile, null, op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.save_company_profile(branch, profile, null, op); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch must be refused, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_company_profile(branch, jsonb_build_object('legal_name', ' '), null, '7f000000-0000-4000-8000-0000000000a1'); exception when others then failed := sqlerrm; end;
  assert failed = 'company_name_required', format('name required, got %s', failed);
  failed := null;
  begin perform public.save_company_profile(branch, profile || jsonb_build_object('tax_code', '12AB'), null, '7f000000-0000-4000-8000-0000000000a2'); exception when others then failed := sqlstate; end;
  assert failed = '23514', format('bad tax code, got %s', failed);

  -- First save creates the row with trimmed text, blanks as null and unknown keys ignored; replay is idempotent.
  version_now := public.save_company_profile(branch, profile, null, op);
  assert version_now = 1, format('first version %s', version_now);
  assert public.save_company_profile(branch, profile, null, op) = 1, 'replay';
  failed := null;
  begin perform public.save_company_profile(branch, profile || jsonb_build_object('phone', '0999999999'), null, op); exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict, got %s', failed);

  -- Any signed-in user reads it, e.g. for a PDF; anon has no access.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select legal_name = 'Công ty TNHH Hiền Xa' and email is null and tax_code = '0101234567' from public.company_profile), 'reader sees the profile';

  -- Edits need the version last read.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_company_profile(branch, profile, null, '7f000000-0000-4000-8000-0000000000a3'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('stale create, got %s', failed);
  version_now := public.save_company_profile(branch, profile || jsonb_build_object('phone', '0243 888 999'), 1, '7f000000-0000-4000-8000-0000000000a4');
  assert version_now = 2, format('second version %s', version_now);
  failed := null;
  begin perform public.save_company_profile(branch, profile, 1, '7f000000-0000-4000-8000-0000000000a5'); exception when others then failed := sqlstate; end;
  assert failed = 'PT409', format('stale edit, got %s', failed);

  perform pg_temp.act_as_admin();
  assert (select count(*) from public.company_profile) = 1 and (select phone from public.company_profile) = '0243 888 999', 'one row, edited';
  assert (select count(*) from public.audit_events where action = 'company_profile.saved') = 2, 'two audited saves';
  assert not has_table_privilege('anon', 'public.company_profile', 'select'), 'anon cannot read';
  assert not has_function_privilege('anon', 'public.save_company_profile(uuid, jsonb, integer, uuid)', 'execute'), 'anon cannot execute';
end
$test$;
