alter table public.report_export_jobs
  add column consecutive_failures integer not null default 0;

create or replace function public.advance_report_export_job(target_job_id uuid)
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
    return jsonb_build_object('id', job.id, 'state', job.state, 'processedRows', job.processed_rows,
      'attempt', job.attempt, 'safeError', job.safe_error, 'nextRunAt', job.next_run_at);
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
      consecutive_failures = 0,
      state = case when more_rows then 'PENDING' else 'COMPLETED' end,
      next_run_at = now(), lease_until = null, safe_error = null, updated_at = now()
    where id = job.id;
  exception when others then
    update public.report_export_jobs set
      consecutive_failures = consecutive_failures + 1,
      state = case when consecutive_failures + 1 >= 3 then 'FAILED' else 'PENDING' end,
      next_run_at = now() + interval '30 seconds', lease_until = null,
      safe_error = 'Không thể xử lý lô xuất file. Có thể thử lại sau.', updated_at = now()
    where id = job.id;
  end;

  select * into job from public.report_export_jobs where id = target_job_id;
  return jsonb_build_object('id', job.id, 'state', job.state, 'processedRows', job.processed_rows,
    'attempt', job.attempt, 'safeError', job.safe_error, 'nextRunAt', job.next_run_at);
end;
$$;
