-- FB12 (D34b): bảng lương from the closed attendance — lương theo ngày công chuẩn, làm thêm 150%, phụ cấp theo ngày công,
-- phạt đi muộn, cộng / trừ tay kept on recalculation, chốt needs closed attendance and posts the net pay once as a payable.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  worker constant uuid := '30000000-0000-4000-8000-000000000003';
  shift uuid; period uuid; line public.payroll_lines%rowtype; failed text; outcome jsonb; ver integer;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.create_payroll(branch, '2026-09-01', '2026-09-30', 'Lương tháng 9', gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'a reader cannot make a payroll';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.save_salary_profile(branch, worker, 'MONTHLY_WORKDAYS', 26000000, true, null, 150, 200, 300, 7, true, gen_random_uuid());
  perform public.save_payroll_component(branch, null, 'AN-TRUA', 'Phụ cấp ăn trưa', 'ALLOWANCE', 'PER_WORKDAY', 30000, null, null, true, gen_random_uuid());
  perform public.save_payroll_component(branch, null, 'DI-MUON', 'Phạt đi muộn', 'DEDUCTION', 'PER_LATE', 50000, null, null, true, gen_random_uuid());
  perform public.save_payroll_component(branch, null, 'THUONG-DS', 'Thưởng doanh số', 'BONUS', 'SALES_TIERS', null,
    '[{"from_vnd": "0", "rate_bps": 0}, {"from_vnd": "100000000", "rate_bps": 100}]'::jsonb, null, true, gen_random_uuid());
  failed := null;
  begin perform public.save_payroll_component(branch, null, 'SAI', 'Sai', 'BONUS', 'SALES_TIERS', null, '[{"from_vnd": "x"}]'::jsonb, null, true, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_payroll_component', format('tiers checked, got %s', failed);

  -- Two days worked (one 30 minutes late with 2 hours overtime), one paid leave, one absence.
  shift := public.save_work_shift(branch, null, 'HC', 'Hành chính', '08:00', '17:00', 60, true, gen_random_uuid());
  perform public.save_attendance(branch, worker, '2026-09-01', shift, 'WORKED', '2026-09-01 08:00+07', '2026-09-01 17:00+07', null, gen_random_uuid());
  perform public.save_attendance(branch, worker, '2026-09-02', shift, 'WORKED', '2026-09-02 08:30+07', '2026-09-02 19:00+07', null, gen_random_uuid());
  perform public.save_attendance(branch, worker, '2026-09-03', shift, 'LEAVE_PAID', null, null, null, gen_random_uuid());
  perform public.save_attendance(branch, worker, '2026-09-04', shift, 'ABSENT', null, null, null, gen_random_uuid());

  period := public.create_payroll(branch, '2026-09-01', '2026-09-30', 'Lương tháng 9', '7f307000-0000-4000-8000-000000000001');
  assert public.create_payroll(branch, '2026-09-01', '2026-09-30', 'Lương tháng 9', '7f307000-0000-4000-8000-000000000001') = period, 'replay';
  select * into line from public.payroll_lines where payroll_period_id = period and employee_id = worker;
  -- 26,000,000 × 3 / 26 = 3,000,000; overtime 125,000/h × 2 h × 150% = 375,000; lunch 30,000 × 3; late 50,000 × 1.
  assert line.work_days = 3 and line.unpaid_days = 1 and line.late_count = 1 and line.overtime_minutes = 120, format('attendance read %s', row_to_json(line));
  assert line.base_amount_vnd = 3000000 and line.overtime_amount_vnd = 375000 and line.allowance_vnd = 90000 and line.deduction_vnd = 50000
    and line.bonus_vnd = 0 and line.net_pay_vnd = 3415000, format('payslip %s', row_to_json(line));
  failed := null;
  begin perform public.create_payroll(branch, '2026-09-15', '2026-10-10', 'Trùng', gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'payroll_period_overlaps', format('no overlap, got %s', failed);

  perform public.adjust_payroll_line(line.id, 100000, 200000, 'Tạm ứng 200.000', gen_random_uuid());
  select version into ver from public.payroll_periods where id = period;
  perform public.recalculate_payroll(period, ver, gen_random_uuid());
  select * into line from public.payroll_lines where id = line.id;
  assert line.net_pay_vnd = 3315000 and line.manual_deduction_vnd = 200000, format('hand entries kept %s', row_to_json(line));

  -- The worker does not see a draft payslip.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.payroll_lines) = 0, 'draft hidden from the worker';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select version into ver from public.payroll_periods where id = period;
  failed := null;
  begin perform public.close_payroll(period, ver, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'payroll_attendance_not_closed', format('attendance first, got %s', failed);
  perform public.close_attendance_period(branch, '2026-09-01', '2026-09-30', gen_random_uuid());
  outcome := public.close_payroll(period, ver, '7f307000-0000-4000-8000-000000000002');
  assert outcome->>'posted' = '1' and outcome->>'total_vnd' = '3315000', format('posted %s', outcome);
  assert (public.close_payroll(period, ver, '7f307000-0000-4000-8000-000000000002')->>'replayed')::boolean, 'close replay';
  select * into line from public.payroll_lines where id = line.id;
  assert (select e.approval_state = 'APPROVED' and e.approved_amount_vnd = 3315000 and p.original_amount_vnd = 3315000
    from public.earning_events e join public.payable_obligations p on p.id = e.payable_obligation_id where e.id = line.earning_event_id), 'net pay is a payable';
  failed := null;
  begin perform public.adjust_payroll_line(line.id, 0, 0, null, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'payroll_not_draft', 'closed payroll is final';

  -- Closed: the worker reads their own payslip.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.payroll_lines where employee_id = worker) = 1, 'own closed payslip visible';
  assert (select count(*) from public.payroll_periods where id = period) = 1, 'own payroll period visible';
end
$test$;
