-- Add assignable operational templates without changing any existing role/access.
-- SPEC-ACC-001..005; UX-910. Customer memberships remain a separate model.
begin;

do $$
begin
  if exists (
    select 1 from unnest(array['catalog.read', 'compensation.approve', 'compensation.read', 'customers.manage', 'customers.read', 'dashboard.read', 'delivery.assign', 'delivery.create', 'delivery.exception', 'delivery.handoff', 'delivery.read', 'delivery.verify', 'finance.account.manage', 'finance.ap.adjust', 'finance.ap.read', 'finance.ar.adjust', 'finance.ar.read', 'finance.expense.manage', 'finance.expense.read', 'finance.payment.post', 'finance.payment.reverse', 'finance.payment_notice.review', 'finance.profit.read', 'finance.reconcile', 'inventory.cost.read', 'inventory.count', 'inventory.read', 'inventory.receive', 'inventory.reserve', 'orders.cancel', 'orders.confirm', 'orders.create', 'orders.read', 'pricing.read', 'purchasing.cancel', 'purchasing.confirm', 'purchasing.create', 'purchasing.price.manage', 'purchasing.price.read', 'purchasing.read', 'quotation.create', 'quotation.read', 'quotation.send', 'service.read', 'service.verify', 'suppliers.manage', 'suppliers.read', 'work.claim', 'work.manage', 'work.read', 'work.verify', 'workforce.read']::text[]) required(code)
    where not exists(select 1 from public.permissions p where p.code=required.code)
  ) then raise exception 'operational_role_permission_missing' using errcode='23503'; end if;
end $$;

with presets(code,name,permissions) as (values
  ('builtin_manager', 'Quản lý', array['catalog.read', 'customers.read', 'suppliers.read', 'orders.read', 'quotation.read', 'pricing.read', 'purchasing.read', 'purchasing.price.read', 'inventory.read', 'inventory.cost.read', 'delivery.read', 'delivery.verify', 'delivery.exception', 'workforce.read', 'work.verify', 'service.read', 'service.verify', 'compensation.read', 'compensation.approve', 'finance.ar.read', 'finance.ap.read', 'finance.expense.read', 'finance.profit.read', 'dashboard.read']::text[]),
  ('builtin_sales', 'Bán hàng', array['catalog.read', 'customers.read', 'customers.manage', 'pricing.read', 'orders.read', 'orders.create', 'orders.confirm', 'orders.cancel', 'quotation.read', 'quotation.create', 'quotation.send', 'delivery.read', 'inventory.read', 'finance.ar.read']::text[]),
  ('builtin_purchasing', 'Mua hàng', array['catalog.read', 'suppliers.read', 'suppliers.manage', 'orders.read', 'purchasing.read', 'purchasing.create', 'purchasing.confirm', 'purchasing.cancel', 'purchasing.price.read', 'purchasing.price.manage', 'delivery.read', 'inventory.read', 'finance.ap.read']::text[]),
  ('builtin_warehouse', 'Nhân viên kho', array['catalog.read', 'customers.read', 'suppliers.read', 'orders.read', 'purchasing.read', 'inventory.read', 'inventory.receive', 'inventory.reserve', 'inventory.count', 'delivery.read', 'delivery.handoff']::text[]),
  ('builtin_dispatch', 'Điều phối', array['catalog.read', 'customers.read', 'suppliers.read', 'orders.read', 'inventory.read', 'delivery.read', 'delivery.create', 'delivery.assign', 'delivery.exception', 'workforce.read', 'work.manage', 'service.read']::text[]),
  ('builtin_accountant', 'Kế toán', array['catalog.read', 'customers.read', 'suppliers.read', 'orders.read', 'purchasing.read', 'purchasing.price.read', 'delivery.read', 'inventory.read', 'inventory.cost.read', 'finance.ar.read', 'finance.ar.adjust', 'finance.ap.read', 'finance.ap.adjust', 'finance.account.manage', 'finance.payment.post', 'finance.payment.reverse', 'finance.payment_notice.review', 'finance.reconcile', 'finance.expense.read', 'finance.expense.manage', 'finance.profit.read', 'compensation.read']::text[]),
  ('builtin_worker', 'Thợ', array['work.read', 'work.claim']::text[]),
  ('builtin_driver', 'Tài xế', array['work.read', 'work.claim']::text[])
), added as (
  insert into public.roles(code,name,active,system_role)
  select code,name,true,true from presets
  on conflict(code) do nothing
  returning id,code
)
insert into public.role_permissions(role_id,permission_code)
select added.id,p.permission_code from added
join presets using(code)
cross join lateral unnest(presets.permissions) as p(permission_code);

-- Preserve the existing invitation implementation, with the same privilege
-- ceiling already enforced by assign_employee_role. No policy/grant change.
do $migration$
declare definition text; anchor text := 'if change_reason is null or char_length(change_reason) < 3 then';
begin
  definition := pg_get_functiondef('public.register_invited_employee(uuid,text,text,uuid,uuid,text,uuid)'::regprocedure);
  if position('role_exceeds_actor_permissions' in definition)=0 then
    if position(anchor in definition)=0 then
      raise exception 'invite_definition_changed_review_required';
    end if;
    definition := replace(definition,anchor,$guard$
  if exists (
    select 1 from public.role_permissions p
    where p.role_id=target_role_id
      and not private.has_permission(target_branch_id,p.permission_code)
  ) then
    raise exception 'role_exceeds_actor_permissions' using errcode='42501';
  end if;

$guard$ || anchor);
    execute definition;
  end if;
end $migration$;

-- Serialize the employee first, then replay the same immutable role intent.
-- A replay never restores an older role after a subsequent assignment/revocation.
do $migration$
declare definition text; anchor text := '  return private.assign_employee_role(target_employee_id,target_branch_id,target_role_id,change_reason,operation_id);';
begin
  definition := pg_get_functiondef('public.assign_employee_role(uuid,uuid,uuid,text,uuid)'::regprocedure);
  if position('role_assignment_operation_conflict' in definition)=0 then
    if position(anchor in definition)=0 or position(E'\nbegin\n' in definition)=0 then
      raise exception 'assign_role_definition_changed_review_required';
    end if;
    definition := replace(definition,E'\nbegin\n',E'\ndeclare replay_event public.audit_events%rowtype; replay_access public.employee_branch_access%rowtype;\nbegin\n');
    if position('  perform 1 from public.employees where id=target_employee_id for update;' in definition)=0 then
      raise exception 'assign_role_lock_changed_review_required';
    end if;
    definition := replace(definition,'  perform 1 from public.employees where id=target_employee_id for update;', $lock$
  if operation_id is null then raise exception 'operation_id_required' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('employee.role.assign:' || operation_id::text,0));
  perform 1 from public.employees where id=target_employee_id for update;
$lock$);
    definition := replace(definition,anchor,$guard$
  if (select count(*) from public.audit_events where trace_id=operation_id and action='employee.role.assign') > 1 then
    raise exception 'legacy_role_assignment_operation_requires_review' using errcode='22023';
  end if;
  select * into replay_event from public.audit_events
  where trace_id=operation_id and action='employee.role.assign';
  if replay_event.id is not null then
    select * into replay_access from public.employee_branch_access where id=replay_event.entity_id;
    if replay_event.actor_auth_user_id is distinct from auth.uid()
      or replay_event.branch_id is distinct from target_branch_id
      or replay_event.reason is distinct from change_reason
      or replay_access.id is null
      or replay_access.employee_id is distinct from target_employee_id
      or replay_access.branch_id is distinct from target_branch_id
      or replay_access.role_id is distinct from target_role_id then
      raise exception 'role_assignment_operation_conflict' using errcode='22023';
    end if;
    return replay_access.id;
  end if;
$guard$ || anchor);
    execute definition;
  end if;
end $migration$;

commit;
