begin;
-- Assignment facts stay immutable. Only a current, unstarted assignment may be retired.
create function private.guard_work_assignment_supersession() returns trigger
language plpgsql security definer set search_path='' as $body$
declare work public.work_items%rowtype;
begin
 if tg_op='UPDATE' and old.superseded_at is null and new.superseded_at is not null
  and (to_jsonb(old)-'superseded_at')=(to_jsonb(new)-'superseded_at') then
  select * into work from public.work_items where id=old.work_item_id for update;
  if work.started_at is null and work.execution_state in('AVAILABLE','CLAIMED')
   and (private.has_permission(work.branch_id,'work.manage')
     or (work.delivery_id is not null and private.has_permission(work.branch_id,'delivery.assign'))) then
   return new;
  end if;
 end if;
 raise exception 'work_assignment_history_immutable' using errcode='55000';
end $body$;
revoke all on function private.guard_work_assignment_supersession() from public,anon,authenticated,service_role;
drop trigger work_assignments_immutable on public.work_item_assignments;
create trigger work_assignments_immutable before update or delete on public.work_item_assignments
 for each row execute function private.guard_work_assignment_supersession();
commit;
