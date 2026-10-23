-- FB10 (11): "Tính lương tháng" posts each worker's monthly salary once, approved and owed; a manual earning can be
-- calculated again for the same source (was "missing FROM-clause entry").
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000302');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000302', 'NT_NV302', 'Nhân viên lương 302');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000302', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000002');
insert into public.compensation_rules(id, branch_id, code, name, version, employee_id, earning_type, calculation_kind, rate_vnd_per_unit, rate_bps,
  classification, effective_from, effective_to, created_by) values
  ('7f302000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_LUONG302', 'Lương tháng', 1, '30000000-0000-4000-8000-000000000302',
   'FIXED_MONTHLY', 'FIXED_PER_BASIS', 7000000, null, 'OPEX', date '2026-01-01', null, '10000000-0000-4000-8000-000000000001'),
  ('7f302000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_LUONG302', 'Lương tháng', 2, '30000000-0000-4000-8000-000000000302',
   'FIXED_MONTHLY', 'FIXED_PER_BASIS', 8000000, null, 'OPEX', date '2026-06-01', null, '10000000-0000-4000-8000-000000000001');
insert into public.compensation_manual_bases(id, branch_id, employee_id, basis_type, basis_quantity, period_start, period_end, description, recorded_by) values
  ('7f302000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000302', 'FIXED_MONTHLY', 1,
   date '2026-05-01', date '2026-05-31', 'Lương tháng 5', '10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '', true);

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  worker constant uuid := '30000000-0000-4000-8000-000000000302';
  outcome jsonb; failed text; first_id uuid; second_id uuid;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  outcome := public.post_monthly_salaries(branch, date '2026-09-15', '7f302000-0000-4000-8000-0000000000a1');
  perform pg_temp.act_as_admin();
  assert (outcome->>'posted')::int >= 1 and outcome->>'month' = '2026-09', format('posted %s', outcome);
  assert (select calculated_amount_vnd || ':' || approval_state from public.earning_events where employee_id = worker and source_key = 'MONTHLY:2026-09')
    = '8000000:APPROVED', 'newest salary version, approved';
  assert (select original_amount_vnd from public.payable_obligations p join public.earning_events e on e.payable_obligation_id = p.id
    where e.employee_id = worker and e.source_key = 'MONTHLY:2026-09') = 8000000, 'owed to the worker';
  -- Pressing again for the same month does not post twice.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  outcome := public.post_monthly_salaries(branch, date '2026-09-01', '7f302000-0000-4000-8000-0000000000a2');
  perform pg_temp.act_as_admin();
  assert (select count(*) from public.earning_events where employee_id = worker and source_key = 'MONTHLY:2026-09') = 1, format('once a month %s', outcome);
  -- A future month is refused; a reader cannot post.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  begin perform public.post_monthly_salaries(branch, ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 40), '7f302000-0000-4000-8000-0000000000a3');
  exception when others then failed := sqlerrm; end;
  perform pg_temp.act_as_admin();
  assert failed = 'salary_month_in_future', format('future month refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.post_monthly_salaries(branch, date '2026-08-01', '7f302000-0000-4000-8000-0000000000a4');
  exception when others then failed := sqlstate; end;
  perform pg_temp.act_as_admin();
  assert failed = '42501', 'reader cannot post salaries';

  -- calculate_earning_event on the same source twice returns the same earning.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  first_id := public.calculate_earning_event('7f302000-0000-4000-8000-000000000001', 'MANUAL_BASIS', '7f302000-0000-4000-8000-000000000010', '7f302000-0000-4000-8000-0000000000b1');
  second_id := public.calculate_earning_event('7f302000-0000-4000-8000-000000000001', 'MANUAL_BASIS', '7f302000-0000-4000-8000-000000000010', '7f302000-0000-4000-8000-0000000000b2');
  perform pg_temp.act_as_admin();
  assert first_id = second_id, 'same earning on repeat';
end
$test$;
