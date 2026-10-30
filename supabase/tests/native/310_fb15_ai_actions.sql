-- FB15 (D37): actions prepared by the assistant are the person's own, wait for "Xác nhận", and are decided once.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  reader_login constant uuid := '10000000-0000-4000-8000-000000000003';
  action uuid; failed text;
begin
  perform pg_temp.act_as(owner_login);
  action := public.create_ai_action(branch, 'tao_don_ban', 'Tạo đơn bán cho Khách thử', '[{"label": "Tổng", "value": "1.000.000 đ"}]', '{"customerId": "x"}');
  assert (select state = 'PENDING' and kind = 'tao_don_ban' from public.ai_actions where id = action), 'prepared, waiting';
  assert public.finish_ai_action(action, 'DONE', '/admin/orders/1', 'Đã tạo đơn') = action, 'done';
  -- Deciding again changes nothing (a repeated press).
  assert public.finish_ai_action(action, 'CANCELLED', '', '') = action, 'decided once';
  assert (select state = 'DONE' and result_link = '/admin/orders/1' and decided_at is not null from public.ai_actions where id = action), 'kept done';
  failed := null;
  begin perform public.finish_ai_action(action, 'PENDING', '', ''); exception when others then failed := sqlerrm; end;
  assert failed = 'invalid_ai_action_state', 'no going back';

  -- Another person neither sees nor decides it; a person without ai.use cannot prepare.
  perform pg_temp.act_as(reader_login);
  assert not exists (select 1 from public.ai_actions), 'own actions only';
  failed := null;
  begin perform public.finish_ai_action(action, 'CANCELLED', '', ''); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'not theirs';
  failed := null;
  begin perform public.create_ai_action(branch, 'tao_don_ban', 'Thử', '[]', '{}'); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'needs ai.use';
  perform pg_temp.act_as_admin();
end
$test$;
