-- D97 (security review TB-2): limits on how often sign-in, self-registration and password recovery may be tried, kept in
-- Postgres (PLAN-025: no cache or queue service).
-- * private.rate_limit_hits: one row per counted try — a bucket ("login_ip", "login_id", …) and a SHA-256 key the app computes
--   from the caller's IP or the sign-in name (neither is stored in clear). RLS on, no grant to anon or authenticated.
-- * public.hit_rate_limit(bucket, key_hash, max_hits, window_seconds): true = allowed and counted; false = already max_hits
--   tries inside the window (the refused try is not counted, so waiting is enough). Only service_role may execute it: the app
--   calls it from its auth module before Supabase Auth, where there is no signed-in user yet. Tries older than a day are
--   purged on every call.
-- * The assistant (askAiAction) is limited per person per hour by counting the caller's own ai_usage_log rows; this index
--   keeps that count cheap.
begin;

create table private.rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null check (bucket ~ '^[a-z_]{2,40}$'),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  hit_at timestamptz not null default now()
);
create index rate_limit_hits_key_idx on private.rate_limit_hits(bucket, key_hash, hit_at desc);
create index rate_limit_hits_age_idx on private.rate_limit_hits(hit_at);
alter table private.rate_limit_hits enable row level security;
revoke all on private.rate_limit_hits from public, anon, authenticated;

create or replace function public.hit_rate_limit(bucket text, key_hash text, max_hits integer, window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $function$
declare
  recent integer;
begin
  if hit_rate_limit.bucket is null or hit_rate_limit.bucket !~ '^[a-z_]{2,40}$' or hit_rate_limit.key_hash is null
    or hit_rate_limit.key_hash !~ '^[0-9a-f]{64}$' or coalesce(max_hits, 0) not between 1 and 10000
    or coalesce(window_seconds, 0) not between 1 and 86400 then
    raise exception 'rate_limit_invalid' using errcode = '22023';
  end if;
  delete from private.rate_limit_hits h where h.hit_at < now() - interval '1 day';
  perform pg_advisory_xact_lock(hashtextextended('rate_limit:' || hit_rate_limit.bucket || ':' || hit_rate_limit.key_hash, 0));
  select count(*) into recent from private.rate_limit_hits h
  where h.bucket = hit_rate_limit.bucket and h.key_hash = hit_rate_limit.key_hash and h.hit_at > now() - make_interval(secs => window_seconds);
  if recent >= max_hits then return false; end if;
  insert into private.rate_limit_hits(bucket, key_hash) values (hit_rate_limit.bucket, hit_rate_limit.key_hash);
  return true;
end
$function$;
revoke all on function public.hit_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;

create index if not exists ai_usage_log_user_recent on public.ai_usage_log(user_id, created_at desc);

notify pgrst, 'reload schema';
commit;
