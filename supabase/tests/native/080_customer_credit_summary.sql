-- FB2 Đợt 4: customer_credit_summary returns the credit exposure of one customer to receivable readers of its branch.
insert into public.customers(id, branch_id, code, display_name, customer_type, credit_limit_vnd) values
  ('7a000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH5', 'Khách hạn mức thử', 'BUSINESS', 50000000),
  ('7a000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_KH6', 'Khách chưa duyệt hạn mức', 'INDIVIDUAL', null);

do $test$
declare
  limited constant uuid := '7a000000-0000-4000-8000-000000000001';
  unlimited constant uuid := '7a000000-0000-4000-8000-000000000002';
  summary jsonb;
  failed text;
begin
  -- Without receivable rights, or from another branch, the summary is refused.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.customer_credit_summary(limited); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('reader without finance rights must be refused, got %s', failed);
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  failed := null;
  begin perform public.customer_credit_summary(limited); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('other branch must be refused, got %s', failed);

  -- The numbers are those of customer_credit_exposure; no debt yet means everything is available.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  summary := public.customer_credit_summary(limited);
  assert (summary->>'credit_limit_vnd')::bigint = 50000000 and (summary->>'receivable_vnd')::bigint = 0
    and (summary->>'overdue_vnd')::bigint = 0 and (summary->>'available_vnd')::bigint = 50000000, format('summary %s', summary);
  summary := public.customer_credit_summary(unlimited);
  assert summary->'credit_limit_vnd' = 'null'::jsonb and summary->'available_vnd' = 'null'::jsonb, format('no limit %s', summary);

  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.customer_credit_summary(uuid)', 'execute'), 'anon cannot execute';
end
$test$;
