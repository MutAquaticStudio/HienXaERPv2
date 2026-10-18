-- R3 notifications: written only through private.notify (dedupe by key), seen by holders of the permission in the branch or by
-- the named employee, read state per login; a delivery result and a job handed to a worker notify by themselves.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  other_branch constant uuid := '20000000-0000-4000-8000-00000000000b';
  full_user constant uuid := '10000000-0000-4000-8000-000000000001';
  other_user constant uuid := '10000000-0000-4000-8000-000000000002';
  reader constant uuid := '10000000-0000-4000-8000-000000000003';
  reader_employee constant uuid := '30000000-0000-4000-8000-000000000003';
  first_id uuid;
  again uuid;
  personal uuid;
  feed jsonb;
  marked integer;
  failed text;
begin
  first_id := private.notify(branch, 'purchase.draft_ready', 'purchase_order', null, 'Đơn mua nháp cần duyệt', 'PO thử', '/admin/purchase-orders',
    'purchasing.confirm', null, 'test:po:1');
  again := private.notify(branch, 'purchase.draft_ready', 'purchase_order', null, 'Đơn mua nháp cần duyệt', 'PO thử', '/admin/purchase-orders',
    'purchasing.confirm', null, 'test:po:1');
  assert first_id is not null and again is null, 'same dedupe key rings once';
  personal := private.notify(branch, 'work.assigned', 'work_item', null, 'Việc mới cho nhân viên 3', null, '/work', 'orders.read', reader_employee, null);
  perform private.notify(other_branch, 'purchase.draft_ready', 'purchase_order', null, 'Chi nhánh khác', null, null, 'purchasing.confirm', null, null);

  failed := null;
  begin
    perform private.notify(branch, 'x.bad', 'delivery', null, 'Liên kết ngoài', null, 'https://example.com', 'orders.read', null, null);
  exception when check_violation then failed := 'check';
  end;
  assert failed = 'check', 'links stay inside the app';

  -- Full access sees the branch notification (not the one for employee 3, not the other branch).
  perform pg_temp.act_as(full_user);
  feed := public.notification_feed(branch, 20, null);
  assert (feed->>'unread')::int = 1 and jsonb_array_length(feed->'items') = 1, format('full user feed %s', feed);
  assert feed->'items'->0->>'title' = 'Đơn mua nháp cần duyệt' and (feed->'items'->0->>'read')::boolean = false, 'unread purchase notification';
  assert (select count(*) from public.notifications) = 1, 'RLS shows only own notifications';

  -- The reader lacks purchasing.confirm: sees only the one addressed to them.
  perform pg_temp.act_as(reader);
  feed := public.notification_feed(branch, 20, null);
  assert (feed->>'unread')::int = 1 and feed->'items'->0->>'id' = personal::text, format('reader feed %s', feed);
  marked := public.mark_notifications_read(branch, array[first_id, personal]);
  assert marked = 1, format('reader marks only what they can see, got %s', marked);
  feed := public.notification_feed(branch, 20, null);
  assert (feed->>'unread')::int = 0 and (feed->'items'->0->>'read')::boolean, 'reader notification read';

  -- Read state is per login: still unread for the full user; mark all.
  perform pg_temp.act_as(full_user);
  assert (public.notification_feed(branch, 20, null)->>'unread')::int = 1, 'other login keeps unread';
  marked := public.mark_notifications_read(branch, null);
  assert marked = 1 and (public.notification_feed(branch, 20, null)->>'unread')::int = 0, 'mark all';
  assert public.mark_notifications_read(branch, null) = 0, 'marking twice changes nothing';

  -- No access to the other branch.
  failed := null;
  begin perform public.notification_feed(other_branch, 20, null); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('foreign branch feed must be refused, got %s', failed);

  perform pg_temp.act_as(other_user);
  feed := public.notification_feed(other_branch, 20, null);
  assert (feed->>'unread')::int = 1 and feed->'items'->0->>'title' = 'Chi nhánh khác', 'branch B sees its own';

  -- Direct writes are not possible for API callers.
  failed := null;
  begin
    insert into public.notifications(branch_id, kind, entity_type, title, required_permission) values (other_branch, 'x.y.z', 'delivery', 'Tự ghi', 'orders.read');
  exception when insufficient_privilege then failed := 'denied';
  end;
  assert failed = 'denied', 'no direct insert';

  perform pg_temp.act_as_admin();
end
$test$;

-- A worker result and a job handed to a worker notify by themselves.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KHTB', 'Khách thông báo', 'BUSINESS');
insert into public.customer_sites(id, customer_id, code, name, address_text) values
  ('7f000000-0000-4000-8000-000000000002', '7f000000-0000-4000-8000-000000000001', 'CT1', 'Công trình thông báo', 'Địa chỉ thử');
insert into public.sales_orders(id, branch_id, order_number, customer_id, site_id, commercial_state, customer_name_snapshot, site_name_snapshot,
  delivery_address_snapshot, created_by)
values ('7f000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT-SO-TB', '7f000000-0000-4000-8000-000000000001',
  '7f000000-0000-4000-8000-000000000002', 'CONFIRMED', 'Khách thông báo', 'Công trình thông báo', 'Địa chỉ thử', '10000000-0000-4000-8000-000000000001');
insert into public.deliveries(id, branch_id, sales_order_id, delivery_number, execution_state, customer_id, site_id, customer_name_snapshot,
  site_name_snapshot, delivery_address_snapshot, created_by)
values ('7f000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', '7f000000-0000-4000-8000-000000000003', 'NT-GH-TB',
  'ARRIVED', '7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000002', 'Khách thông báo', 'Công trình thông báo',
  'Địa chỉ thử', '10000000-0000-4000-8000-000000000001');
insert into public.work_items(id, branch_id, work_number, delivery_id, title, assignment_mode, execution_state, scheduled_start, scheduled_end, created_by)
values ('7f000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', 'NT-WI-TB', '7f000000-0000-4000-8000-000000000004',
  'Giao hàng - NT-GH-TB', 'DIRECT', 'CLAIMED', now(), now() + interval '1 hour', '10000000-0000-4000-8000-000000000001');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  delivery constant uuid := '7f000000-0000-4000-8000-000000000004';
  item constant uuid := '7f000000-0000-4000-8000-000000000005';
  note public.notifications%rowtype;
begin
  -- Handed by user 1 to employee 3: employee 3 is told; a claim by the worker themself is not a notification.
  insert into public.work_item_assignments(work_item_id, assignment_version, employee_id, assignment_kind, assigned_by)
  values (item, 1, '30000000-0000-4000-8000-000000000003', 'DIRECT', '10000000-0000-4000-8000-000000000001');
  select * into note from public.notifications where kind = 'work.assigned' and entity_id = item;
  assert note.recipient_employee_id = '30000000-0000-4000-8000-000000000003' and note.link = '/work/jobs/' || item
    and note.title = 'Việc mới: Giao hàng - NT-GH-TB', format('work notification %s', to_jsonb(note));
  update public.work_item_assignments set superseded_at = now() where work_item_id = item;
  insert into public.work_item_assignments(work_item_id, assignment_version, employee_id, assignment_kind, assigned_by)
  values (item, 2, '30000000-0000-4000-8000-000000000003', 'CLAIM', '10000000-0000-4000-8000-000000000003');
  assert (select count(*) from public.notifications where kind = 'work.assigned' and entity_id = item) = 1, 'own claim does not notify';

  update public.deliveries set execution_state = 'RESULT_SUBMITTED', result_kind = 'PARTIAL', version = version + 1 where id = delivery;
  select * into note from public.notifications where kind = 'delivery.result_submitted' and entity_id = delivery;
  assert note.title = 'Giao thiếu NT-GH-TB' and note.required_permission = 'delivery.verify' and note.link = '/admin/deliveries/' || delivery,
    format('delivery notification %s', to_jsonb(note));
  update public.deliveries set version = version + 1 where id = delivery;
  assert (select count(*) from public.notifications where kind = 'delivery.result_submitted') = 1, 'only the state change notifies';
end
$test$;
