begin;
-- Join eligible current work first, so closed assignment history does not manufacture
-- one available employee row per historical assignment. Keep every active work row.
create or replace view public.workforce_read with(security_invoker=true) as
 select e.id,a.branch_id,e.code,e.display_name,e.active,r.name role_name,
  current_work.id work_item_id,current_work.work_number,current_work.title current_work,
  current_work.execution_state work_state,current_work.scheduled_end
 from public.employee_branch_access a
 join public.employees e on e.id=a.employee_id
 join public.roles r on r.id=a.role_id
 left join lateral (
  select w.id,w.work_number,w.title,w.execution_state,w.scheduled_end
  from public.work_item_assignments wa join public.work_items w on w.id=wa.work_item_id
  where wa.employee_id=e.id and wa.superseded_at is null and w.branch_id=a.branch_id
   and w.execution_state in('CLAIMED','IN_PROGRESS','BLOCKED')
 ) current_work on true
 where a.active;
notify pgrst,'reload schema';
commit;
