create table public.report_export_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  branch_id uuid not null,
  side text not null check (side in ('AR', 'AP')),
  as_of_date date not null,
  knowledge_cutoff timestamptz not null,
  customer_id uuid,
  dedupe_key text not null,
  state text not null default 'PENDING' check (state in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  attempt integer not null default 0,
  next_run_at timestamptz not null default now(),
  lease_until timestamptz,
  safe_error text,
  processed_rows integer not null default 0,
  rows_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, dedupe_key)
);

create index report_export_jobs_pending_idx on public.report_export_jobs (state, next_run_at)
  where state in ('PENDING', 'RUNNING');

alter table public.report_export_jobs enable row level security;
create policy report_export_jobs_owner_read on public.report_export_jobs for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and private.has_permission(branch_id, case side when 'AR' then 'finance.ar.read' else 'finance.ap.read' end)
  );
revoke all on public.report_export_jobs from public, anon, authenticated;
grant select on public.report_export_jobs to authenticated;

create function public.create_report_export_job(
  target_branch_id uuid, target_side text, target_as_of date,
  target_cutoff timestamptz, target_customer_id uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  key text;
  result_id uuid;
begin
  if actor is null or target_side not in ('AR', 'AP')
     or target_as_of is null or target_cutoff is null or target_cutoff > now()
     or (target_side = 'AP' and target_customer_id is not null)
     or not private.has_permission(target_branch_id, case target_side when 'AR' then 'finance.ar.read' else 'finance.ap.read' end)
  then raise exception 'report_export_forbidden' using errcode = '42501'; end if;

  key := md5(concat_ws(':', actor, target_branch_id, target_side, target_as_of, target_cutoff, coalesce(target_customer_id::text, '')));
  insert into public.report_export_jobs (owner_user_id, branch_id, side, as_of_date, knowledge_cutoff, customer_id, dedupe_key)
  values (actor, target_branch_id, target_side, target_as_of, target_cutoff, target_customer_id, key)
  on conflict (owner_user_id, dedupe_key) do update set updated_at = public.report_export_jobs.updated_at
  returning id into result_id;
  return result_id;
end;
$$;

create function public.advance_report_export_job(target_job_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  job public.report_export_jobs%rowtype;
  item record;
  batch jsonb := '[]'::jsonb;
  batch_count integer := 0;
  more_rows boolean := false;
begin
  select * into job from public.report_export_jobs where id = target_job_id for update;
  if not found or job.owner_user_id is distinct from auth.uid()
     or not private.has_permission(job.branch_id, case job.side when 'AR' then 'finance.ar.read' else 'finance.ap.read' end)
  then raise exception 'report_export_forbidden' using errcode = '42501'; end if;

  if job.state in ('COMPLETED', 'FAILED') or job.next_run_at > now()
     or (job.lease_until is not null and job.lease_until > now()) then
    return jsonb_build_object('id', job.id, 'state', job.state, 'processedRows', job.processed_rows, 'attempt', job.attempt, 'safeError', job.safe_error);
  end if;

  update public.report_export_jobs set state = 'RUNNING', attempt = attempt + 1,
    lease_until = now() + interval '30 seconds', updated_at = now() where id = job.id;
  begin
    for item in
      select obligation_id, party_name, site_name, source_type, due_date, outstanding_amount_vnd
      from public.finance_obligation_snapshot(
        target_branch_id := job.branch_id,
        target_side := job.side,
        as_of := ((job.as_of_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh') - interval '1 millisecond',
        knowledge_cutoff := job.knowledge_cutoff,
        target_customer_id := job.customer_id,
        target_site_id := null,
        target_sales_employee_id := null
      )
      where outstanding_amount_vnd > 0
      order by outstanding_amount_vnd desc, obligation_id
      offset job.processed_rows limit 501
    loop
      if batch_count = 500 then more_rows := true; exit; end if;
      batch := batch || jsonb_build_object(
        'id', item.obligation_id,
        'label', item.party_name,
        'context', concat(coalesce(item.site_name, item.source_type), ' · ', item.source_type),
        'date', item.due_date,
        'amountVnd', item.outstanding_amount_vnd::text
      );
      batch_count := batch_count + 1;
    end loop;

    update public.report_export_jobs set
      rows_json = rows_json || batch,
      processed_rows = processed_rows + batch_count,
      state = case when more_rows then 'PENDING' else 'COMPLETED' end,
      next_run_at = now(), lease_until = null, safe_error = null, updated_at = now()
    where id = job.id;
  exception when others then
    update public.report_export_jobs set
      state = case when attempt >= 3 then 'FAILED' else 'PENDING' end,
      next_run_at = now() + interval '30 seconds', lease_until = null,
      safe_error = 'Không thể xử lý lô xuất file. Có thể thử lại sau.', updated_at = now()
    where id = job.id;
  end;

  select * into job from public.report_export_jobs where id = target_job_id;
  return jsonb_build_object('id', job.id, 'state', job.state, 'processedRows', job.processed_rows, 'attempt', job.attempt, 'safeError', job.safe_error);
end;
$$;

revoke all on function public.create_report_export_job(uuid, text, date, timestamptz, uuid), public.advance_report_export_job(uuid) from public, anon, authenticated;
grant execute on function public.create_report_export_job(uuid, text, date, timestamptz, uuid), public.advance_report_export_job(uuid) to authenticated;
