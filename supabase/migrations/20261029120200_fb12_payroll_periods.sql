-- FB12 (D34b): bảng lương commands — lập bảng lương of a period (Tạm tính), tính lại, cộng / trừ tay per person (tạm ứng,
-- thưởng nóng), hủy a draft, chốt. Chốt needs the period's attendance closed, recalculates from it, and posts each person's
-- net pay as an approved earning + payable (source "PAYROLL:<period>"), paid later from "Chi trả" like any earning.
begin;

create or replace function public.create_payroll(target_branch_id uuid, from_date date, to_date date, payroll_name text, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare r record; period_id uuid;
begin
  if not private.has_permission(target_branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(create_payroll.operation_id, 'create_payroll', jsonb_build_array(target_branch_id, from_date, to_date, payroll_name));
  if r.replay is not null then return r.replay; end if;
  if from_date is null or to_date is null or to_date < from_date or to_date - from_date > 62 or char_length(trim(coalesce(payroll_name, ''))) not between 1 and 80 then
    raise exception 'invalid_payroll' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payroll:' || target_branch_id::text, 0));
  if exists (select 1 from public.payroll_periods p where p.branch_id = target_branch_id and p.state <> 'CANCELLED'
      and daterange(p.period_start, p.period_end, '[]') && daterange(from_date, to_date, '[]')) then
    raise exception 'payroll_period_overlaps' using errcode='23505'; end if;
  insert into public.payroll_periods(branch_id, code, name, period_start, period_end, created_by)
  values (target_branch_id, 'BL' || to_char(from_date, 'YYMMDD') || '-' || (select count(*) + 1 from public.payroll_periods p where p.branch_id = target_branch_id),
    trim(payroll_name), from_date, to_date, auth.uid())
  returning id into period_id;
  perform private.compute_payroll(period_id);
  insert into public.command_receipts values (create_payroll.operation_id, auth.uid(), 'create_payroll', r.hash, 'payroll_period', period_id, now());
  return period_id;
end $function$;

create or replace function public.recalculate_payroll(target_period_id uuid, expected_version integer, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; r record;
begin
  select * into per from public.payroll_periods where id = target_period_id for update;
  if per.id is null or not private.has_permission(per.branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(recalculate_payroll.operation_id, 'recalculate_payroll', jsonb_build_array(target_period_id, expected_version));
  if r.replay is not null then return r.replay; end if;
  if per.state <> 'DRAFT' then raise exception 'payroll_not_draft' using errcode='55000'; end if;
  if per.version <> expected_version then raise exception 'payroll_version_conflict' using errcode='40001'; end if;
  perform private.compute_payroll(per.id);
  insert into public.command_receipts values (recalculate_payroll.operation_id, auth.uid(), 'recalculate_payroll', r.hash, 'payroll_period', per.id, now());
  return per.id;
end $function$;

-- Cộng / trừ tay on one payslip (thưởng nóng, tạm ứng đã chi…) while the payroll is a draft.
create or replace function public.adjust_payroll_line(target_line_id uuid, bonus bigint, deduction bigint, note text, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare l public.payroll_lines%rowtype; per public.payroll_periods%rowtype; r record;
begin
  select * into l from public.payroll_lines where id = target_line_id for update;
  select * into per from public.payroll_periods where id = l.payroll_period_id for update;
  if l.id is null or not private.has_permission(l.branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(adjust_payroll_line.operation_id, 'adjust_payroll_line', jsonb_build_array(target_line_id, bonus, deduction, note));
  if r.replay is not null then return r.replay; end if;
  if per.state <> 'DRAFT' then raise exception 'payroll_not_draft' using errcode='55000'; end if;
  if coalesce(bonus, 0) < 0 or coalesce(deduction, 0) < 0 or char_length(coalesce(note, '')) > 300 then raise exception 'invalid_payroll' using errcode='22023'; end if;
  update public.payroll_lines set net_pay_vnd = net_pay_vnd - manual_bonus_vnd + manual_deduction_vnd + coalesce(bonus, 0) - coalesce(deduction, 0),
    manual_bonus_vnd = coalesce(bonus, 0), manual_deduction_vnd = coalesce(deduction, 0), manual_note = nullif(trim(note), ''),
    version = version + 1, updated_at = now() where id = l.id;
  update public.payroll_periods set version = version + 1 where id = per.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), l.branch_id, 'payroll.line_adjusted', 'payroll_line', l.id, adjust_payroll_line.operation_id, array['manual_bonus_vnd','manual_deduction_vnd'], nullif(trim(note), ''));
  insert into public.command_receipts values (adjust_payroll_line.operation_id, auth.uid(), 'adjust_payroll_line', r.hash, 'payroll_line', l.id, now());
  return l.id;
end $function$;

create or replace function public.cancel_payroll(target_period_id uuid, expected_version integer, operation_id uuid) returns uuid
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; r record;
begin
  select * into per from public.payroll_periods where id = target_period_id for update;
  if per.id is null or not private.has_permission(per.branch_id, 'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(cancel_payroll.operation_id, 'cancel_payroll', jsonb_build_array(target_period_id, expected_version));
  if r.replay is not null then return r.replay; end if;
  if per.state <> 'DRAFT' then raise exception 'payroll_not_draft' using errcode='55000'; end if;
  if per.version <> expected_version then raise exception 'payroll_version_conflict' using errcode='40001'; end if;
  update public.payroll_periods set state = 'CANCELLED', version = version + 1 where id = per.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values (auth.uid(), per.branch_id, 'payroll.cancelled', 'payroll_period', per.id, cancel_payroll.operation_id, array['state']);
  insert into public.command_receipts values (cancel_payroll.operation_id, auth.uid(), 'cancel_payroll', r.hash, 'payroll_period', per.id, now());
  return per.id;
end $function$;

-- Chốt bảng lương: the attendance of every day of the period must be closed; the payslips are recalculated from it and each
-- positive net pay becomes an approved earning with its payable (due at the end of the period).
create or replace function public.close_payroll(target_period_id uuid, expected_version integer, operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $function$
declare per public.payroll_periods%rowtype; r record; rule public.compensation_rules%rowtype; l record; basis_id uuid; event_id uuid; payable_id uuid;
  posted integer := 0; total bigint := 0;
begin
  select * into per from public.payroll_periods where id = target_period_id for update;
  if per.id is null or not private.has_permission(per.branch_id, 'compensation.manage') or not private.has_permission(per.branch_id, 'compensation.approve') then
    raise exception 'forbidden' using errcode='42501'; end if;
  select * into r from private.attendance_receipt(close_payroll.operation_id, 'close_payroll', jsonb_build_array(target_period_id, expected_version));
  if r.replay is not null then return jsonb_build_object('replayed', true); end if;
  if per.state <> 'DRAFT' then raise exception 'payroll_not_draft' using errcode='55000'; end if;
  if per.version <> expected_version then raise exception 'payroll_version_conflict' using errcode='40001'; end if;
  if exists (select 1 from generate_series(per.period_start, per.period_end, interval '1 day') d
      where not private.attendance_day_locked(per.branch_id, d::date)) then
    raise exception 'payroll_attendance_not_closed' using errcode='55000'; end if;
  perform private.compute_payroll(per.id);
  -- One system rule per branch carries the payroll earnings (rate 1 đ × net pay).
  select * into rule from public.compensation_rules x where x.branch_id = per.branch_id and x.code = 'BANG-LUONG' order by x.version desc limit 1;
  if rule.id is null then
    insert into public.compensation_rules(branch_id, code, name, version, employee_id, earning_type, calculation_kind, rate_vnd_per_unit, classification, effective_from, created_by)
    values (per.branch_id, 'BANG-LUONG', 'Bảng lương (chốt từ chấm công)', 1, null, 'FIXED_MONTHLY', 'FIXED_PER_BASIS', 1, 'OPEX', date '2000-01-01', auth.uid())
    returning * into rule;
  end if;
  for l in select x.*, e.display_name from public.payroll_lines x join public.employees e on e.id = x.employee_id
      where x.payroll_period_id = per.id and x.included and x.net_pay_vnd > 0 and x.earning_event_id is null for update of x loop
    insert into public.compensation_manual_bases(branch_id, employee_id, basis_type, basis_quantity, period_start, period_end, description, recorded_by)
      values (per.branch_id, l.employee_id, 'FIXED_MONTHLY', l.net_pay_vnd, per.period_start, per.period_end, 'Bảng lương ' || per.code || ' · ' || per.name, auth.uid())
      returning id into basis_id;
    insert into public.earning_events(branch_id, employee_id, rule_id, rule_code_snapshot, rule_version_snapshot, earning_type, classification, manual_basis_id,
      source_key, basis_quantity, rate_vnd_per_unit_snapshot, calculated_amount_vnd, created_by, basis_quantity_policy)
      values (per.branch_id, l.employee_id, rule.id, rule.code, rule.version, rule.earning_type, rule.classification, basis_id,
      'PAYROLL:' || per.id::text, l.net_pay_vnd, 1, l.net_pay_vnd, auth.uid(), 'EXACT_SOURCE') returning id into event_id;
    insert into public.payable_obligations(branch_id, employee_id, earning_event_id, original_amount_vnd, due_date, recorded_by)
      values (per.branch_id, l.employee_id, event_id, l.net_pay_vnd, per.period_end, auth.uid()) returning id into payable_id;
    update public.earning_events set approval_state = 'APPROVED', approved_amount_vnd = l.net_pay_vnd, approved_by = auth.uid(), approved_at = now(),
      version = version + 1, payable_obligation_id = payable_id where id = event_id;
    update public.payroll_lines set earning_event_id = event_id where id = l.id;
    posted := posted + 1; total := total + l.net_pay_vnd;
  end loop;
  update public.payroll_periods set state = 'CLOSED', closed_by = auth.uid(), closed_at = now(), version = version + 1 where id = per.id;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (auth.uid(), per.branch_id, 'payroll.closed', 'payroll_period', per.id, close_payroll.operation_id, array['state','earning_events','payables'], per.code || ' · ' || per.name);
  insert into public.command_receipts values (close_payroll.operation_id, auth.uid(), 'close_payroll', r.hash, 'payroll_period', per.id, now());
  return jsonb_build_object('posted', posted, 'total_vnd', total::text);
end $function$;

revoke all on function public.create_payroll(uuid, date, date, text, uuid), public.recalculate_payroll(uuid, integer, uuid),
  public.adjust_payroll_line(uuid, bigint, bigint, text, uuid), public.cancel_payroll(uuid, integer, uuid), public.close_payroll(uuid, integer, uuid) from public, anon;
grant execute on function public.create_payroll(uuid, date, date, text, uuid), public.recalculate_payroll(uuid, integer, uuid),
  public.adjust_payroll_line(uuid, bigint, bigint, text, uuid), public.cancel_payroll(uuid, integer, uuid), public.close_payroll(uuid, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
