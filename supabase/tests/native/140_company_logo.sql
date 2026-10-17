-- FB2 Đợt 7: save_company_logo keeps one small PNG/JPEG in the company profile; only roles.manage writes it, the file must
-- match its type, and replacing or removing it is checked against the logo last read.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  -- A 1×1 transparent PNG and the first bytes of a JPEG.
  png constant text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  jpeg constant text := encode('\xffd8ffe000104a46494600'::bytea, 'base64');
  png_sha text;
  failed text;
begin
  -- No profile yet: a logo needs the company name first.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_company_logo(branch, 'image/png', png, null, '7f100000-0000-4000-8000-0000000000a1'); exception when others then failed := sqlerrm; end;
  assert failed = 'company_name_required', format('needs a profile, got %s', failed);
  perform public.save_company_profile(branch, jsonb_build_object('legal_name', 'Công ty TNHH Hiền Xa'), null, '7f100000-0000-4000-8000-0000000000a2');

  -- Readers and other branches cannot write.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.save_company_logo(branch, 'image/png', png, null, '7f100000-0000-4000-8000-0000000000a3'); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.save_company_logo(branch, 'image/png', png, null, '7f100000-0000-4000-8000-0000000000a3'); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch must be refused, got %s', failed);

  -- Wrong type, a file that is not what it claims, broken base64 and oversize files are refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.save_company_logo(branch, 'image/gif', png, null, '7f100000-0000-4000-8000-0000000000a4'); exception when others then failed := sqlerrm; end;
  assert failed = 'company_logo_invalid', format('gif, got %s', failed);
  failed := null;
  begin perform public.save_company_logo(branch, 'image/jpeg', png, null, '7f100000-0000-4000-8000-0000000000a5'); exception when others then failed := sqlerrm; end;
  assert failed = 'company_logo_invalid', format('png sent as jpeg, got %s', failed);
  failed := null;
  begin perform public.save_company_logo(branch, 'image/png', '***', null, '7f100000-0000-4000-8000-0000000000a6'); exception when others then failed := sqlerrm; end;
  assert failed = 'company_logo_invalid', format('broken base64, got %s', failed);
  failed := null;
  begin perform public.save_company_logo(branch, 'image/png', encode('\x89504e470d0a1a0a'::bytea || decode(repeat('00', 307200), 'hex'), 'base64'), null, '7f100000-0000-4000-8000-0000000000a7');
  exception when others then failed := sqlerrm; end;
  assert failed in ('company_logo_too_large', 'new row for relation "company_profile" violates check constraint "company_profile_logo_base64_check"'), format('oversize, got %s', failed);

  -- Save, replay, payload conflict, stale replace, replace, remove.
  png_sha := public.save_company_logo(branch, 'image/png', png, null, '7f100000-0000-4000-8000-0000000000b1');
  assert png_sha ~ '^[0-9a-f]{64}$', format('sha %s', png_sha);
  assert public.save_company_logo(branch, 'image/png', png, null, '7f100000-0000-4000-8000-0000000000b1') = png_sha, 'replay';
  failed := null;
  begin perform public.save_company_logo(branch, 'image/jpeg', jpeg, null, '7f100000-0000-4000-8000-0000000000b1'); exception when others then failed := sqlstate; end;
  assert failed = '23505', format('payload conflict, got %s', failed);
  failed := null;
  begin perform public.save_company_logo(branch, 'image/jpeg', jpeg, null, '7f100000-0000-4000-8000-0000000000b2'); exception when others then failed := sqlerrm; end;
  assert failed = 'company_logo_changed', format('stale replace, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select logo_mime = 'image/png' and logo_sha256 = png_sha and decode(logo_base64, 'base64') = decode(png, 'base64') from public.company_profile), 'reader sees the logo';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.save_company_logo(branch, 'image/jpeg', jpeg, png_sha, '7f100000-0000-4000-8000-0000000000b3') is not null, 'replaced by a jpeg';
  assert public.save_company_logo(branch, null, null, (select logo_sha256 from public.company_profile), '7f100000-0000-4000-8000-0000000000b4') is null, 'removed';

  perform pg_temp.act_as_admin();
  assert (select logo_mime is null and logo_base64 is null and logo_sha256 is null and version = 1 from public.company_profile), 'logo removed, profile version untouched';
  assert (select count(*) from public.audit_events where action in ('company_profile.logo_saved', 'company_profile.logo_removed')) = 3, 'three audited logo changes';
  assert not has_function_privilege('anon', 'public.save_company_logo(uuid, text, text, text, uuid)', 'execute'), 'anon cannot execute';
end
$test$;
