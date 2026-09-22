import { randomUUID } from 'node:crypto';
import { guard, email } from './core.mjs';

const title = 'HXQA UAT assigned work';

export async function ensureWorkerUat(sql) {
  guard();
  return sql.begin(async tx => {
    const [owner] = await tx`select id from auth.users where email=${email('owner')}`;
    const [worker] = await tx`
      select e.id as employee_id, a.branch_id
      from auth.users u
      join public.employees e on e.auth_user_id=u.id and e.active=true
      join public.employee_branch_access a on a.employee_id=e.id and a.active=true
      where u.email=${email('worker')}
      order by a.branch_id
      limit 1
    `;
    if (!owner || !worker) throw new Error('QA owner or active worker access is missing');

    const [existing] = await tx`
      select w.id, w.title
      from public.work_items w
      join public.work_item_assignments a
        on a.work_item_id=w.id and a.employee_id=${worker.employee_id}
        and a.superseded_at is null
      where w.branch_id=${worker.branch_id}
        and w.title=${title}
        and w.work_number like ${'HXQA-UAT-WORK-%'}
        and w.execution_state='IN_PROGRESS'
        and w.scheduled_end>now()
        and (w.lease_expires_at is null or w.lease_expires_at>now())
      order by w.created_at desc
      limit 1
    `;
    if (existing) return existing;

    const [site] = await tx`
      select c.id as customer_id, s.id as site_id
      from public.customers c
      join public.customer_sites s on s.customer_id=c.id
      where c.branch_id=${worker.branch_id} and c.active=true and s.active=true
      order by s.created_at
      limit 1
    `;
    if (!site) throw new Error('QA worker branch has no active customer site');

    const nonce = randomUUID();
    const [job] = await tx`
      insert into public.service_jobs
        (branch_id,job_number,customer_id,site_id,service_type,description,
         scheduled_start,scheduled_end,planned_quantity,unit_label,execution_state,created_by)
      values
        (${worker.branch_id},${'HXQA-UAT-SERVICE-' + nonce},${site.customer_id},${site.site_id},
         'QA service','QA UAT worker fixture',
         now()-interval '5 minutes',now()+interval '1 day',1,'job','IN_PROGRESS',${owner.id})
      returning id
    `;
    const [work] = await tx`
      insert into public.work_items
        (branch_id,work_number,service_job_id,title,assignment_mode,execution_state,
         scheduled_start,scheduled_end,started_at,last_heartbeat_at,lease_expires_at,created_by)
      values
        (${worker.branch_id},${'HXQA-UAT-WORK-' + nonce},${job.id},${title},'DIRECT','IN_PROGRESS',
         now()-interval '5 minutes',now()+interval '1 day',now(),now(),
         now()+interval '2 hours',${owner.id})
      returning id,title
    `;
    await tx`
      insert into public.work_item_assignments
        (work_item_id,assignment_version,employee_id,assignment_kind,assigned_by)
      values (${work.id},1,${worker.employee_id},'DIRECT',${owner.id})
    `;
    return work;
  });
}
