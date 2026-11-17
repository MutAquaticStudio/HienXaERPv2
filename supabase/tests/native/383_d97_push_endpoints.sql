-- D97 (T-2): save_push_subscription takes only addresses of real browser push services, and an address saved by another
-- login is not taken over unless the same browser (same push keys) saves it; then it becomes a new row of the new login.
do $test$
declare
  first_user constant uuid := '10000000-0000-4000-8000-000000000001';
  second_user constant uuid := '10000000-0000-4000-8000-000000000002';
  device constant text := 'https://fcm.googleapis.com/fcm/send/d97-383';
  first_row uuid;
  moved uuid;
  failed text;
  target text;
begin
  foreach target in array array['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x',
    'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://web.push.apple.com/x', 'https://android.googleapis.com/gcm/send/x'] loop
    assert private.push_endpoint_allowed(target), format('accepted: %s', target);
  end loop;
  foreach target in array array['https://push.example.test/x', 'https://fcm.googleapis.com.evil.example/x', 'https://fcm.googleapis.com' || '@evil.example/x',
    'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://10.0.0.5/x', 'https://notify.windows.com/x', null] loop
    assert not private.push_endpoint_allowed(target), format('refused: %s', coalesce(target, 'null'));
  end loop;

  perform pg_temp.act_as(first_user);
  begin perform public.save_push_subscription('https://push.example.test/383', repeat('p', 40), repeat('a', 16), 'Chrome');
  exception when others then failed := sqlerrm; end;
  assert failed = 'push_subscription_invalid', format('another host is refused, got %s', failed);
  first_row := public.save_push_subscription(device, repeat('p', 40), repeat('a', 16), 'Chrome');
  -- The same login saving again (new keys) keeps its row.
  assert public.save_push_subscription(device, repeat('q', 40), repeat('b', 16), 'Chrome') = first_row, 'own device updated in place';

  -- Another login with other keys cannot take the address.
  perform pg_temp.act_as(second_user);
  failed := null;
  begin perform public.save_push_subscription(device, repeat('z', 40), repeat('z', 16), 'Chrome');
  exception when others then failed := sqlerrm; end;
  assert failed = 'push_subscription_taken', format('a foreign address is not reassigned, got %s', failed);
  perform pg_temp.act_as_admin();
  assert (select auth_user_id from public.push_subscriptions where endpoint = device) = first_user, 'still the first login''s';

  -- The same browser (same keys) signed in by another login: moved, as a new row.
  perform pg_temp.act_as(second_user);
  moved := public.save_push_subscription(device, repeat('q', 40), repeat('b', 16), 'Chrome');
  perform pg_temp.act_as_admin();
  assert moved <> first_row, 'a new row for the new login';
  assert (select auth_user_id from public.push_subscriptions where endpoint = device) = second_user, 'now the second login''s';
  assert not exists (select 1 from public.push_subscriptions where id = first_row), 'the first login''s row is gone';
end
$test$;
