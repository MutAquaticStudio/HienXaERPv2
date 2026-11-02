-- D49: before signing in, anon reads only the logo columns of the company profile; every other column and every write
-- stay closed.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  png constant text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  png_sha text;
  failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_company_profile(branch, jsonb_build_object('legal_name', 'Công ty TNHH Hiền Xa', 'tax_code', '0101234567',
    'bank_account_number', '0123456789'), null, '7f100000-0000-4000-8000-0000000003c1');
  png_sha := public.save_company_logo(branch, 'image/png', png, null, '7f100000-0000-4000-8000-0000000003c2');

  -- Privileges: three columns, select only; no table-wide privilege.
  assert not has_table_privilege('anon', 'public.company_profile', 'select'), 'no table-wide select';
  assert has_column_privilege('anon', 'public.company_profile', 'logo_mime', 'select')
    and has_column_privilege('anon', 'public.company_profile', 'logo_base64', 'select')
    and has_column_privilege('anon', 'public.company_profile', 'logo_sha256', 'select'), 'logo columns readable';
  assert not has_column_privilege('anon', 'public.company_profile', 'legal_name', 'select')
    and not has_column_privilege('anon', 'public.company_profile', 'tax_code', 'select')
    and not has_column_privilege('anon', 'public.company_profile', 'address', 'select')
    and not has_column_privilege('anon', 'public.company_profile', 'phone', 'select')
    and not has_column_privilege('anon', 'public.company_profile', 'email', 'select')
    and not has_column_privilege('anon', 'public.company_profile', 'bank_account_number', 'select')
    and not has_column_privilege('anon', 'public.company_profile', 'bank_account_holder', 'select'), 'details stay private';
  assert not has_any_column_privilege('anon', 'public.company_profile', 'insert')
    and not has_any_column_privilege('anon', 'public.company_profile', 'update'), 'no writes';
  assert not has_table_privilege('anon', 'public.company_profile', 'delete'), 'no delete';

  -- As anon: the logo is there, the company name is refused.
  perform pg_temp.act_as_admin();
  perform set_config('request.jwt.claim.role', 'anon', true), set_config('role', 'anon', true);
  assert (select logo_sha256 = png_sha and logo_mime = 'image/png' from public.company_profile), 'anon sees the logo';
  failed := null;
  begin perform legal_name from public.company_profile; exception when others then failed := sqlstate; end;
  assert failed = '42501', format('anon must not read the name, got %s', failed);
  failed := null;
  begin update public.company_profile set logo_mime = 'image/jpeg'; exception when others then failed := sqlstate; end;
  assert failed = '42501', format('anon must not write, got %s', failed);
  perform set_config('role', 'postgres', true);
end
$test$;
