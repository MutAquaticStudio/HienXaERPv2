-- D58: Cài đặt chooses the branch receiving self-registered customers (audited); the register page (anon) can see
-- whether one is chosen, and nothing else of the company row.
do $$
declare
  branch_a constant uuid := '20000000-0000-4000-8000-00000000000a';
  branch_b constant uuid := '20000000-0000-4000-8000-00000000000b';
  failed text;
begin
  -- Several active branches and no choice yet: closed (register_portal_customer would refuse the same way).
  assert (select count(*) from public.branches where active) > 1, 'fixture has several branches';
  delete from public.company_profile;

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.set_portal_branch(branch_a, '7e580000-0000-4000-8000-000000000001'); exception when others then failed := sqlerrm; end;
  assert failed = 'company_profile_missing', format('needs the company details first, got %s', failed);
  perform pg_temp.act_as_admin();
  insert into public.company_profile(legal_name, updated_by) values ('Công ty thử', '10000000-0000-4000-8000-000000000001');

  -- A reader of branch A, or the manager of branch B choosing branch A: refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.set_portal_branch(branch_a, '7e580000-0000-4000-8000-000000000002'); exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'a reader cannot choose the branch';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.set_portal_branch(branch_a, '7e580000-0000-4000-8000-000000000003'); exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'another branch manager cannot choose branch A';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert public.set_portal_branch(branch_a, '7e580000-0000-4000-8000-000000000004') = branch_a, 'chosen';
  assert public.set_portal_branch(branch_a, '7e580000-0000-4000-8000-000000000005') = branch_a, 'choosing it again changes nothing';
  perform pg_temp.act_as_admin();
  assert (select portal_branch_id from public.company_profile) = branch_a, 'stored';
  assert (select count(*) from public.audit_events where action = 'company.portal_branch_set') = 1, 'one audit row for one change';
  perform set_config('role', 'anon', true);
  assert (select portal_branch_id from public.company_profile) = branch_a, 'the register page sees the chosen branch';
  failed := null;
  begin perform (select legal_name from public.company_profile); exception when insufficient_privilege then failed := 'forbidden'; end;
  assert failed = 'forbidden', 'anon still cannot read the company details';
  perform pg_temp.act_as_admin();

  -- An inactive branch cannot receive customers.
  update public.branches set active = false where id = branch_b;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.set_portal_branch(branch_b, '7e580000-0000-4000-8000-000000000006'); exception when others then failed := sqlerrm; end;
  assert failed in ('branch_inactive', 'forbidden'), format('inactive branch refused, got %s', failed);
  perform pg_temp.act_as_admin();
end $$;

do $$ begin
  assert has_column_privilege('anon', 'public.company_profile', 'portal_branch_id', 'SELECT'), 'the register page may ask';
  assert not has_column_privilege('anon', 'public.company_profile', 'bank_account_number', 'SELECT'), 'bank details stay private';
  assert not has_function_privilege('anon', 'public.set_portal_branch(uuid, uuid)', 'EXECUTE'), 'anon cannot choose';
end $$;
