-- FB12 (D34e): "Xóa nhân viên" deletes a person with no history and sets anyone with history to "Ngừng làm việc".
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000305'), ('10000000-0000-4000-8000-000000000306');
insert into public.employees(id, auth_user_id, code, display_name) values
  ('30000000-0000-4000-8000-000000000305', '10000000-0000-4000-8000-000000000305', 'NT_E305', 'Thợ mới 305'),
  ('30000000-0000-4000-8000-000000000306', '10000000-0000-4000-8000-000000000306', 'NT_E306', 'Thợ cũ 306');
insert into public.employee_branch_access(employee_id, branch_id, role_id) values
  ('30000000-0000-4000-8000-000000000305', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000306', '20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000002');
-- Thợ cũ 306 has acted in the books (an audit entry as actor).
insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
values ('10000000-0000-4000-8000-000000000306', '20000000-0000-4000-8000-00000000000a', 'test.action', 'branch',
  '20000000-0000-4000-8000-00000000000a', gen_random_uuid(), array['x']);

do $test$
declare outcome jsonb; failed text;
begin
  -- A reader cannot remove anyone; nobody removes themselves or another role manager.
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.remove_employee('30000000-0000-4000-8000-000000000305', gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'reader refused';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.remove_employee('30000000-0000-4000-8000-000000000001', gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'not oneself';
  -- Branch B is out of reach of the branch A manager.
  failed := null;
  begin perform public.remove_employee('30000000-0000-4000-8000-000000000002', gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'other branch refused';

  outcome := public.remove_employee('30000000-0000-4000-8000-000000000305', '7f305000-0000-4000-8000-000000000001');
  assert outcome->>'result' = 'DELETED' and outcome->>'auth_user_id' = '10000000-0000-4000-8000-000000000305', format('deleted %s', outcome);
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from public.employees where id = '30000000-0000-4000-8000-000000000305'), 'employee row gone';
  assert not exists (select 1 from public.employee_branch_access where employee_id = '30000000-0000-4000-8000-000000000305'), 'access gone';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  outcome := public.remove_employee('30000000-0000-4000-8000-000000000306', '7f305000-0000-4000-8000-000000000002');
  assert outcome->>'result' = 'DEACTIVATED', format('history keeps the person %s', outcome);
  assert (public.remove_employee('30000000-0000-4000-8000-000000000306', '7f305000-0000-4000-8000-000000000002')->>'replayed')::boolean, 'replay';
  perform pg_temp.act_as_admin();
  assert (select not active and deactivated_at is not null from public.employees where id = '30000000-0000-4000-8000-000000000306'), 'stopped';
  assert not exists (select 1 from public.employee_branch_access where employee_id = '30000000-0000-4000-8000-000000000306' and active), 'no active access';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  perform public.restore_employee('30000000-0000-4000-8000-000000000306', gen_random_uuid());
  perform pg_temp.act_as_admin();
  assert (select active from public.employees where id = '30000000-0000-4000-8000-000000000306'), 'works again';
  assert exists (select 1 from public.employee_branch_access where employee_id = '30000000-0000-4000-8000-000000000306' and active), 'access back';
  assert exists (select 1 from public.audit_events where action = 'employee.deleted' and entity_id = '30000000-0000-4000-8000-000000000305'), 'deletion audited';
end
$test$;
