-- D97 (security review T-2): "Bật thông báo trên máy này" in a browser.
-- * A Web Push address must belong to a real browser push service: Chrome/Edge(Chromium)/Opera/Samsung (fcm.googleapis.com,
--   the old android.googleapis.com), Firefox (*.push.services.mozilla.com), Edge legacy/Windows (*.notify.windows.com) and
--   Safari (web.push.apple.com). Any other https address is refused, so the app server never posts to a host a login chose.
--   (The Android app's FCM token uses save_app_push_token, which is unchanged.)
-- * An address already saved for ANOTHER login is no longer silently moved: only the same browser (the same push keys,
--   which only that browser holds) may move it, and then it becomes a new row, so nothing queued for the first login follows
--   it (as D86 does for app tokens). Otherwise it is refused (push_subscription_taken).
-- Latest definition replaced: 20261018211000_automation_rules_api.sql. Rows already stored are not changed.
begin;

create or replace function private.push_endpoint_allowed(endpoint text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(char_length(endpoint) <= 1000 and endpoint ~* ('^https://(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com'
    || '|([a-z0-9-]+\.)*push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)(:443)?/[^[:space:]]*$'), false)
$$;
revoke all on function private.push_endpoint_allowed(text) from public, anon, authenticated, service_role;

create or replace function public.save_push_subscription(endpoint text, p256dh text, auth_secret text, user_agent text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  me uuid := (select auth.uid());
  existing public.push_subscriptions%rowtype;
  saved uuid;
begin
  if me is null or not private.auth_actor_active() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.push_endpoint_allowed(save_push_subscription.endpoint) then raise exception 'push_subscription_invalid' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('push_subscription:' || save_push_subscription.endpoint, 0));
  select * into existing from public.push_subscriptions s where s.endpoint = save_push_subscription.endpoint for update;
  if existing.id is not null and existing.auth_user_id <> me then
    if existing.p256dh is distinct from save_push_subscription.p256dh or existing.auth_secret is distinct from save_push_subscription.auth_secret then
      raise exception 'push_subscription_taken' using errcode = '42501';
    end if;
    delete from public.push_subscriptions s where s.id = existing.id;
  end if;
  insert into public.push_subscriptions(auth_user_id, endpoint, p256dh, auth_secret, user_agent)
  values (me, save_push_subscription.endpoint, save_push_subscription.p256dh, save_push_subscription.auth_secret, left(save_push_subscription.user_agent, 300))
  on conflict on constraint push_subscriptions_endpoint_key do update set p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret, user_agent = excluded.user_agent, created_at = now()
  where public.push_subscriptions.auth_user_id = me
  returning id into saved;
  if saved is null then raise exception 'push_subscription_taken' using errcode = '42501'; end if;
  return saved;
exception when check_violation then
  raise exception 'push_subscription_invalid' using errcode = '22023';
end
$function$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
