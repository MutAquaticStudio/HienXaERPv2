-- FB12 (D34d): the AI assistant logs its usage and only proposes changes; a manager approves or dismisses them.
do $test$
declare branch constant uuid := '20000000-0000-4000-8000-00000000000a'; proposal uuid; failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.log_ai_usage(branch, 'sales', 'claude-sonnet-5-5', 10, 5, 0, 0, 'OK'); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'a person without ai.use cannot use the assistant';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.log_ai_usage(branch, 'sales', 'claude-sonnet-5-5', 1200, 300, 800, 0, 'OK');
  perform public.log_ai_usage(branch, 'finance', 'claude-sonnet-5-5', 0, 0, 0, 0, 'QUOTA');
  assert (select sum(input_tokens) from public.ai_usage_log where branch_id = branch) = 1200, 'usage logged';
  proposal := public.create_ai_proposal(branch, 'finance', 'Nhắc thu nợ KH01', 'Khách KH01 quá hạn 45 ngày, đề nghị gọi nhắc.', '/admin/receivables', '7f308000-0000-4000-8000-000000000001');
  assert public.create_ai_proposal(branch, 'finance', 'Nhắc thu nợ KH01', 'Khách KH01 quá hạn 45 ngày, đề nghị gọi nhắc.', '/admin/receivables', '7f308000-0000-4000-8000-000000000001') = proposal, 'replay';
  failed := null;
  begin perform public.create_ai_proposal(branch, 'finance', 'Link ngoài', 'Không được dẫn ra ngoài hệ thống.', 'https://evil.example', gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '23514', 'links stay inside the admin';
  perform public.decide_ai_proposal(proposal, 'DONE', gen_random_uuid());
  assert (select state = 'DONE' and decided_at is not null from public.ai_proposals where id = proposal), 'approved';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.ai_usage_log) = 0 and (select count(*) from public.ai_proposals) = 0, 'others cannot read the log or proposals';
end
$test$;
