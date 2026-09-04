begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

select has_table('public', 'conversations', 'CHAT1 persists a context-linked conversation');
select has_table('public', 'conversation_participants', 'CHAT1 persists active participants');
select has_table('public', 'conversation_messages', 'CHAT1 persists durable messages');
select has_column('public', 'conversations', 'status', 'Conversation lifecycle is explicit');
select has_column('public', 'conversation_messages', 'client_idempotency_key', 'Message retries have an idempotency key');

select has_function('app_private', 'ensure_operational_conversation', array['text', 'uuid', 'uuid'], 'Conversation opening is an app-private command');
select has_function('app_private', 'send_operational_message', array['uuid', 'text', 'uuid', 'text', 'uuid'], 'Message send is an app-private command');
select has_function('app_private', 'mark_operational_conversation_read', array['uuid', 'uuid'], 'Read acknowledgement is an app-private command');
select has_function('app_private', 'close_operational_conversation', array['uuid', 'text', 'uuid'], 'Conversation closure is an app-private command');

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.conversations'::regclass,
    'public.conversation_participants'::regclass,
    'public.conversation_messages'::regclass
  )),
  'All CHAT1 records use RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.conversation_messages', 'INSERT')
  and not has_table_privilege('authenticated', 'public.conversation_messages', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.conversation_messages', 'DELETE'),
  'Browser clients cannot directly write or erase chat history'
);
select ok(
  has_table_privilege('authenticated', 'public.conversations', 'SELECT')
  and has_table_privilege('authenticated', 'public.conversation_messages', 'SELECT'),
  'Realtime consumers can read projections only behind RLS'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.conversation_messages'::regclass
    and tgname = 'conversation_messages_immutable' and not tgisinternal),
  'Messages are immutable operational history'
);
select ok(
  not exists (
    select 1 from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private' and procedure.proname in (
      'ensure_operational_conversation', 'send_operational_message',
      'mark_operational_conversation_read', 'close_operational_conversation'
    ) and procedure.prosecdef
  ),
  'CHAT1 commands run as security invoker'
);
select ok(
  position('chat_context_authorized' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) > 0
  and position('chat_participant_required' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) > 0,
  'Send requires authorized context plus an active participant'
);
select ok(
  position('chat_conversation_closed' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) > 0,
  'Closed conversations reject new messages'
);
select ok(
  position('update public.deliveries' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) = 0
  and position('update public.sales_orders' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) = 0
  and position('update public.receivables' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) = 0
  and position('update public.payments' in lower(pg_get_functiondef('app_private.send_operational_message(uuid, text, uuid, text, uuid)'::regprocedure))) = 0,
  'Text cannot mutate Delivery, Sales, AR, or Payment truth'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.conversations'::regclass
    and conname = 'conversations_context_once'),
  'A context has one durable CHAT1 conversation'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.conversation_messages'::regclass
    and contype = 'u' and pg_get_constraintdef(oid) like '%conversation_id, sender_user_id, client_idempotency_key%'),
  'Same sender retry cannot create a duplicate message'
);
select ok(
  exists (
    select 1 from pg_publication_rel relation join pg_publication publication on publication.oid = relation.prpubid
    where publication.pubname = 'supabase_realtime' and relation.prrelid = 'public.conversation_messages'::regclass
  ),
  'Committed message rows are published to Supabase Realtime'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_messages'
    and policyname = 'conversation_messages_read_participant'
    and qual like '%authenticated_chat_context_authorized%'),
  'Realtime message reads require both participant and currently authorized context'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'evidence'
    and policyname = 'evidence_read_chat_participant')
  and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'evidence_objects_read_chat_participant'),
  'Attachments stay private and are available only to chat participants'
);
select ok(
  exists (select 1 from public.permissions where code = 'chat.read')
  and exists (select 1 from public.permissions where code = 'chat.send')
  and exists (select 1 from public.permissions where code = 'chat.manage'),
  'CHAT1 permissions are explicit capabilities'
);
select ok(
  exists (
    select 1 from public.role_permissions role_permission join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code = 'DRIVER' and permission.code in ('chat.read', 'chat.send')
    group by role.code having count(*) = 2
  ) and exists (
    select 1 from public.role_permissions role_permission join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('OWNER_ADMIN', 'DISPATCHER', 'SUPERVISOR') and permission.code = 'chat.manage'
  ),
  'Workers can chat with operations while supervisors can close an operational conversation'
);

select * from finish(true);
rollback;
