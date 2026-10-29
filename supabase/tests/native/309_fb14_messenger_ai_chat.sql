-- FB14 (D36): Messenger contacts and direct chats — staff see colleagues only, the owner also sees customers, a customer sees
-- only the owner and the staff in charge of them; one conversation per pair. The AI chat history is kept per person.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000309'), ('10000000-0000-4000-8000-000000000310');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000310', '10000000-0000-4000-8000-000000000310', 'NT_E310', 'Nhân viên thử 310');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000310', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000002');
insert into public.customers(id, branch_id, code, display_name, customer_type, sales_owner_employee_id) values
  ('7f309000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH309', 'Khách thử 309', 'BUSINESS',
   '30000000-0000-4000-8000-000000000003');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('10000000-0000-4000-8000-000000000309', '7f309000-0000-4000-8000-000000000001', 'OWNER');

do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  customer constant uuid := '7f309000-0000-4000-8000-000000000001';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  staff_login constant uuid := '10000000-0000-4000-8000-000000000003';
  other_staff constant uuid := '10000000-0000-4000-8000-000000000310';
  customer_login constant uuid := '10000000-0000-4000-8000-000000000309';
  chat uuid; again uuid; failed text; names text; turn uuid; op uuid := gen_random_uuid();
begin
  -- Staff: colleagues only, never customers.
  perform pg_temp.act_as(staff_login);
  select string_agg(display_name, ',' order by display_name) into names from public.messenger_contacts(branch, null);
  assert names = 'Nhân viên thử 1,Nhân viên thử 310', format('staff contacts %s', names);
  failed := null;
  begin perform public.open_direct_conversation(branch, null, customer_login, customer); exception when others then failed := sqlerrm; end;
  assert failed = 'conversation_participant_forbidden', format('staff cannot write to a customer, got %s', failed);

  -- The owner: colleagues and the customer's portal account.
  perform pg_temp.act_as(owner_login);
  assert (select count(*) from public.messenger_contacts(branch, null) where contact_kind = 'CUSTOMER' and customer_id = customer
    and auth_user_id = customer_login) = 1, 'owner sees the customer';
  assert (select count(*) from public.messenger_contacts(branch, null) where contact_kind = 'EMPLOYEE') = 2, 'owner sees colleagues';

  -- The customer: the owner and the staff in charge, nobody else.
  perform pg_temp.act_as(customer_login);
  select string_agg(display_name || ':' || subtitle, ',' order by display_name) into names from public.messenger_contacts(null, customer);
  assert names = 'Nhân viên thử 1:Chủ doanh nghiệp,Nhân viên thử 3:Nhân viên phụ trách', format('customer contacts %s', names);
  failed := null;
  begin perform public.open_direct_conversation(null, customer, other_staff, customer); exception when others then failed := sqlerrm; end;
  assert failed = 'conversation_participant_forbidden', format('customer cannot write to other staff, got %s', failed);
  failed := null;
  begin perform public.messenger_contacts(branch, null); exception when others then failed := sqlerrm; end;
  assert failed = 'forbidden', 'a customer has no internal messenger';

  -- One conversation per pair; the owner finds it from either side and gets the unread message.
  chat := public.open_direct_conversation(null, customer, owner_login, customer);
  again := public.open_direct_conversation(null, customer, owner_login, customer);
  assert chat = again, 'the same conversation';
  perform public.send_message(chat, 'Chào anh, mai giao hàng được không?', gen_random_uuid());
  perform pg_temp.act_as(owner_login);
  assert public.open_direct_conversation(branch, null, customer_login, customer) = chat, 'same conversation from the owner';
  assert (select conversation_id = chat and unread_count = 1 and last_message_preview like 'Chào anh%' from public.messenger_contacts(branch, null)
    where auth_user_id = customer_login), 'owner sees the unread message';
  perform pg_temp.act_as_admin();
  assert (select audience = 'CUSTOMER' and customer_id = customer and entity_id is null from public.conversations where id = chat), 'customer conversation';

  -- Colleagues: a direct internal conversation.
  perform pg_temp.act_as(staff_login);
  chat := public.open_direct_conversation(branch, null, other_staff, null);
  perform pg_temp.act_as_admin();
  assert (select audience = 'INTERNAL' and customer_id is null from public.conversations where id = chat), 'internal conversation';
  assert (select count(*) from public.conversation_participants where conversation_id = chat) = 2, 'two people';

  -- AI chat history: the owner (ai.use) keeps their turns; a person without ai.use cannot; a new chat archives the old one.
  perform pg_temp.act_as(owner_login);
  turn := public.save_ai_chat_turn(branch, 'Doanh thu hôm nay?', 'Hôm nay chưa có doanh thu.', op);
  assert public.save_ai_chat_turn(branch, 'Doanh thu hôm nay?', 'Hôm nay chưa có doanh thu.', op) = turn, 'replay';
  assert (select string_agg(role, ',' order by created_at) from public.ai_chat_messages where not archived) = 'user,assistant', 'kept in order';
  assert public.start_new_ai_chat(branch) = 2, 'archived';
  assert not exists (select 1 from public.ai_chat_messages where not archived), 'new chat';
  perform pg_temp.act_as(staff_login);
  assert not exists (select 1 from public.ai_chat_messages), 'only the person sees their history';
  failed := null;
  begin perform public.save_ai_chat_turn(branch, 'Xin chào', 'Chào bạn', gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'needs ai.use';
  perform pg_temp.act_as_admin();
end
$test$;
