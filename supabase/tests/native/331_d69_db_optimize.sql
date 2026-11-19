-- D69: the AI policies read auth.uid() once per query, the look-up indexes exist, and the policies still decide the same rows.
do $test$
declare
  policy_text text;
  names text[] := array['sales_orders_customer_idx','sales_order_lines_material_idx','inventory_movements_material_idx','payments_customer_idx',
    'purchase_orders_supplier_idx','purchase_order_lines_material_idx','attendance_records_shift_idx','shift_assignments_shift_idx'];
  n text; mine uuid; seen integer;
begin
  foreach n in array names loop
    assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = n), format('index %s exists', n);
  end loop;
  select qual into policy_text from pg_policies where schemaname = 'public' and tablename = 'ai_chat_messages' and policyname = 'ai_chat_messages_own';
  assert policy_text like '%SELECT auth.uid()%', format('initplan form, got %s', policy_text);

  -- Behaviour is unchanged: a person sees only their own saved turns.
  perform pg_temp.act_as_admin();
  insert into public.ai_chat_messages(branch_id, auth_user_id, role, body)
    select '20000000-0000-4000-8000-00000000000a', u, 'user', 'x' from unnest(array['10000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000003'::uuid]) u;
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select count(*) into seen from public.ai_chat_messages;
  assert seen = 1, format('only own turns visible, got %s', seen);
end
$test$;
