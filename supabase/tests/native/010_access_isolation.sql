-- Branch isolation and permission resolution for authenticated callers.
do $test$
declare codes text[];
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  select array_agg(code order by code) into codes from public.branches where code like 'NT_%';
  assert codes = array['NT_A'], format('branch RLS must isolate rows, got %s', codes);
  assert private.has_permission('20000000-0000-4000-8000-00000000000a', 'orders.read'), 'own branch permission';
  assert not private.has_permission('20000000-0000-4000-8000-00000000000b', 'orders.read'), 'other branch denied';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  assert private.has_permission('20000000-0000-4000-8000-00000000000a', 'dashboard.read'), 'reader can read dashboard';
  assert not private.has_permission('20000000-0000-4000-8000-00000000000a', 'finance.profit.read'), 'reader cannot read profit';
end
$test$;
