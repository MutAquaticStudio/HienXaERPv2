-- Stable branch trace for the one-time recording-start audit; no activation state change.
begin;
create or replace function private.require_active_operations(b uuid) returns void
 language plpgsql security definer set search_path='' as $recording$
declare valid_start timestamptz; inserted uuid;
begin
 if b is null or auth.uid() is null or not exists(
  select 1 from public.employees e join public.employee_branch_access a on a.employee_id=e.id and a.active
  join public.roles r on r.id=a.role_id and r.active join public.branches branch on branch.id=a.branch_id and branch.active
  where e.auth_user_id=auth.uid() and e.active and a.branch_id=b)
 then raise exception 'forbidden_operational_branch' using errcode='42501';end if;
 -- Keep an already recorded start. No writer changes the opening/activation state.
 if exists(select 1 from private.branch_recorded_operations where branch_id=b) then return;end if;
 select e.recorded_at into valid_start from private.branch_operational_states s
  join private.operational_state_events e on e.operation_id=s.activation_operation_id and e.branch_id=s.branch_id
  where s.branch_id=b and s.state='ACTIVE' and e.intent->>'action'='activate';
 insert into private.branch_recorded_operations(branch_id,started_at,started_by,basis)
 values(b,coalesce(valid_start,statement_timestamp()),auth.uid(),
  case when valid_start is null then 'FIRST_RECORDED_TRANSACTION' else 'EXISTING_ACTIVATION' end)
 on conflict(branch_id) do nothing returning branch_id into inserted;
 if inserted is not null then
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields)
  values(auth.uid(),b,'operations.recording_started','branch',b,b,array['recorded_operations_start']);
 end if;
end $recording$;
revoke all on function private.require_active_operations(uuid) from public,anon,authenticated,service_role;

commit;
