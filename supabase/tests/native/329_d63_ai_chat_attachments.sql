-- D63: a question kept by Trợ lý AI lists its files; only files in the caller's own folder are accepted, a bad entry is
-- refused, and replaying the same operation returns the first answer without storing the turn twice.
do $$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  owner_login constant uuid := '10000000-0000-4000-8000-000000000001';
  reader_login constant uuid := '10000000-0000-4000-8000-000000000003';
  op constant uuid := '7f329000-0000-4000-8000-000000000001';
  files jsonb := jsonb_build_array(
    jsonb_build_object('path', owner_login::text || '/' || op::text || '/1-anh.jpg', 'name', 'ảnh hóa đơn.jpg', 'mime', 'image/jpeg', 'size', 120000),
    jsonb_build_object('path', owner_login::text || '/' || op::text || '/2-khach.xlsx', 'name', 'khach.xlsx', 'mime', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'size', 9000));
  answer_id uuid;
  replay uuid;
  kept jsonb;
  failed text;
begin
  perform pg_temp.act_as(owner_login);
  answer_id := public.save_ai_chat_turn(branch, 'Đọc giúp ảnh này', 'Hóa đơn ghi 1.250.000 ₫.', op, files);
  select attachments into kept from public.ai_chat_messages where auth_user_id = owner_login and role = 'user' and body = 'Đọc giúp ảnh này';
  if kept is distinct from files then raise exception 'attachments not kept: %', kept; end if;
  if (select attachments from public.ai_chat_messages where id = answer_id) <> '[]'::jsonb then raise exception 'the answer must carry no files'; end if;

  replay := public.save_ai_chat_turn(branch, 'Đọc giúp ảnh này', 'Hóa đơn ghi 1.250.000 ₫.', op, files);
  if replay <> answer_id then raise exception 'replay must return the first answer'; end if;
  if (select count(*) from public.ai_chat_messages where auth_user_id = owner_login and body = 'Đọc giúp ảnh này') <> 1 then raise exception 'turn stored twice'; end if;

  -- The same operation with other files is a different payload.
  failed := null;
  begin perform public.save_ai_chat_turn(branch, 'Đọc giúp ảnh này', 'Hóa đơn ghi 1.250.000 ₫.', op, '[]'::jsonb);
  exception when others then failed := sqlerrm; end;
  if failed is null then raise exception 'changed payload on the same operation must be refused'; end if;

  -- Another person's folder, a path escape, a missing key, a foreign type and a sixth file are refused.
  foreach kept in array array[
    jsonb_build_array(jsonb_build_object('path', reader_login::text || '/x/1.jpg', 'name', 'a.jpg', 'mime', 'image/jpeg', 'size', 10)),
    jsonb_build_array(jsonb_build_object('path', owner_login::text || '/../' || reader_login::text || '/1.jpg', 'name', 'a.jpg', 'mime', 'image/jpeg', 'size', 10)),
    jsonb_build_array(jsonb_build_object('path', owner_login::text || '/x/1.jpg', 'mime', 'image/jpeg', 'size', 10)),
    jsonb_build_array(jsonb_build_object('path', owner_login::text || '/x/1.exe', 'name', 'a.exe', 'mime', 'application/x-msdownload', 'size', 10)),
    jsonb_build_array(jsonb_build_object('path', owner_login::text || '/x/1.jpg', 'name', 'a.jpg', 'mime', 'image/jpeg', 'size', 10, 'url', 'https://evil.test')),
    (select jsonb_agg(jsonb_build_object('path', owner_login::text || '/x/' || n || '.jpg', 'name', n || '.jpg', 'mime', 'image/jpeg', 'size', 10)) from generate_series(1, 6) n)
  ] loop
    failed := null;
    begin perform public.save_ai_chat_turn(branch, 'Câu hỏi thử', 'Trả lời thử', gen_random_uuid(), kept);
    exception when others then failed := sqlerrm; end;
    if failed is null then raise exception 'bad attachments accepted: %', kept; end if;
  end loop;

  -- Without files the call keeps working as before (four arguments), and the turn has no files.
  answer_id := public.save_ai_chat_turn(branch, 'Doanh thu hôm nay?', 'Chưa có doanh thu.', '7f329000-0000-4000-8000-000000000002');
  if (select attachments from public.ai_chat_messages where auth_user_id = owner_login and body = 'Doanh thu hôm nay?') <> '[]'::jsonb then raise exception 'empty list expected'; end if;

  -- A person without ai.use cannot keep a turn.
  perform pg_temp.act_as(reader_login);
  failed := null;
  begin perform public.save_ai_chat_turn(branch, 'Câu hỏi', 'Trả lời', gen_random_uuid(), '[]'::jsonb);
  exception when insufficient_privilege then failed := 'forbidden'; end;
  if failed is null then raise exception 'reader must be refused'; end if;
  perform pg_temp.act_as_admin();
end $$;
