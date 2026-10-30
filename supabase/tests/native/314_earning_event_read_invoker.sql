insert into public.compensation_rules(id, branch_id, code, name, version, employee_id, earning_type, calculation_kind, rate_vnd_per_unit, rate_bps,
  classification, effective_from, effective_to, created_by) values
  ('7f314000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_LUONG314', 'Lương tháng', 1, null,
   'FIXED_MONTHLY', 'FIXED_PER_BASIS', 7000000, null, 'OPEX', date '2026-01-01', null, '10000000-0000-4000-8000-000000000001');

-- Security: earning_event_read runs with the reader's rights, so the earnings of staff are only visible to people the
-- earning_events RLS allows (not to a read-only colleague or a customer portal account).
do $test$
declare employee uuid;
begin
  assert (select coalesce(reloptions, '{}') @> array['security_invoker=true'] from pg_class where oid = 'public.earning_event_read'::regclass),
    'earning_event_read must be security_invoker';

  -- One earning in branch A, written as the database owner.
  perform pg_temp.act_as_admin();
  select id into employee from public.employees where code = 'NT_E3';
  set local session_replication_role = 'replica';
  insert into public.earning_events(branch_id, employee_id, rule_id, rule_code_snapshot, rule_version_snapshot, earning_type, classification,
    sales_order_id, source_key, basis_quantity, basis_amount_vnd, calculated_amount_vnd, created_by)
  values ('20000000-0000-4000-8000-00000000000a', employee, '7f314000-0000-4000-8000-000000000001', 'NT_LUONG314', 1, 'FIXED_MONTHLY', 'OPEX',
    gen_random_uuid(), 'nt314', 1, 0, 7000000, '10000000-0000-4000-8000-000000000001');
  set local session_replication_role = 'origin';

  -- Owner of branch A (compensation.read) sees it; the read-only colleague and branch B do not.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  assert (select count(*) = 1 from public.earning_event_read where source_key = 'nt314'), 'owner sees the earning';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select count(*) = 0 from public.earning_event_read where source_key = 'nt314'), 'reader without compensation.read sees nothing';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  assert (select count(*) = 0 from public.earning_event_read where source_key = 'nt314'), 'other branch sees nothing';
end
$test$;
