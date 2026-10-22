-- FB7 5/5: a delivery handled on the office page no longer leaves the worker's job open; open jobs left behind are closed.
begin;

-- A delivery job follows its delivery whichever page moved it: reported → done, verified → verified, cancelled → cancelled.
create or replace function private.sync_work_item_from_delivery() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare w public.work_items%rowtype; a public.work_item_assignments%rowtype; result_id uuid; me uuid := (select auth.uid());
begin
  if new.execution_state in ('RESULT_SUBMITTED', 'VERIFIED') then
    for w in select * from public.work_items where delivery_id = new.id
        and execution_state in ('AVAILABLE', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED') order by id for update loop
      select * into a from public.work_item_assignments where work_item_id = w.id and superseded_at is null;
      if a.id is null or me is null then
        update public.work_items set execution_state = 'CANCELLED', version = version + 1 where id = w.id;
      else
        insert into public.work_item_results(work_item_id, assignment_id, actual_quantity, note, receiver_name, submitted_by)
        values (w.id, a.id, null, 'Nhân viên báo thay thợ', null, me) on conflict (work_item_id) do nothing;
        update public.work_items set execution_state = 'DONE', started_at = coalesce(started_at, now()), completed_at = now(),
          version = version + 1 where id = w.id;
      end if;
    end loop;
  end if;
  if new.execution_state = 'VERIFIED' and me is not null then
    for w in select * from public.work_items where delivery_id = new.id and execution_state = 'DONE' order by id for update loop
      select r.id into result_id from public.work_item_results r where r.work_item_id = w.id;
      if result_id is null or exists (select 1 from public.work_item_verifications v where v.work_item_id = w.id) then continue; end if;
      insert into public.work_item_verifications(work_item_id, result_id, verification_kind, verified_by) values (w.id, result_id, 'DELIVERY_SOURCE', me);
      update public.work_items set execution_state = 'VERIFIED', version = version + 1 where id = w.id;
    end loop;
  end if;
  if new.execution_state = 'CANCELLED' then
    update public.work_items set execution_state = 'CANCELLED', version = version + 1
    where delivery_id = new.id and execution_state in ('AVAILABLE', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED');
  end if;
  return null;
end
$function$;
revoke all on function private.sync_work_item_from_delivery() from public, anon, authenticated, service_role;
create trigger deliveries_sync_work_item after update of execution_state on public.deliveries
  for each row when (old.execution_state is distinct from new.execution_state)
  execute function private.sync_work_item_from_delivery();

-- The worker's report notifies once, from submit_portal_delivery_done, with the verification outcome.
create or replace function private.notify_delivery_result() returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if new.execution_state = 'RESULT_SUBMITTED' and old.execution_state is distinct from 'RESULT_SUBMITTED'
    and coalesce(current_setting('hx.delivery_auto_verify', true), '') <> 'on' then
    perform private.notify(new.branch_id, 'delivery.result_submitted', 'delivery', new.id,
      case new.result_kind when 'FAILED' then 'Không giao được ' || new.delivery_number
        when 'PARTIAL' then 'Giao thiếu ' || new.delivery_number else new.delivery_number || ' đã giao — chờ xác minh' end,
      new.customer_name_snapshot || ' · ' || new.site_name_snapshot, '/admin/deliveries/' || new.id, 'delivery.verify', null,
      'delivery.result:' || new.id || ':' || new.version);
  end if;
  return new;
end
$function$;
revoke all on function private.notify_delivery_result() from public, anon, authenticated, service_role;

-- A verified delivery job earns as before, also when it was verified from the worker's own report.
create or replace function private.recognize_verified_work() returns trigger
language plpgsql security definer set search_path='' as $function$
declare source record; policy record; amount bigint;
begin
  select v.id,v.verified_by,v.verified_at,a.employee_id into source
    from public.work_item_verifications v join public.work_item_results r on r.id=v.result_id
    join public.work_item_assignments a on a.id=r.assignment_id and a.work_item_id=new.id
    where v.work_item_id=new.id;
  if source.id is null then raise exception 'verified_work_source_required' using errcode='23503'; end if;
  select p.*,r.rate_vnd_per_unit into policy from public.compensation_recognition_policies p
    join public.compensation_rules r on r.id=p.rule_id
    where p.branch_id=new.branch_id and p.employee_id=source.employee_id and p.recognition_kind='WORK_ITEM_VERIFICATION'
      and source.verified_at>=p.effective_at
      and (source.verified_at at time zone 'Asia/Ho_Chi_Minh')::date>=r.effective_from
      and (r.effective_to is null or (source.verified_at at time zone 'Asia/Ho_Chi_Minh')::date<=r.effective_to);
  if policy.rule_id is null then return new; end if;
  if source.verified_by<>(select auth.uid()) or not
    ((new.delivery_id is not null and (private.has_permission(new.branch_id,'work.verify')
        -- FB7: a delivery job is verified together with its delivery, also from the worker's own report.
        or exists (select 1 from public.deliveries d where d.id=new.delivery_id and d.execution_state='VERIFIED')))
      or (new.service_job_id is not null and private.has_permission(new.branch_id,'service.verify'))) then
    raise exception 'forbidden_work_recognition' using errcode='42501'; end if;
  amount:=round(policy.rate_vnd_per_unit)::bigint;
  perform private.post_recognized_earning(policy.rule_id,'WORK_ITEM_VERIFICATION:'||source.id::text,source.id,
    null,null,null,amount,source.verified_by);
  return new;
end $function$;

revoke all on function private.recognize_verified_work() from public, anon, authenticated;

-- Jobs left open by deliveries already handled on the office page (Production: 3 jobs) are closed, without back-dated earnings.
update public.work_items w set execution_state = 'CANCELLED', version = w.version + 1
from public.deliveries d
where d.id = w.delivery_id and d.execution_state in ('RESULT_SUBMITTED', 'VERIFIED', 'CANCELLED')
  and w.execution_state in ('AVAILABLE', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED');

notify pgrst, 'reload schema';
commit;
