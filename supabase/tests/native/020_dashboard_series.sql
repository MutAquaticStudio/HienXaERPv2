-- QA-FB-A04: finance_dashboard_series reuses finance_dashboard_snapshot per bucket.
-- Fixture writes run as the table owner with user 1 as the acting employee (operational write guard).
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.suppliers(id, branch_id, code, name) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_SUP', 'NCC thử');
insert into public.expense_categories(id, branch_id, code, name, created_by) values
  ('61000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_OPEX', 'Chi phí thử', '10000000-0000-4000-8000-000000000001');
insert into public.expenses(branch_id, expense_number, category_id, supplier_id, amount_vnd, effective_at, due_date, description,
  approval_state, approved_by, approved_at, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'NT-CP-1', '61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
   100000, now() - interval '15 days', current_date, 'Chi phí thử 1', 'APPROVED', '10000000-0000-4000-8000-000000000001', now() - interval '1 minute', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'NT-CP-2', '61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
   250000, now() - interval '3 days', current_date, 'Chi phí thử 2', 'APPROVED', '10000000-0000-4000-8000-000000000001', now() - interval '1 minute', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'NT-CP-3', '61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
   50000, now() - interval '3 days', current_date, 'Chi phí thử 3', 'APPROVED', '10000000-0000-4000-8000-000000000001', now() - interval '1 minute', '10000000-0000-4000-8000-000000000001');

do $test$
declare
  zone constant text := 'Asia/Ho_Chi_Minh';
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  today timestamp := date_trunc('day', now() at time zone zone);
  period_from timestamptz := (today - interval '20 days') at time zone zone;
  period_to timestamptz := (today + interval '1 day') at time zone zone;
  series jsonb; snap jsonb; point jsonb;
  profit_sum bigint := 0; cost_sum bigint := 0; failed boolean;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  series := public.finance_dashboard_series(branch, period_from, period_to, now());
  snap := public.finance_dashboard_snapshot(branch, period_from, period_to, now());
  assert series ->> 'granularity' = 'DAY', format('daily buckets expected, got %s', series ->> 'granularity');
  assert jsonb_array_length(series -> 'points') = 21, format('21 points expected, got %s', jsonb_array_length(series -> 'points'));
  for point in select value from jsonb_array_elements(series -> 'points') loop
    assert point -> 'net_profit' ->> 'quality' = 'READY', format('point not READY: %s', point);
    assert (point -> 'revenue' ->> 'value_vnd')::bigint - (point -> 'total_cost' ->> 'value_vnd')::bigint
      = (point -> 'net_profit' ->> 'value_vnd')::bigint, format('Thu - Chi must equal Lợi nhuận: %s', point);
    profit_sum := profit_sum + (point -> 'net_profit' ->> 'value_vnd')::bigint;
    cost_sum := cost_sum + (point -> 'total_cost' ->> 'value_vnd')::bigint;
  end loop;
  assert profit_sum = (snap -> 'operating_profit' ->> 'value_vnd')::bigint,
    format('bucket profit %s must equal period profit %s', profit_sum, snap -> 'operating_profit' ->> 'value_vnd');
  assert cost_sum = 400000, format('bucket cost must equal approved expenses, got %s', cost_sum);

  series := public.finance_dashboard_series(branch, (today - interval '60 days') at time zone zone, period_to, now());
  assert series ->> 'granularity' = 'WEEK', 'about two months uses weekly buckets';
  series := public.finance_dashboard_series(branch, (today - interval '300 days') at time zone zone, period_to, now());
  assert series ->> 'granularity' = 'MONTH', 'about ten months uses monthly buckets';
  assert jsonb_array_length(series -> 'points') <= 12, 'ten months stays within twelve monthly points';

  failed := false;
  begin
    perform public.finance_dashboard_series(branch, (today - interval '1100 days') at time zone zone, period_to, now());
  exception when sqlstate '22023' then failed := true;
  end;
  assert failed, 'a period over 31 monthly points is rejected';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  series := public.finance_dashboard_series(branch, period_from, period_to, now());
  point := series -> 'points' -> 0;
  assert point -> 'net_profit' ->> 'quality' = 'FORBIDDEN' and point -> 'net_profit' ->> 'value_vnd' is null, 'reader sees FORBIDDEN, not 0';
  assert point -> 'total_cost' ->> 'value_vnd' is null, 'reader gets no cost value';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := false;
  begin
    perform public.finance_dashboard_series(branch, period_from, period_to, now());
  exception when sqlstate '42501' then failed := true;
  end;
  assert failed, 'another branch is forbidden';
end
$test$;
