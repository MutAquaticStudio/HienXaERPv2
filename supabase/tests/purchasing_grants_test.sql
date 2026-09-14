begin;
select plan(4);

select ok(
  has_table_privilege('authenticated', 'public.purchase_order_lines', 'SELECT'),
  'authenticated can read purchase order lines through RLS'
);
select ok(
  not has_table_privilege('anon', 'public.purchase_order_lines', 'SELECT'),
  'anon cannot read purchase order lines'
);
select ok(
  (select c.relrowsecurity
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'purchase_order_lines'),
  'purchase order lines keep RLS enabled'
);

set local role authenticated;
select lives_ok(
  $$select id, total_cost_vnd from public.purchase_order_read limit 0$$,
  'authenticated can query the purchase order read view'
);
reset role;

select * from finish();
rollback;
