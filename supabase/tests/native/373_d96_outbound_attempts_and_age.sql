-- D96 (A2): a missing sending setup counts as an attempt (the job ends DEAD after the usual 6), and a push
-- older than 12 hours (announcements and debt reminders: 24 hours) is closed "Quá hạn, không gửi nữa" instead of being sent late.
insert into public.outbound_jobs(id, branch_id, channel, target, payload, dedupe_key, created_at) values
  ('7f373000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'PUSH', 'thiet-bi-373', '{"kind": "work.assigned", "title": "Việc mới"}', 'nt373:fresh', now()),
  ('7f373000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'PUSH', 'thiet-bi-373', '{"kind": "work.assigned", "title": "Việc cũ"}', 'nt373:old-work', now() - interval '13 hours'),
  ('7f373000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'PUSH', 'thiet-bi-373', '{"kind": "announcement", "title": "Thông báo"}', 'nt373:announce-13h', now() - interval '13 hours'),
  ('7f373000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-00000000000a', 'PUSH', 'thiet-bi-373', '{"kind": "customer.debt_reminder", "title": "Nhắc"}', 'nt373:debt-25h', now() - interval '25 hours'),
  ('7f373000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-00000000000a', 'WEBHOOK', 'https://hooks.example.test/373', '{"kind": "payload", "title": "Sự kiện"}', 'nt373:webhook-2d', now() - interval '2 days');

do $test$
declare
  fresh constant uuid := '7f373000-0000-4000-8000-000000000001';
  job public.outbound_jobs%rowtype;
begin
  -- No pg_net: each try counts, with a growing wait, DEAD after the 6th.
  perform private.dispatch_outbound_job(fresh);
  select * into job from public.outbound_jobs where id = fresh;
  assert job.state = 'FAILED' and job.attempt = 1 and job.last_error_safe = 'Chưa bật pg_net trên cơ sở dữ liệu' and job.next_run_at > now(),
    format('first setup failure counted, got %s', to_jsonb(job));
  for i in 2..5 loop perform private.dispatch_outbound_job(fresh); end loop;
  assert (select state || ':' || attempt from public.outbound_jobs where id = fresh) = 'FAILED:5', 'still retrying after 5';
  perform private.dispatch_outbound_job(fresh);
  assert (select state || ':' || attempt from public.outbound_jobs where id = fresh) = 'DEAD:6', 'DEAD after the 6th attempt';
  perform private.dispatch_outbound_job(fresh);
  assert (select attempt from public.outbound_jobs where id = fresh) = 6, 'a DEAD job is not tried again';

  -- Age limits.
  perform private.dispatch_outbound_job('7f373000-0000-4000-8000-000000000002');
  assert (select state || ':' || last_error_safe || ':' || attempt from public.outbound_jobs where id = '7f373000-0000-4000-8000-000000000002')
    = 'DEAD:Quá hạn, không gửi nữa:0', 'work push older than 12 hours is dropped';
  perform private.dispatch_outbound_job('7f373000-0000-4000-8000-000000000003');
  assert (select state || ':' || attempt from public.outbound_jobs where id = '7f373000-0000-4000-8000-000000000003') = 'FAILED:1',
    'an announcement keeps 24 hours';
  perform private.dispatch_outbound_job('7f373000-0000-4000-8000-000000000004');
  assert (select state || ':' || last_error_safe from public.outbound_jobs where id = '7f373000-0000-4000-8000-000000000004')
    = 'DEAD:Quá hạn, không gửi nữa', 'a debt reminder older than 24 hours is dropped';
  perform private.dispatch_outbound_job('7f373000-0000-4000-8000-000000000005');
  assert (select state || ':' || attempt from public.outbound_jobs where id = '7f373000-0000-4000-8000-000000000005') = 'FAILED:1',
    'webhooks have no age limit';
end
$test$;

-- pg_net present, app address / secret missing (Vault stubbed empty): the same counting.
create schema if not exists net;
create table net.sent(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $$ insert into net.sent(url, body, headers) values (url, body, headers) returning id $$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz not null default now());
update public.outbound_jobs set state = 'PENDING', attempt = 4 where id = '7f373000-0000-4000-8000-000000000003';

do $test$
begin
  perform private.dispatch_outbound_job('7f373000-0000-4000-8000-000000000003');
  assert (select state || ':' || attempt || ':' || last_error_safe from public.outbound_jobs where id = '7f373000-0000-4000-8000-000000000003')
    = 'FAILED:5:Chưa cấu hình gửi qua ứng dụng (hx_app_url, hx_automation_secret)', 'missing app setup counted';
  perform private.dispatch_outbound_job('7f373000-0000-4000-8000-000000000003');
  assert (select state || ':' || attempt from public.outbound_jobs where id = '7f373000-0000-4000-8000-000000000003') = 'DEAD:6', 'then DEAD';
  assert not exists (select 1 from net.sent), 'nothing was sent';
end
$test$;
