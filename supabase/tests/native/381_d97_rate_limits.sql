-- D97 (TB-2): public.hit_rate_limit counts tries per bucket and key inside a window, refuses past the limit without counting
-- the refused try, purges tries older than a day, and only service_role may call it; the table is out of reach of the API.
do $test$
declare
  key_a constant text := repeat('a', 64);
  key_b constant text := repeat('b', 64);
  failed text;
begin
  assert has_function_privilege('service_role', 'public.hit_rate_limit(text, text, integer, integer)', 'EXECUTE'), 'service_role may call it';
  assert not has_function_privilege('anon', 'public.hit_rate_limit(text, text, integer, integer)', 'EXECUTE'), 'anon may not';
  assert not has_function_privilege('authenticated', 'public.hit_rate_limit(text, text, integer, integer)', 'EXECUTE'), 'a signed-in user may not';
  assert not has_table_privilege('anon', 'private.rate_limit_hits', 'SELECT') and not has_table_privilege('authenticated', 'private.rate_limit_hits', 'SELECT')
    and not has_table_privilege('authenticated', 'private.rate_limit_hits', 'INSERT'), 'the hits table has no API grant';
  assert (select relrowsecurity from pg_class where oid = 'private.rate_limit_hits'::regclass), 'RLS is on';

  perform set_config('role', 'service_role', true);
  assert public.hit_rate_limit('login_id', key_a, 3, 900), 'try 1 allowed';
  assert public.hit_rate_limit('login_id', key_a, 3, 900), 'try 2 allowed';
  assert public.hit_rate_limit('login_id', key_a, 3, 900), 'try 3 allowed';
  assert not public.hit_rate_limit('login_id', key_a, 3, 900), 'try 4 refused';
  assert not public.hit_rate_limit('login_id', key_a, 3, 900), 'still refused';
  assert public.hit_rate_limit('login_id', key_b, 3, 900), 'another key has its own count';
  assert public.hit_rate_limit('login_ip', key_a, 3, 900), 'another bucket has its own count';
  begin perform public.hit_rate_limit('Login-ID', key_a, 3, 900); exception when others then failed := sqlerrm; end;
  assert failed = 'rate_limit_invalid', format('a bad bucket is refused, got %s', failed);
  failed := null;
  begin perform public.hit_rate_limit('login_id', 'not-a-hash', 3, 900); exception when others then failed := sqlerrm; end;
  assert failed = 'rate_limit_invalid', format('a key that is not a hash is refused, got %s', failed);
  perform pg_temp.act_as_admin();

  assert (select count(*) from private.rate_limit_hits where bucket = 'login_id' and key_hash = key_a) = 3, 'refused tries are not counted';

  -- Tries leave the window: the key is allowed again; tries older than a day are purged.
  update private.rate_limit_hits set hit_at = now() - interval '20 minutes' where key_hash = key_a and bucket = 'login_id';
  insert into private.rate_limit_hits(bucket, key_hash, hit_at) values ('register_ip', key_b, now() - interval '2 days');
  perform set_config('role', 'service_role', true);
  assert public.hit_rate_limit('login_id', key_a, 3, 900), 'allowed again after the window';
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from private.rate_limit_hits where hit_at < now() - interval '1 day'), 'old tries purged';
end
$test$;
