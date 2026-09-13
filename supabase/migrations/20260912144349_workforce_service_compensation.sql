create sequence public.service_job_number_seq;
create sequence public.work_item_number_seq;

insert into public.permissions(code, name) values
  ('workforce.read', 'Xem nhân sự và phân công'),
  ('work.manage', 'Điều phối công việc'),
  ('work.claim', 'Nhận và thực hiện công việc'),
  ('work.verify', 'Xác minh kết quả công việc'),
  ('service.read', 'Xem công việc dịch vụ'),
  ('service.manage', 'Lập và điều phối dịch vụ'),
  ('service.verify', 'Xác minh actual và billing dịch vụ'),
  ('compensation.read', 'Xem thu nhập theo quyền'),
  ('compensation.manage', 'Quản lý căn cứ và quy tắc thu nhập'),
  ('compensation.approve', 'Duyệt thu nhập và tạo phải trả')
on conflict (code) do update set name = excluded.name;

create table public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  job_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid not null references public.customer_sites(id) on delete restrict,
  sales_employee_id uuid references public.employees(id) on delete restrict,
  service_type text not null check (char_length(service_type) between 2 and 120),
  description text not null check (char_length(description) between 3 and 500),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  planned_quantity numeric(20,6) not null check (planned_quantity > 0),
  unit_label text not null check (char_length(unit_label) between 1 and 30),
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  machine_id uuid references public.machines(id) on delete restrict,
  execution_state text not null default 'SCHEDULED' check (execution_state in ('SCHEDULED','IN_PROGRESS','RESULT_SUBMITTED','VERIFIED','CANCELLED')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  check (scheduled_end > scheduled_start),
  check (num_nonnulls(vehicle_id, machine_id) <= 1),
  check ((execution_state = 'VERIFIED' and verified_at is not null) or (execution_state <> 'VERIFIED' and verified_at is null))
);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  work_number text not null unique,
  delivery_id uuid unique references public.deliveries(id) on delete restrict,
  service_job_id uuid unique references public.service_jobs(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 180),
  assignment_mode text not null check (assignment_mode in ('DIRECT','POOL_CLAIM')),
  execution_state text not null check (execution_state in ('AVAILABLE','CLAIMED','IN_PROGRESS','BLOCKED','DONE','VERIFIED','CANCELLED')),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  planned_vehicle_id uuid references public.vehicles(id) on delete restrict,
  planned_machine_id uuid references public.machines(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  started_at timestamptz,
  completed_at timestamptz,
  last_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (num_nonnulls(delivery_id, service_job_id) = 1),
  check (scheduled_end > scheduled_start),
  check (num_nonnulls(planned_vehicle_id, planned_machine_id) <= 1),
  check ((execution_state in ('IN_PROGRESS','BLOCKED','DONE','VERIFIED') and started_at is not null) or execution_state in ('AVAILABLE','CLAIMED','CANCELLED')),
  check ((execution_state in ('DONE','VERIFIED') and completed_at is not null) or (execution_state not in ('DONE','VERIFIED') and completed_at is null))
);

create table public.work_item_assignments (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  assignment_version integer not null check (assignment_version > 0),
  employee_id uuid not null references public.employees(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  machine_id uuid references public.machines(id) on delete restrict,
  assignment_kind text not null check (assignment_kind in ('DIRECT','CLAIM')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (work_item_id, assignment_version),
  check (num_nonnulls(vehicle_id, machine_id) <= 1)
);
create unique index work_item_current_assignment_unique on public.work_item_assignments(work_item_id) where superseded_at is null;

create table public.work_item_results (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null unique references public.work_items(id) on delete restrict,
  assignment_id uuid not null references public.work_item_assignments(id) on delete restrict,
  actual_quantity numeric(20,6) not null check (actual_quantity >= 0),
  note text check (note is null or char_length(note) between 3 and 1000),
  receiver_name text check (receiver_name is null or char_length(receiver_name) between 2 and 160),
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now()
);

create table public.work_item_heartbeats (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  assignment_id uuid not null references public.work_item_assignments(id) on delete restrict,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  status_note text check (status_note is null or char_length(status_note) between 3 and 300),
  recorded_at timestamptz not null default now()
);

create table public.work_item_verifications (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null unique references public.work_items(id) on delete restrict,
  result_id uuid not null unique references public.work_item_results(id) on delete restrict,
  verification_kind text not null check (verification_kind in ('DELIVERY_SOURCE','SERVICE_SOURCE')),
  verified_by uuid not null references auth.users(id) on delete restrict,
  verified_at timestamptz not null default now()
);

create table public.service_work_logs (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null references public.service_jobs(id) on delete restrict,
  work_item_id uuid not null unique references public.work_items(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  actual_quantity numeric(20,6) not null check (actual_quantity >= 0),
  result_id uuid not null unique references public.work_item_results(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  check (ended_at >= started_at)
);

create table public.service_verifications (
  id uuid primary key default gen_random_uuid(),
  service_job_id uuid not null unique references public.service_jobs(id) on delete restrict,
  work_item_id uuid not null unique references public.work_items(id) on delete restrict,
  result_id uuid not null unique references public.work_item_results(id) on delete restrict,
  actual_quantity numeric(20,6) not null check (actual_quantity >= 0),
  billable_quantity numeric(20,6) not null check (billable_quantity >= 0),
  compensable_quantity numeric(20,6) not null check (compensable_quantity >= 0),
  billable_amount_vnd bigint not null check (billable_amount_vnd >= 0),
  verification_note text check (verification_note is null or char_length(verification_note) between 3 and 1000),
  verified_by uuid not null references auth.users(id) on delete restrict,
  verified_at timestamptz not null default now(),
  check (
    (billable_quantity = actual_quantity and compensable_quantity = actual_quantity)
    or verification_note is not null
  )
);

create table public.compensation_manual_bases (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  basis_type text not null check (basis_type in ('FIXED_MONTHLY','PER_SHIFT','PER_DAY','BONUS','ADJUSTMENT')),
  basis_quantity numeric(20,6) not null check (basis_quantity <> 0),
  period_start date not null,
  period_end date not null,
  description text not null check (char_length(description) between 3 and 500),
  adjusts_earning_event_id uuid,
  evidence_object_id uuid references public.evidence_objects(id) on delete restrict,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  check (period_end >= period_start),
  check ((basis_type = 'ADJUSTMENT' and adjusts_earning_event_id is not null) or (basis_type <> 'ADJUSTMENT' and adjusts_earning_event_id is null))
);

create table public.compensation_rules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{2,32}$'),
  name text not null check (char_length(name) between 2 and 160),
  version integer not null check (version > 0),
  employee_id uuid references public.employees(id) on delete restrict,
  earning_type text not null check (earning_type in ('FIXED_MONTHLY','PER_JOB','PER_TRIP','PER_HOUR','PER_SHIFT','PER_DAY','PER_TON','PER_M3','PER_BAG','PER_UNIT','BONUS','ADJUSTMENT','SALES_COMMISSION')),
  calculation_kind text not null check (calculation_kind in ('FIXED_PER_BASIS','PERCENT_BPS')),
  rate_vnd_per_unit numeric(20,6),
  rate_bps integer,
  classification text not null check (classification in ('DIRECT_LABOR','OPEX','SALES_COMMISSION')),
  effective_from date not null,
  effective_to date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (branch_id, code, version),
  check (effective_to is null or effective_to >= effective_from),
  check (
    (calculation_kind = 'FIXED_PER_BASIS' and rate_vnd_per_unit > 0 and rate_bps is null)
    or (calculation_kind = 'PERCENT_BPS' and rate_vnd_per_unit is null and rate_bps between 1 and 10000)
  ),
  check ((earning_type = 'SALES_COMMISSION') = (calculation_kind = 'PERCENT_BPS')),
  check ((earning_type = 'SALES_COMMISSION') = (classification = 'SALES_COMMISSION'))
);

create table public.earning_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  rule_id uuid not null references public.compensation_rules(id) on delete restrict,
  rule_code_snapshot text not null,
  rule_version_snapshot integer not null,
  earning_type text not null,
  classification text not null check (classification in ('DIRECT_LABOR','OPEX','SALES_COMMISSION')),
  service_verification_id uuid references public.service_verifications(id) on delete restrict,
  work_item_verification_id uuid references public.work_item_verifications(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  manual_basis_id uuid references public.compensation_manual_bases(id) on delete restrict,
  source_key text not null,
  basis_quantity numeric(20,6) not null,
  basis_amount_vnd bigint,
  rate_vnd_per_unit_snapshot numeric(20,6),
  rate_bps_snapshot integer,
  calculated_amount_vnd bigint not null check (calculated_amount_vnd <> 0),
  approved_amount_vnd bigint,
  approval_state text not null default 'DRAFT' check (approval_state in ('DRAFT','APPROVED')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  unique (source_key, rule_id, employee_id),
  check (num_nonnulls(service_verification_id, work_item_verification_id, sales_order_id, manual_basis_id) = 1),
  check (
    (approval_state = 'DRAFT' and approved_amount_vnd is null and approved_by is null and approved_at is null)
    or (approval_state = 'APPROVED' and approved_amount_vnd <> 0 and approved_by is not null and approved_at is not null)
  )
);

alter table public.compensation_manual_bases
  add constraint compensation_manual_bases_adjusts_fk foreign key (adjusts_earning_event_id) references public.earning_events(id) on delete restrict;

alter table public.receivable_obligations
  drop constraint receivable_obligation_source_shape,
  add column service_verification_id uuid unique references public.service_verifications(id) on delete restrict,
  add constraint receivable_obligation_source_shape check (
    num_nonnulls(opening_source_id, delivery_verification_id, service_verification_id) = 1
  );

alter table public.payable_obligations
  drop constraint payable_obligation_source_shape,
  alter column supplier_id drop not null,
  add column employee_id uuid references public.employees(id) on delete restrict,
  add column earning_event_id uuid unique references public.earning_events(id) on delete restrict,
  add constraint payable_obligation_party_shape check (num_nonnulls(supplier_id, employee_id) = 1),
  add constraint payable_obligation_source_shape check (
    num_nonnulls(opening_source_id, purchase_receipt_id, supplier_fulfillment_id, expense_id, earning_event_id) = 1
  );

alter table public.earning_events
  add column payable_obligation_id uuid unique references public.payable_obligations(id) on delete restrict,
  add column payable_adjustment_id uuid unique references public.payable_adjustments(id) on delete restrict;

alter table public.payments add column employee_id uuid references public.employees(id) on delete restrict;
do $$
declare constraint_name text;
begin
  select c.conname into constraint_name
  from pg_constraint c
  where c.conrelid = 'public.payments'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%num_nonnulls(customer_id, supplier_id)%';
  if constraint_name is not null then execute format('alter table public.payments drop constraint %I', constraint_name); end if;
end
$$;
alter table public.payments add constraint payments_party_shape check (num_nonnulls(customer_id, supplier_id, employee_id) = 1);

create index service_jobs_schedule_idx on public.service_jobs(branch_id, scheduled_start, execution_state);
create index work_items_schedule_idx on public.work_items(branch_id, scheduled_start, scheduled_end, execution_state);
create index work_assignments_employee_idx on public.work_item_assignments(employee_id, assigned_at) where superseded_at is null;
create index work_assignments_vehicle_idx on public.work_item_assignments(vehicle_id, assigned_at) where vehicle_id is not null and superseded_at is null;
create index work_assignments_machine_idx on public.work_item_assignments(machine_id, assigned_at) where machine_id is not null and superseded_at is null;
create index work_heartbeats_item_idx on public.work_item_heartbeats(work_item_id, recorded_at desc);
create index earning_events_employee_period_idx on public.earning_events(branch_id, employee_id, created_at, approval_state);
create index earning_events_classification_idx on public.earning_events(branch_id, classification, approved_at) where approval_state = 'APPROVED';

create or replace function private.assert_work_resources_available(
  target_work_item_id uuid,
  target_branch_id uuid,
  target_employee_id uuid,
  target_vehicle_id uuid,
  target_machine_id uuid,
  target_start timestamptz,
  target_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.employees e
  where e.id = target_employee_id and e.active
    and exists (select 1 from public.employee_branch_access a where a.employee_id = e.id and a.branch_id = target_branch_id and a.active)
  for update;
  if not found then raise exception 'employee_not_eligible' using errcode = '23503'; end if;
  if target_vehicle_id is not null then
    perform 1 from public.vehicles where id = target_vehicle_id and branch_id = target_branch_id and active for update;
    if not found then raise exception 'vehicle_not_available' using errcode = '23503'; end if;
  end if;
  if target_machine_id is not null then
    perform 1 from public.machines where id = target_machine_id and branch_id = target_branch_id and active for update;
    if not found then raise exception 'machine_not_available' using errcode = '23503'; end if;
  end if;
  if exists (
    select 1 from public.work_item_assignments a
    join public.work_items w on w.id = a.work_item_id
    where a.superseded_at is null and w.id <> target_work_item_id
      and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED')
      and tstzrange(w.scheduled_start, w.scheduled_end, '[)') && tstzrange(target_start, target_end, '[)')
      and (a.employee_id = target_employee_id
        or (target_vehicle_id is not null and a.vehicle_id = target_vehicle_id)
        or (target_machine_id is not null and a.machine_id = target_machine_id))
  ) then raise exception 'work_resource_schedule_collision' using errcode = '23P01'; end if;
end
$$;

create or replace function public.create_service_job(
  target_branch_id uuid,
  target_customer_id uuid,
  target_site_id uuid,
  service_type text,
  description text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  planned_quantity numeric,
  unit_label text,
  target_sales_employee_id uuid,
  target_vehicle_id uuid,
  target_machine_id uuid,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid;
begin
  if not private.has_permission(target_branch_id, 'service.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(service_type)) not between 2 and 120 or char_length(trim(description)) not between 3 and 500
    or scheduled_end <= scheduled_start or planned_quantity <= 0 or char_length(trim(unit_label)) not between 1 and 30
    or num_nonnulls(target_vehicle_id, target_machine_id) > 1 then raise exception 'invalid_service_job' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'customer',target_customer_id,'site',target_site_id,'type',trim(service_type),'description',trim(description),'start',scheduled_start,'end',scheduled_end,'quantity',planned_quantity,'unit',trim(unit_label),'sales',target_sales_employee_id,'vehicle',target_vehicle_id,'machine',target_machine_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = create_service_job.operation_id;
  if found then
    if receipt.command_name <> 'create_service_job' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  perform 1 from public.customers c join public.customer_sites s on s.customer_id = c.id
  where c.id = target_customer_id and c.branch_id = target_branch_id and c.active and s.id = target_site_id and s.active;
  if not found then raise exception 'invalid_customer_site' using errcode = '23503'; end if;
  if target_sales_employee_id is not null then
    perform 1 from public.employee_branch_access where employee_id = target_sales_employee_id and branch_id = target_branch_id and active;
    if not found then raise exception 'invalid_sales_employee' using errcode = '23503'; end if;
  end if;
  if target_vehicle_id is not null then perform 1 from public.vehicles where id = target_vehicle_id and branch_id = target_branch_id and active; if not found then raise exception 'invalid_vehicle' using errcode = '23503'; end if; end if;
  if target_machine_id is not null then perform 1 from public.machines where id = target_machine_id and branch_id = target_branch_id and active; if not found then raise exception 'invalid_machine' using errcode = '23503'; end if; end if;
  insert into public.service_jobs(branch_id,job_number,customer_id,site_id,sales_employee_id,service_type,description,scheduled_start,scheduled_end,planned_quantity,unit_label,vehicle_id,machine_id,created_by)
  values (target_branch_id,'SRV-'||to_char((scheduled_start at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.service_job_number_seq')::text,6,'0'),target_customer_id,target_site_id,target_sales_employee_id,trim(service_type),trim(description),scheduled_start,scheduled_end,planned_quantity,trim(unit_label),target_vehicle_id,target_machine_id,(select auth.uid())) returning id into entity_id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'create_service_job',payload_hash,'service_job',entity_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),target_branch_id,'service_job.created','service_job',entity_id,operation_id,array['schedule','planned_quantity','resources']);
  return entity_id;
end
$$;

create or replace function public.publish_work_item(
  target_branch_id uuid,
  source_kind text,
  source_id uuid,
  requested_assignment_mode text,
  target_employee_id uuid,
  operation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; title text; start_at timestamptz; end_at timestamptz; vehicle uuid; machine uuid; employee uuid := target_employee_id; source_delivery uuid; source_service uuid;
begin
  if not private.has_permission(target_branch_id, 'work.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if source_kind not in ('DELIVERY','SERVICE_JOB') or requested_assignment_mode not in ('DIRECT','POOL_CLAIM') then raise exception 'invalid_work_source' using errcode = '22023'; end if;
  payload_hash := private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'kind',source_kind,'source',source_id,'mode',requested_assignment_mode,'employee',target_employee_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = publish_work_item.operation_id;
  if found then
    if receipt.command_name <> 'publish_work_item' or receipt.payload_hash <> payload_hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;
  if source_kind = 'SERVICE_JOB' then
    select j.id,j.service_type||' - '||j.job_number,j.scheduled_start,j.scheduled_end,j.vehicle_id,j.machine_id into source_service,title,start_at,end_at,vehicle,machine
    from public.service_jobs j where j.id=source_id and j.branch_id=target_branch_id and j.execution_state='SCHEDULED' for update;
    if source_service is null then raise exception 'service_not_ready' using errcode = '55000'; end if;
  else
    if requested_assignment_mode <> 'DIRECT' then raise exception 'delivery_requires_direct_assignment' using errcode = '22023'; end if;
    select d.id,'Giao hàng - '||d.delivery_number,d.scheduled_at,d.scheduled_at+interval '4 hours',a.vehicle_id,a.employee_id into source_delivery,title,start_at,end_at,vehicle,employee
    from public.deliveries d join public.delivery_assignments a on a.delivery_id=d.id and a.superseded_at is null
    where d.id=source_id and d.branch_id=target_branch_id and d.execution_state='ASSIGNED' and d.scheduled_at is not null for update of d;
    if source_delivery is null or employee is null then raise exception 'delivery_not_ready_for_work' using errcode = '55000'; end if;
  end if;
  if requested_assignment_mode='DIRECT' and employee is null then raise exception 'direct_employee_required' using errcode = '22023'; end if;
  if requested_assignment_mode='POOL_CLAIM' and employee is not null then raise exception 'pool_cannot_preassign_employee' using errcode = '22023'; end if;
  insert into public.work_items(branch_id,work_number,delivery_id,service_job_id,title,assignment_mode,execution_state,scheduled_start,scheduled_end,planned_vehicle_id,planned_machine_id,created_by)
  values(target_branch_id,'WRK-'||to_char((start_at at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.work_item_number_seq')::text,6,'0'),source_delivery,source_service,title,requested_assignment_mode,case when employee is null then 'AVAILABLE' else 'CLAIMED' end,start_at,end_at,vehicle,machine,(select auth.uid())) returning id into entity_id;
  if employee is not null then
    perform private.assert_work_resources_available(entity_id,target_branch_id,employee,vehicle,machine,start_at,end_at);
    insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by) values(entity_id,1,employee,vehicle,machine,'DIRECT',(select auth.uid()));
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'publish_work_item',payload_hash,'work_item',entity_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),target_branch_id,'work_item.published','work_item',entity_id,operation_id,array['source','assignment_mode','schedule']);
  return entity_id;
end
$$;

create or replace function public.assign_work_item(target_work_item_id uuid,target_employee_id uuid,expected_version integer,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare work public.work_items%rowtype; payload_hash text; receipt public.command_receipts%rowtype; assignment_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  if work.id is null or not private.has_permission(work.branch_id,'work.manage') then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'employee',target_employee_id,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=assign_work_item.operation_id;
  if found then if receipt.command_name<>'assign_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  if work.version<>expected_version then raise exception 'stale_work_version' using errcode='40001'; end if;
  if work.execution_state<>'AVAILABLE' then raise exception 'work_not_assignable' using errcode='55000'; end if;
  perform private.assert_work_resources_available(work.id,work.branch_id,target_employee_id,work.planned_vehicle_id,work.planned_machine_id,work.scheduled_start,work.scheduled_end);
  insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by) values(work.id,1,target_employee_id,work.planned_vehicle_id,work.planned_machine_id,'DIRECT',(select auth.uid())) returning id into assignment_id;
  update public.work_items set execution_state='CLAIMED',version=version+1 where id=work.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'assign_work_item',payload_hash,'work_item_assignment',assignment_id,now());
  return assignment_id;
end $$;

create or replace function public.claim_work_item(target_work_item_id uuid,expected_version integer,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare work public.work_items%rowtype; employee uuid; payload_hash text; receipt public.command_receipts%rowtype; assignment_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  if work.id is null or not private.has_permission(work.branch_id,'work.claim') then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  employee:=private.current_employee_id();
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'employee',employee,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=claim_work_item.operation_id;
  if found then if receipt.command_name<>'claim_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  if work.version<>expected_version then raise exception 'stale_work_version' using errcode='40001'; end if;
  if work.assignment_mode<>'POOL_CLAIM' or work.execution_state<>'AVAILABLE' then raise exception 'work_not_claimable' using errcode='55000'; end if;
  perform private.assert_work_resources_available(work.id,work.branch_id,employee,work.planned_vehicle_id,work.planned_machine_id,work.scheduled_start,work.scheduled_end);
  insert into public.work_item_assignments(work_item_id,assignment_version,employee_id,vehicle_id,machine_id,assignment_kind,assigned_by) values(work.id,1,employee,work.planned_vehicle_id,work.planned_machine_id,'CLAIM',(select auth.uid())) returning id into assignment_id;
  update public.work_items set execution_state='CLAIMED',version=version+1 where id=work.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'claim_work_item',payload_hash,'work_item_assignment',assignment_id,now());
  return assignment_id;
end $$;

create or replace function public.start_work_item(target_work_item_id uuid,expected_version integer,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare work public.work_items%rowtype; assignment public.work_item_assignments%rowtype; actor_employee uuid; payload_hash text; receipt public.command_receipts%rowtype;
begin
  select * into work from public.work_items where id=target_work_item_id;
  if work.id is null then raise exception 'work_not_found' using errcode='23503'; end if;
  actor_employee:=private.current_employee_id();
  if not private.has_permission(work.branch_id,'work.manage') and not private.has_permission(work.branch_id,'work.claim') then raise exception 'forbidden' using errcode='42501'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=start_work_item.operation_id;
  if found then if receipt.command_name<>'start_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  select * into assignment from public.work_item_assignments where work_item_id=work.id and superseded_at is null;
  if assignment.id is null or (assignment.employee_id<>actor_employee and not private.has_permission(work.branch_id,'work.manage')) then raise exception 'not_current_assignee' using errcode='42501'; end if;
  if work.version<>expected_version then raise exception 'stale_work_version' using errcode='40001'; end if;
  if work.execution_state<>'CLAIMED' then raise exception 'work_not_startable' using errcode='55000'; end if;
  update public.work_items set execution_state='IN_PROGRESS',started_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '2 hours',version=version+1 where id=work.id;
  if work.service_job_id is not null then update public.service_jobs set execution_state='IN_PROGRESS',version=version+1 where id=work.service_job_id and execution_state='SCHEDULED'; end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'start_work_item',payload_hash,'work_item',work.id,now());
  return work.id;
end $$;

create or replace function public.heartbeat_work_item(target_work_item_id uuid,status_note text,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare work public.work_items%rowtype; assignment public.work_item_assignments%rowtype; actor_employee uuid; payload_hash text; receipt public.command_receipts%rowtype; heartbeat_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  actor_employee:=private.current_employee_id();
  if work.id is null or not private.has_permission(work.branch_id,'work.claim') then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'note',nullif(trim(status_note),'')));
  select * into receipt from public.command_receipts where command_receipts.operation_id=heartbeat_work_item.operation_id;
  if found then if receipt.command_name<>'heartbeat_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  select * into assignment from public.work_item_assignments where work_item_id=work.id and superseded_at is null;
  if assignment.employee_id<>actor_employee or work.execution_state not in ('IN_PROGRESS','BLOCKED') then raise exception 'heartbeat_not_allowed' using errcode='42501'; end if;
  insert into public.work_item_heartbeats(work_item_id,assignment_id,actor_employee_id,status_note) values(work.id,assignment.id,actor_employee,nullif(trim(status_note),'')) returning id into heartbeat_id;
  update public.work_items set last_heartbeat_at=now(),lease_expires_at=now()+interval '2 hours' where id=work.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'heartbeat_work_item',payload_hash,'work_item_heartbeat',heartbeat_id,now());
  return heartbeat_id;
end $$;

create or replace function public.submit_work_result(target_work_item_id uuid,actual_quantity numeric,note text,receiver_name text,target_evidence_id uuid,expected_version integer,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare work public.work_items%rowtype; assignment public.work_item_assignments%rowtype; actor_employee uuid; payload_hash text; receipt public.command_receipts%rowtype; result_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  actor_employee:=private.current_employee_id();
  if work.id is null or (not private.has_permission(work.branch_id,'work.claim') and not private.has_permission(work.branch_id,'work.manage')) then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  if actual_quantity<0 or (nullif(trim(note),'') is not null and char_length(trim(note)) not between 3 and 1000) then raise exception 'invalid_work_result' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'actual',actual_quantity,'note',nullif(trim(note),''),'receiver',nullif(trim(receiver_name),''),'evidence',target_evidence_id,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=submit_work_result.operation_id;
  if found then if receipt.command_name<>'submit_work_result' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  select * into assignment from public.work_item_assignments where work_item_id=work.id and superseded_at is null;
  if assignment.id is null or (assignment.employee_id<>actor_employee and not private.has_permission(work.branch_id,'work.manage')) then raise exception 'not_current_assignee' using errcode='42501'; end if;
  if work.version<>expected_version then raise exception 'stale_work_version' using errcode='40001'; end if;
  if work.execution_state<>'IN_PROGRESS' then raise exception 'work_not_submittable' using errcode='55000'; end if;
  if target_evidence_id is not null then perform 1 from public.evidence_objects where id=target_evidence_id and branch_id=work.branch_id and upload_state='VERIFIED'; if not found then raise exception 'evidence_not_verified' using errcode='23503'; end if; end if;
  insert into public.work_item_results(work_item_id,assignment_id,actual_quantity,note,receiver_name,evidence_object_id,submitted_by) values(work.id,assignment.id,actual_quantity,nullif(trim(note),''),nullif(trim(receiver_name),''),target_evidence_id,(select auth.uid())) returning id into result_id;
  update public.work_items set execution_state='DONE',completed_at=now(),version=version+1 where id=work.id;
  if work.service_job_id is not null then
    insert into public.service_work_logs(service_job_id,work_item_id,employee_id,started_at,ended_at,actual_quantity,result_id) values(work.service_job_id,work.id,assignment.employee_id,work.started_at,now(),actual_quantity,result_id);
    update public.service_jobs set execution_state='RESULT_SUBMITTED',version=version+1 where id=work.service_job_id;
  end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'submit_work_result',payload_hash,'work_item_result',result_id,now());
  return result_id;
end $$;

create or replace function public.verify_delivery_work_item(target_work_item_id uuid,expected_version integer,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare work public.work_items%rowtype; result public.work_item_results%rowtype; payload_hash text; receipt public.command_receipts%rowtype; verification_id uuid;
begin
  select * into work from public.work_items where id=target_work_item_id;
  if work.id is null or not private.has_permission(work.branch_id,'work.verify') then raise exception 'forbidden_or_work_not_found' using errcode='42501'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('work',target_work_item_id,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=verify_delivery_work_item.operation_id;
  if found then if receipt.command_name<>'verify_delivery_work_item' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into work from public.work_items where id=target_work_item_id for update;
  if work.delivery_id is null or work.version<>expected_version or work.execution_state<>'DONE' then raise exception 'delivery_work_not_verifiable' using errcode='55000'; end if;
  perform 1 from public.deliveries where id=work.delivery_id and execution_state='VERIFIED'; if not found then raise exception 'delivery_source_not_verified' using errcode='55000'; end if;
  select * into result from public.work_item_results where work_item_id=work.id;
  insert into public.work_item_verifications(work_item_id,result_id,verification_kind,verified_by) values(work.id,result.id,'DELIVERY_SOURCE',(select auth.uid())) returning id into verification_id;
  update public.work_items set execution_state='VERIFIED',version=version+1 where id=work.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'verify_delivery_work_item',payload_hash,'work_item_verification',verification_id,now());
  return verification_id;
end $$;

create or replace function public.verify_service_job(target_service_job_id uuid,billable_quantity numeric,compensable_quantity numeric,billable_amount_vnd bigint,due_date date,verification_note text,expected_job_version integer,expected_work_version integer,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare job public.service_jobs%rowtype; work public.work_items%rowtype; result public.work_item_results%rowtype; payload_hash text; receipt public.command_receipts%rowtype; verification_id uuid; work_verification_id uuid;
begin
  select * into job from public.service_jobs where id=target_service_job_id;
  if job.id is null or not private.has_permission(job.branch_id,'service.verify') then raise exception 'forbidden_or_service_not_found' using errcode='42501'; end if;
  if billable_quantity<0 or compensable_quantity<0 or billable_amount_vnd<0 or due_date is null then raise exception 'invalid_service_verification' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('job',target_service_job_id,'billable_quantity',billable_quantity,'compensable_quantity',compensable_quantity,'billable_amount',billable_amount_vnd,'due_date',due_date,'note',nullif(trim(verification_note),''),'job_version',expected_job_version,'work_version',expected_work_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=verify_service_job.operation_id;
  if found then if receipt.command_name<>'verify_service_job' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into job from public.service_jobs where id=target_service_job_id for update;
  select * into work from public.work_items where service_job_id=job.id for update;
  select * into result from public.work_item_results where work_item_id=work.id;
  if job.version<>expected_job_version or work.version<>expected_work_version then raise exception 'stale_service_version' using errcode='40001'; end if;
  if job.execution_state<>'RESULT_SUBMITTED' or work.execution_state<>'DONE' or result.id is null then raise exception 'service_not_verifiable' using errcode='55000'; end if;
  if (billable_quantity<>result.actual_quantity or compensable_quantity<>result.actual_quantity) and char_length(trim(verification_note))<3 then raise exception 'service_variance_reason_required' using errcode='22023'; end if;
  insert into public.service_verifications(service_job_id,work_item_id,result_id,actual_quantity,billable_quantity,compensable_quantity,billable_amount_vnd,verification_note,verified_by) values(job.id,work.id,result.id,result.actual_quantity,billable_quantity,compensable_quantity,billable_amount_vnd,nullif(trim(verification_note),''),(select auth.uid())) returning id into verification_id;
  insert into public.work_item_verifications(work_item_id,result_id,verification_kind,verified_by) values(work.id,result.id,'SERVICE_SOURCE',(select auth.uid())) returning id into work_verification_id;
  if billable_amount_vnd>0 then insert into public.receivable_obligations(branch_id,customer_id,site_id,opening_source_id,delivery_verification_id,service_verification_id,original_amount_vnd,due_date,recorded_by) values(job.branch_id,job.customer_id,job.site_id,null,null,verification_id,billable_amount_vnd,due_date,(select auth.uid())); end if;
  update public.work_items set execution_state='VERIFIED',version=version+1 where id=work.id;
  update public.service_jobs set execution_state='VERIFIED',version=version+1,verified_at=now() where id=job.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'verify_service_job',payload_hash,'service_verification',verification_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),job.branch_id,'service_job.verified','service_job',job.id,operation_id,array['actual_quantity','billable_quantity','compensable_quantity','billable_amount_vnd']);
  return verification_id;
end $$;

create or replace function public.create_compensation_rule(target_branch_id uuid,rule_code text,rule_name text,target_employee_id uuid,earning_type text,calculation_kind text,rate_vnd_per_unit numeric,rate_bps integer,classification text,effective_from date,effective_to date,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; next_version integer;
begin
  if not private.has_permission(target_branch_id,'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if upper(trim(rule_code))!~'^[A-Z0-9_-]{2,32}$' or char_length(trim(rule_name)) not between 2 and 160 or earning_type not in ('FIXED_MONTHLY','PER_JOB','PER_TRIP','PER_HOUR','PER_SHIFT','PER_DAY','PER_TON','PER_M3','PER_BAG','PER_UNIT','BONUS','ADJUSTMENT','SALES_COMMISSION') or calculation_kind not in ('FIXED_PER_BASIS','PERCENT_BPS') or classification not in ('DIRECT_LABOR','OPEX','SALES_COMMISSION') then raise exception 'invalid_compensation_rule' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'code',upper(trim(rule_code)),'name',trim(rule_name),'employee',target_employee_id,'type',earning_type,'calculation',calculation_kind,'rate',rate_vnd_per_unit,'bps',rate_bps,'classification',classification,'from',effective_from,'to',effective_to));
  select * into receipt from public.command_receipts where command_receipts.operation_id=create_compensation_rule.operation_id;
  if found then if receipt.command_name<>'create_compensation_rule' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  if target_employee_id is not null then perform 1 from public.employee_branch_access where employee_id=target_employee_id and branch_id=target_branch_id and active; if not found then raise exception 'invalid_rule_employee' using errcode='23503'; end if; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_branch_id::text||':'||upper(trim(rule_code)),0));
  select coalesce(max(version),0)+1 into next_version from public.compensation_rules where branch_id=target_branch_id and code=upper(trim(rule_code));
  insert into public.compensation_rules(branch_id,code,name,version,employee_id,earning_type,calculation_kind,rate_vnd_per_unit,rate_bps,classification,effective_from,effective_to,created_by) values(target_branch_id,upper(trim(rule_code)),trim(rule_name),next_version,target_employee_id,earning_type,calculation_kind,rate_vnd_per_unit,rate_bps,classification,effective_from,effective_to,(select auth.uid())) returning id into entity_id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'create_compensation_rule',payload_hash,'compensation_rule',entity_id,now());
  return entity_id;
end $$;

create or replace function public.record_compensation_basis(target_branch_id uuid,target_employee_id uuid,basis_type text,basis_quantity numeric,period_start date,period_end date,description text,adjusts_earning_event_id uuid,target_evidence_id uuid,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid;
begin
  if not private.has_permission(target_branch_id,'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if basis_type not in ('FIXED_MONTHLY','PER_SHIFT','PER_DAY','BONUS','ADJUSTMENT') or basis_quantity=0 or period_end<period_start or char_length(trim(description)) not between 3 and 500 or ((basis_type='ADJUSTMENT')<>(adjusts_earning_event_id is not null)) then raise exception 'invalid_compensation_basis' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'employee',target_employee_id,'type',basis_type,'quantity',basis_quantity,'from',period_start,'to',period_end,'description',trim(description),'adjusts',adjusts_earning_event_id,'evidence',target_evidence_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id=record_compensation_basis.operation_id;
  if found then if receipt.command_name<>'record_compensation_basis' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  perform 1 from public.employee_branch_access where employee_id=target_employee_id and branch_id=target_branch_id and active; if not found then raise exception 'invalid_basis_employee' using errcode='23503'; end if;
  if adjusts_earning_event_id is not null then perform 1 from public.earning_events where id=adjusts_earning_event_id and employee_id=target_employee_id and approval_state='APPROVED'; if not found then raise exception 'invalid_adjusted_earning' using errcode='23503'; end if; end if;
  if target_evidence_id is not null then perform 1 from public.evidence_objects where id=target_evidence_id and branch_id=target_branch_id and upload_state='VERIFIED'; if not found then raise exception 'evidence_not_verified' using errcode='23503'; end if; end if;
  insert into public.compensation_manual_bases(branch_id,employee_id,basis_type,basis_quantity,period_start,period_end,description,adjusts_earning_event_id,evidence_object_id,recorded_by) values(target_branch_id,target_employee_id,basis_type,basis_quantity,period_start,period_end,trim(description),adjusts_earning_event_id,target_evidence_id,(select auth.uid())) returning id into entity_id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'record_compensation_basis',payload_hash,'compensation_basis',entity_id,now());
  return entity_id;
end $$;

create or replace function public.calculate_earning_event(target_rule_id uuid,source_kind text,source_id uuid,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare rule public.compensation_rules%rowtype; payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; employee uuid; basis_qty numeric; basis_amount bigint; source_date date; source_key text; amount bigint; service_verification uuid; work_verification uuid; sales_order uuid; manual_basis uuid; basis public.compensation_manual_bases%rowtype;
begin
  select * into rule from public.compensation_rules where id=target_rule_id;
  if rule.id is null or not private.has_permission(rule.branch_id,'compensation.manage') then raise exception 'forbidden_or_rule_not_found' using errcode='42501'; end if;
  if source_kind not in ('SERVICE_VERIFICATION','WORK_ITEM_VERIFICATION','SALES_ORDER','MANUAL_BASIS') then raise exception 'invalid_earning_source' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('rule',target_rule_id,'source_kind',source_kind,'source',source_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id=calculate_earning_event.operation_id;
  if found then if receipt.command_name<>'calculate_earning_event' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  if source_kind='SERVICE_VERIFICATION' then
    select a.employee_id,case when rule.earning_type='PER_JOB' then 1 when rule.earning_type='PER_HOUR' then extract(epoch from (l.ended_at-l.started_at))/3600 else v.compensable_quantity end,v.verified_at::date,v.id into employee,basis_qty,source_date,service_verification
    from public.service_verifications v join public.service_work_logs l on l.work_item_id=v.work_item_id join public.work_item_assignments a on a.work_item_id=v.work_item_id and a.superseded_at is null where v.id=source_id;
    if rule.earning_type not in ('PER_JOB','PER_HOUR','PER_TON','PER_M3','PER_BAG','PER_UNIT') then raise exception 'rule_not_valid_for_service' using errcode='22023'; end if;
  elsif source_kind='WORK_ITEM_VERIFICATION' then
    select a.employee_id,case when rule.earning_type in ('PER_JOB','PER_TRIP') then 1 else r.actual_quantity end,v.verified_at::date,v.id into employee,basis_qty,source_date,work_verification
    from public.work_item_verifications v join public.work_item_results r on r.id=v.result_id join public.work_item_assignments a on a.work_item_id=v.work_item_id and a.superseded_at is null where v.id=source_id;
    if rule.earning_type not in ('PER_JOB','PER_TRIP','PER_TON','PER_M3','PER_BAG','PER_UNIT') then raise exception 'rule_not_valid_for_work' using errcode='22023'; end if;
  elsif source_kind='SALES_ORDER' then
    if rule.earning_type<>'SALES_COMMISSION' then raise exception 'commission_rule_required' using errcode='22023'; end if;
    select o.sales_owner_employee_id,coalesce(sum(r.amount_vnd),0)-coalesce((select sum(d.amount_delta_vnd) from public.direct_cost_entries d where d.sales_order_id=o.id),0),coalesce(max(r.recorded_at),now())::date,o.id into employee,basis_amount,source_date,sales_order
    from public.sales_orders o left join public.revenue_entries r on r.sales_order_id=o.id where o.id=source_id and o.branch_id=rule.branch_id group by o.id;
    basis_qty:=basis_amount;
    if basis_amount is null or basis_amount<=0 then raise exception 'commission_profit_basis_not_positive' using errcode='23514'; end if;
  else
    select * into basis from public.compensation_manual_bases where id=source_id and branch_id=rule.branch_id;
    employee:=basis.employee_id; basis_qty:=basis.basis_quantity; source_date:=basis.period_end; manual_basis:=basis.id;
    if basis.id is null or rule.earning_type<>basis.basis_type then raise exception 'rule_basis_mismatch' using errcode='22023'; end if;
  end if;
  if employee is null or (rule.employee_id is not null and rule.employee_id<>employee) then raise exception 'earning_employee_mismatch' using errcode='42501'; end if;
  if source_date<rule.effective_from or (rule.effective_to is not null and source_date>rule.effective_to) then raise exception 'rule_not_effective' using errcode='22023'; end if;
  source_key:=source_kind||':'||source_id::text;
  if rule.calculation_kind='PERCENT_BPS' then amount:=round(basis_amount::numeric*rule.rate_bps/10000)::bigint; else amount:=round(basis_qty*rule.rate_vnd_per_unit)::bigint; end if;
  if amount=0 then raise exception 'zero_earning_not_recorded' using errcode='23514'; end if;
  insert into public.earning_events(branch_id,employee_id,rule_id,rule_code_snapshot,rule_version_snapshot,earning_type,classification,service_verification_id,work_item_verification_id,sales_order_id,manual_basis_id,source_key,basis_quantity,basis_amount_vnd,rate_vnd_per_unit_snapshot,rate_bps_snapshot,calculated_amount_vnd,created_by)
  values(rule.branch_id,employee,rule.id,rule.code,rule.version,rule.earning_type,rule.classification,service_verification,work_verification,sales_order,manual_basis,source_key,basis_qty,basis_amount,rule.rate_vnd_per_unit,rule.rate_bps,amount,(select auth.uid())) returning id into entity_id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'calculate_earning_event',payload_hash,'earning_event',entity_id,now());
  return entity_id;
end $$;

create or replace function public.approve_earning_event(target_earning_event_id uuid,approved_amount_vnd bigint,due_date date,expected_version integer,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare earning public.earning_events%rowtype; basis public.compensation_manual_bases%rowtype; payload_hash text; receipt public.command_receipts%rowtype; payable_id uuid; adjustment_id uuid; outstanding bigint;
begin
  select * into earning from public.earning_events where id=target_earning_event_id;
  if earning.id is null or not private.has_permission(earning.branch_id,'compensation.approve') then raise exception 'forbidden_or_earning_not_found' using errcode='42501'; end if;
  if approved_amount_vnd=0 or due_date is null or sign(approved_amount_vnd)<>sign(earning.calculated_amount_vnd) or abs(approved_amount_vnd)>abs(earning.calculated_amount_vnd) then raise exception 'invalid_approved_amount' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('earning',target_earning_event_id,'amount',approved_amount_vnd,'due',due_date,'version',expected_version));
  select * into receipt from public.command_receipts where command_receipts.operation_id=approve_earning_event.operation_id;
  if found then if receipt.command_name<>'approve_earning_event' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into earning from public.earning_events where id=target_earning_event_id for update;
  if earning.version<>expected_version then raise exception 'stale_earning_version' using errcode='40001'; end if;
  if earning.approval_state<>'DRAFT' then raise exception 'earning_already_approved' using errcode='55000'; end if;
  if approved_amount_vnd>0 then
    insert into public.payable_obligations(branch_id,supplier_id,employee_id,opening_source_id,purchase_receipt_id,supplier_fulfillment_id,expense_id,earning_event_id,original_amount_vnd,due_date,recorded_by) values(earning.branch_id,null,earning.employee_id,null,null,null,null,earning.id,approved_amount_vnd,due_date,(select auth.uid())) returning id into payable_id;
  else
    select b.* into basis from public.compensation_manual_bases b where b.id=earning.manual_basis_id;
    select p.id into payable_id from public.payable_obligations p where p.earning_event_id=basis.adjusts_earning_event_id for update;
    if payable_id is null then raise exception 'adjusted_payable_not_found' using errcode='23503'; end if;
    outstanding:=private.current_payable_outstanding(payable_id);
    if outstanding+approved_amount_vnd<0 then raise exception 'adjustment_exceeds_payable_outstanding' using errcode='23514'; end if;
    insert into public.payable_adjustments(obligation_id,amount_delta_vnd,reason,evidence_object_id,recorded_by) values(payable_id,approved_amount_vnd,basis.description,basis.evidence_object_id,(select auth.uid())) returning id into adjustment_id;
  end if;
  update public.earning_events set approved_amount_vnd=approve_earning_event.approved_amount_vnd,approval_state='APPROVED',version=version+1,approved_by=(select auth.uid()),approved_at=now(),payable_obligation_id=case when approve_earning_event.approved_amount_vnd>0 then payable_id else null end,payable_adjustment_id=adjustment_id where id=earning.id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'approve_earning_event',payload_hash,'earning_event',earning.id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),earning.branch_id,'earning.approved','earning_event',earning.id,operation_id,array['approved_amount_vnd','payable_effect']);
  return earning.id;
end $$;

create or replace function private.allocate_payment_lines(target_payment_id uuid,allocation_lines jsonb,actor_auth_user_id uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare payment public.payments%rowtype; item jsonb; obligation_id uuid; allocation_amount bigint; allocated_total bigint:=0; target_branch uuid; target_supplier uuid; target_employee uuid; outstanding bigint; available_before bigint;
begin
  select * into payment from public.payments where id=target_payment_id for update;
  if payment.id is null then raise exception 'payment_not_found' using errcode='23503'; end if;
  available_before:=private.payment_available(payment.id);
  if jsonb_typeof(allocation_lines)<>'array' then raise exception 'invalid_allocations' using errcode='22023'; end if;
  if jsonb_array_length(allocation_lines)<>(select count(distinct value->>'obligation_id') from jsonb_array_elements(allocation_lines)) then raise exception 'duplicate_allocation_target' using errcode='23505'; end if;
  for item in select value from jsonb_array_elements(allocation_lines) loop
    begin obligation_id:=(item->>'obligation_id')::uuid; allocation_amount:=(item->>'amount_vnd')::bigint; exception when others then raise exception 'invalid_allocation_line' using errcode='22023'; end;
    if allocation_amount<=0 then raise exception 'invalid_allocation_amount' using errcode='22023'; end if;
    if payment.direction='RECEIPT' then
      select branch_id,customer_id into target_branch,target_supplier from public.receivable_obligations where id=obligation_id for update;
      if not found or target_branch<>payment.branch_id or target_supplier<>payment.customer_id then raise exception 'allocation_scope_mismatch' using errcode='42501'; end if;
      outstanding:=private.current_receivable_outstanding(obligation_id);
      if allocation_amount>outstanding then raise exception 'allocation_exceeds_outstanding' using errcode='23514'; end if;
      insert into public.payment_allocations(payment_id,receivable_obligation_id,amount_delta_vnd,allocated_by) values(payment.id,obligation_id,allocation_amount,actor_auth_user_id);
    else
      select branch_id,supplier_id,employee_id into target_branch,target_supplier,target_employee from public.payable_obligations where id=obligation_id for update;
      if not found or target_branch<>payment.branch_id or target_supplier is distinct from payment.supplier_id or target_employee is distinct from payment.employee_id then raise exception 'allocation_scope_mismatch' using errcode='42501'; end if;
      outstanding:=private.current_payable_outstanding(obligation_id);
      if allocation_amount>outstanding then raise exception 'allocation_exceeds_outstanding' using errcode='23514'; end if;
      insert into public.payment_allocations(payment_id,payable_obligation_id,amount_delta_vnd,allocated_by) values(payment.id,obligation_id,allocation_amount,actor_auth_user_id);
    end if;
    allocated_total:=allocated_total+allocation_amount;
  end loop;
  if allocated_total>available_before then raise exception 'allocation_exceeds_payment_available' using errcode='23514'; end if;
  return allocated_total;
end $$;

drop function public.post_payment(uuid,text,uuid,uuid,uuid,bigint,timestamptz,text,text,jsonb,bigint,uuid);
create function public.post_payment(target_branch_id uuid,direction text,target_customer_id uuid,target_supplier_id uuid,target_account_id uuid,amount_vnd bigint,effective_at timestamptz,method text,external_reference text,allocation_lines jsonb,advance_amount_vnd bigint,operation_id uuid,target_employee_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare payload_hash text; receipt public.command_receipts%rowtype; payment_id uuid; allocated_total bigint;
begin
  if not private.has_permission(target_branch_id,'finance.payment.post') then raise exception 'forbidden' using errcode='42501'; end if;
  if amount_vnd<=0 or direction not in ('RECEIPT','DISBURSEMENT') or method not in ('CASH','BANK_TRANSFER','CARD','OTHER') or advance_amount_vnd<0 then raise exception 'invalid_payment' using errcode='22023'; end if;
  if (direction='RECEIPT' and (target_customer_id is null or num_nonnulls(target_supplier_id,target_employee_id)>0)) or (direction='DISBURSEMENT' and target_customer_id is not null) or (direction='DISBURSEMENT' and num_nonnulls(target_supplier_id,target_employee_id)<>1) or (target_employee_id is not null and advance_amount_vnd>0) then raise exception 'invalid_payment_party' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('branch_id',target_branch_id,'direction',direction,'customer_id',target_customer_id,'supplier_id',target_supplier_id,'employee_id',target_employee_id,'account_id',target_account_id,'amount',amount_vnd,'effective_at',effective_at,'method',method,'reference',nullif(trim(external_reference),''),'allocations',allocation_lines,'advance',advance_amount_vnd));
  select * into receipt from public.command_receipts where command_receipts.operation_id=post_payment.operation_id;
  if found then if receipt.command_name<>'post_payment' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  perform 1 from public.finance_accounts where id=target_account_id and branch_id=target_branch_id and active for update; if not found then raise exception 'invalid_finance_account' using errcode='23503'; end if;
  if direction='RECEIPT' then perform 1 from public.customers where id=target_customer_id and branch_id=target_branch_id and active;
  elsif target_supplier_id is not null then perform 1 from public.suppliers where id=target_supplier_id and branch_id=target_branch_id and active;
  else perform 1 from public.employee_branch_access a join public.employees e on e.id=a.employee_id where e.id=target_employee_id and e.active and a.branch_id=target_branch_id and a.active; end if;
  if not found then raise exception 'invalid_payment_party' using errcode='23503'; end if;
  insert into public.payments(branch_id,payment_number,direction,customer_id,supplier_id,employee_id,account_id,amount_vnd,method,external_reference,effective_at,posted_by) values(target_branch_id,case when direction='RECEIPT' then 'REC-' else 'PAY-' end||to_char((effective_at at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.finance_payment_number_seq')::text,6,'0'),direction,target_customer_id,target_supplier_id,target_employee_id,target_account_id,amount_vnd,method,nullif(trim(external_reference),''),effective_at,(select auth.uid())) returning id into payment_id;
  allocated_total:=private.allocate_payment_lines(payment_id,coalesce(allocation_lines,'[]'::jsonb),(select auth.uid()));
  if allocated_total+advance_amount_vnd>amount_vnd then raise exception 'payment_effects_exceed_amount' using errcode='23514'; end if;
  if advance_amount_vnd>0 then insert into public.advances(branch_id,payment_id,advance_side,customer_id,supplier_id,amount_delta_vnd,recorded_by) values(target_branch_id,payment_id,case when direction='RECEIPT' then 'CUSTOMER' else 'SUPPLIER' end,target_customer_id,target_supplier_id,advance_amount_vnd,(select auth.uid())); end if;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'post_payment',payload_hash,'payment',payment_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields) values((select auth.uid()),target_branch_id,'payment.posted','payment',payment_id,operation_id,array['direction','amount_vnd','account_id','effective_at']);
  return payment_id;
end $$;

create or replace function public.reverse_payment(target_payment_id uuid,reversal_reason text,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare original public.payments%rowtype; payload_hash text; receipt public.command_receipts%rowtype; reversal_id uuid;
begin
  select * into original from public.payments where id=target_payment_id;
  if original.id is null or not private.has_permission(original.branch_id,'finance.payment.reverse') then raise exception 'forbidden_or_payment_not_found' using errcode='42501'; end if;
  if char_length(trim(reversal_reason)) not between 3 and 500 then raise exception 'reversal_reason_required' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('payment_id',target_payment_id,'reason',trim(reversal_reason)));
  select * into receipt from public.command_receipts where command_receipts.operation_id=reverse_payment.operation_id;
  if found then if receipt.command_name<>'reverse_payment' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  select * into original from public.payments where id=target_payment_id for update;
  if original.reversal_of_payment_id is not null or exists(select 1 from public.payments where reversal_of_payment_id=original.id) then raise exception 'payment_already_reversed_or_is_reversal' using errcode='55000'; end if;
  insert into public.payments(branch_id,payment_number,direction,customer_id,supplier_id,employee_id,account_id,amount_vnd,method,external_reference,effective_at,reversal_of_payment_id,reversal_reason,posted_by) values(original.branch_id,'REV-'||to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date,'YYYYMM')||'-'||lpad(nextval('public.finance_payment_number_seq')::text,6,'0'),case when original.direction='RECEIPT' then 'DISBURSEMENT' else 'RECEIPT' end,original.customer_id,original.supplier_id,original.employee_id,original.account_id,original.amount_vnd,original.method,original.external_reference,now(),original.id,trim(reversal_reason),(select auth.uid())) returning id into reversal_id;
  insert into public.payment_allocations(payment_id,receivable_obligation_id,payable_obligation_id,amount_delta_vnd,reversal_of_allocation_id,allocated_by) select reversal_id,receivable_obligation_id,payable_obligation_id,-amount_delta_vnd,id,(select auth.uid()) from public.payment_allocations where payment_id=original.id and reversal_of_allocation_id is null;
  insert into public.advances(branch_id,payment_id,advance_side,customer_id,supplier_id,amount_delta_vnd,reversal_of_advance_id,recorded_by) select branch_id,reversal_id,advance_side,customer_id,supplier_id,-amount_delta_vnd,id,(select auth.uid()) from public.advances where payment_id=original.id and reversal_of_advance_id is null;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'reverse_payment',payload_hash,'payment',reversal_id,now());
  insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason) values((select auth.uid()),original.branch_id,'payment.reversed','payment',original.id,operation_id,array['reversal'],trim(reversal_reason));
  return reversal_id;
end $$;

drop view public.receivable_read;
create view public.receivable_read with (security_invoker=true) as
select r.id,r.branch_id,r.customer_id,r.site_id,c.display_name customer_name,s.name site_name,r.original_amount_vnd,coalesce(adj.amount_vnd,0)::bigint adjustment_amount_vnd,coalesce(alloc.amount_vnd,0)::bigint allocated_amount_vnd,(r.original_amount_vnd+coalesce(adj.amount_vnd,0)-coalesce(alloc.amount_vnd,0))::bigint outstanding_amount_vnd,r.due_date,r.recorded_at,
case when r.opening_source_id is not null then 'OPENING_BALANCE' when r.delivery_verification_id is not null then 'DELIVERY_VERIFICATION' else 'SERVICE_VERIFICATION' end::text source_type,
coalesce(r.opening_source_id,r.delivery_verification_id,r.service_verification_id) source_id,d.id delivery_id,d.sales_order_id,
case when r.opening_source_id is not null then 'Số dư đầu kỳ' when r.delivery_verification_id is not null then 'Giao hàng đã xác minh' else 'Dịch vụ đã xác minh' end::text source_label,
case when r.original_amount_vnd+coalesce(adj.amount_vnd,0)-coalesce(alloc.amount_vnd,0)<=0 then 'SETTLED' when r.due_date<(now() at time zone 'Asia/Ho_Chi_Minh')::date then 'OVERDUE' else 'OPEN' end::text state,
sv.service_job_id
from public.receivable_obligations r join public.customers c on c.id=r.customer_id left join public.customer_sites s on s.id=r.site_id left join public.delivery_verifications dv on dv.id=r.delivery_verification_id left join public.deliveries d on d.id=dv.delivery_id left join public.service_verifications sv on sv.id=r.service_verification_id left join (select obligation_id,sum(amount_delta_vnd) amount_vnd from public.receivable_adjustments group by obligation_id) adj on adj.obligation_id=r.id left join (select receivable_obligation_id obligation_id,sum(amount_delta_vnd) amount_vnd from public.payment_allocations where receivable_obligation_id is not null group by receivable_obligation_id) alloc on alloc.obligation_id=r.id;

drop view public.payable_read;
create view public.payable_read with (security_invoker=true) as
select p.id,p.branch_id,p.supplier_id,coalesce(s.name,e.display_name) supplier_name,p.original_amount_vnd,coalesce(adj.amount_vnd,0)::bigint adjustment_amount_vnd,coalesce(alloc.amount_vnd,0)::bigint allocated_amount_vnd,(p.original_amount_vnd+coalesce(adj.amount_vnd,0)-coalesce(alloc.amount_vnd,0))::bigint outstanding_amount_vnd,p.due_date,p.recorded_at,
case when p.opening_source_id is not null then 'OPENING_BALANCE' when p.purchase_receipt_id is not null then 'PURCHASE_RECEIPT' when p.supplier_fulfillment_id is not null then 'SUPPLIER_FULFILLMENT' when p.expense_id is not null then 'EXPENSE' else 'EARNING_EVENT' end::text source_type,
coalesce(p.opening_source_id,p.purchase_receipt_id,p.supplier_fulfillment_id,p.expense_id,p.earning_event_id) source_id,coalesce(pr.purchase_order_id,sf.purchase_order_id) purchase_order_id,p.expense_id,
case when p.opening_source_id is not null then 'Số dư đầu kỳ' when p.purchase_receipt_id is not null then 'Nhận hàng vào kho' when p.supplier_fulfillment_id is not null then 'NCC giao thẳng đã xác minh' when p.expense_id is not null then 'Chi phí vận hành đã duyệt' else 'Thu nhập nhân sự đã duyệt' end::text source_label,
case when p.original_amount_vnd+coalesce(adj.amount_vnd,0)-coalesce(alloc.amount_vnd,0)<=0 then 'SETTLED' when p.due_date<(now() at time zone 'Asia/Ho_Chi_Minh')::date then 'OVERDUE' else 'OPEN' end::text state,
p.employee_id,p.earning_event_id
from public.payable_obligations p left join public.suppliers s on s.id=p.supplier_id left join public.employees e on e.id=p.employee_id left join public.purchase_receipts pr on pr.id=p.purchase_receipt_id left join public.supplier_fulfillments sf on sf.id=p.supplier_fulfillment_id left join (select obligation_id,sum(amount_delta_vnd) amount_vnd from public.payable_adjustments group by obligation_id) adj on adj.obligation_id=p.id left join (select payable_obligation_id obligation_id,sum(amount_delta_vnd) amount_vnd from public.payment_allocations where payable_obligation_id is not null group by payable_obligation_id) alloc on alloc.obligation_id=p.id;

drop view public.payment_read;
create view public.payment_read with (security_invoker=true) as
select p.id,p.branch_id,p.payment_number,p.direction,p.customer_id,p.supplier_id,coalesce(c.display_name,s.name,e.display_name) counterparty_name,p.account_id,a.code account_code,a.name account_name,a.account_kind,p.amount_vnd,coalesce(alloc.amount_vnd,0)::bigint allocated_amount_vnd,coalesce(adv.amount_vnd,0)::bigint advance_amount_vnd,case when p.reversal_of_payment_id is null then (p.amount_vnd-coalesce(greatest(alloc.amount_vnd,0),0)-coalesce(greatest(adv.amount_vnd,0),0))::bigint else 0::bigint end unallocated_amount_vnd,p.method,p.external_reference,p.effective_at,p.posted_at,p.reversal_of_payment_id,reversal.id reversal_payment_id,case when reversal.id is not null then 'REVERSED' else 'POSTED' end::text posting_state,coalesce(matches.amount_vnd,0)::bigint reconciled_amount_vnd,(p.amount_vnd-coalesce(matches.amount_vnd,0))::bigint reconciliation_difference_vnd,case when coalesce(matches.amount_vnd,0)=0 then 'UNMATCHED' when matches.amount_vnd<p.amount_vnd then 'PARTIAL' else 'MATCHED' end::text reconciliation_state,case when p.direction='RECEIPT' then p.amount_vnd else -p.amount_vnd end::bigint cash_delta_vnd,p.employee_id
from public.payments p join public.finance_accounts a on a.id=p.account_id left join public.customers c on c.id=p.customer_id left join public.suppliers s on s.id=p.supplier_id left join public.employees e on e.id=p.employee_id left join public.payments reversal on reversal.reversal_of_payment_id=p.id left join (select payment_id,sum(amount_delta_vnd) amount_vnd from public.payment_allocations group by payment_id) alloc on alloc.payment_id=p.id left join (select payment_id,sum(amount_delta_vnd) amount_vnd from public.advances group by payment_id) adv on adv.payment_id=p.id left join (select payment_id,sum(matched_amount_vnd) amount_vnd from public.payment_reconciliation_matches group by payment_id) matches on matches.payment_id=p.id;

create view public.work_item_read with (security_invoker=true) as
select w.id,w.branch_id,w.work_number,w.delivery_id,w.service_job_id,w.title,w.assignment_mode,w.execution_state,w.scheduled_start,w.scheduled_end,w.version,w.started_at,w.completed_at,w.last_heartbeat_at,w.lease_expires_at,a.id assignment_id,a.employee_id,e.display_name employee_name,a.vehicle_id,v.plate_number,a.machine_id,m.name machine_name,r.id result_id,r.actual_quantity,r.note,r.receiver_name,r.evidence_object_id
from public.work_items w left join public.work_item_assignments a on a.work_item_id=w.id and a.superseded_at is null left join public.employees e on e.id=a.employee_id left join public.vehicles v on v.id=a.vehicle_id left join public.machines m on m.id=a.machine_id left join public.work_item_results r on r.work_item_id=w.id;

create view public.service_job_read with (security_invoker=true) as
select j.id,j.branch_id,j.job_number,j.customer_id,c.display_name customer_name,j.site_id,s.name site_name,j.sales_employee_id,j.service_type,j.description,j.scheduled_start,j.scheduled_end,j.planned_quantity,j.unit_label,j.vehicle_id,v.plate_number,j.machine_id,m.name machine_name,j.execution_state,j.version,w.id work_item_id,w.work_number,w.execution_state work_state,w.version work_version,a.employee_id,e.display_name operator_name,l.actual_quantity,sv.billable_quantity,sv.compensable_quantity,sv.billable_amount_vnd,sv.id service_verification_id,ro.id receivable_obligation_id
from public.service_jobs j join public.customers c on c.id=j.customer_id join public.customer_sites s on s.id=j.site_id left join public.vehicles v on v.id=j.vehicle_id left join public.machines m on m.id=j.machine_id left join public.work_items w on w.service_job_id=j.id left join public.work_item_assignments a on a.work_item_id=w.id and a.superseded_at is null left join public.employees e on e.id=a.employee_id left join public.service_work_logs l on l.work_item_id=w.id left join public.service_verifications sv on sv.service_job_id=j.id left join public.receivable_obligations ro on ro.service_verification_id=sv.id;

create view public.workforce_read with (security_invoker=true) as
select e.id,a.branch_id,e.code,e.display_name,e.active,r.name role_name,w.id work_item_id,w.work_number,w.title current_work,w.execution_state work_state,w.scheduled_end
from public.employee_branch_access a join public.employees e on e.id=a.employee_id join public.roles r on r.id=a.role_id left join public.work_item_assignments wa on wa.employee_id=e.id and wa.superseded_at is null left join public.work_items w on w.id=wa.work_item_id and w.execution_state in ('CLAIMED','IN_PROGRESS','BLOCKED') where a.active;

create view public.earning_event_read with (security_invoker=true) as
select ee.id,ee.branch_id,ee.employee_id,e.display_name employee_name,ee.rule_id,ee.rule_code_snapshot,ee.rule_version_snapshot,ee.earning_type,ee.classification,ee.source_key,ee.basis_quantity,ee.basis_amount_vnd,ee.rate_vnd_per_unit_snapshot,ee.rate_bps_snapshot,ee.calculated_amount_vnd,ee.approved_amount_vnd,ee.approval_state,ee.version,ee.created_at,ee.approved_at,ee.service_verification_id,ee.work_item_verification_id,ee.sales_order_id,ee.manual_basis_id,ee.payable_obligation_id,coalesce(private.current_payable_outstanding(ee.payable_obligation_id),0)::bigint outstanding_amount_vnd
from public.earning_events ee join public.employees e on e.id=ee.employee_id;

create or replace function public.finance_obligation_snapshot(target_branch_id uuid,target_side text,as_of timestamptz,knowledge_cutoff timestamptz,target_customer_id uuid default null,target_site_id uuid default null,target_sales_employee_id uuid default null)
returns table(obligation_id uuid,party_id uuid,party_name text,site_id uuid,site_name text,source_type text,source_id uuid,due_date date,outstanding_amount_vnd bigint) language plpgsql stable security definer set search_path='' as $$
declare effective_as_of timestamptz:=least(as_of,now()); effective_cutoff timestamptz:=least(knowledge_cutoff,now());
begin
  if target_side='AR' then
    if not private.has_permission(target_branch_id,'finance.ar.read') then raise exception 'forbidden' using errcode='42501'; end if;
    return query select r.id,r.customer_id,c.display_name,r.site_id,cs.name,case when r.opening_source_id is not null then 'OPENING_BALANCE' when r.delivery_verification_id is not null then 'DELIVERY_VERIFICATION' else 'SERVICE_VERIFICATION' end::text,coalesce(r.opening_source_id,r.delivery_verification_id,r.service_verification_id),r.due_date,(r.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a where a.obligation_id=r.id and a.recorded_at<=effective_as_of and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.receivable_obligation_id=r.id and a.allocated_at<=effective_as_of and a.allocated_at<=effective_cutoff),0))::bigint
    from public.receivable_obligations r join public.customers c on c.id=r.customer_id left join public.customer_sites cs on cs.id=r.site_id left join public.delivery_verifications dv on dv.id=r.delivery_verification_id left join public.deliveries d on d.id=dv.delivery_id left join public.sales_orders so on so.id=d.sales_order_id left join public.service_verifications sv on sv.id=r.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id
    where r.branch_id=target_branch_id and r.recorded_at<=effective_as_of and r.recorded_at<=effective_cutoff and (target_customer_id is null or r.customer_id=target_customer_id) and (target_site_id is null or r.site_id=target_site_id) and (target_sales_employee_id is null or coalesce(so.sales_owner_employee_id,sj.sales_employee_id)=target_sales_employee_id);
  elsif target_side='AP' then
    if not private.has_permission(target_branch_id,'finance.ap.read') then raise exception 'forbidden' using errcode='42501'; end if;
    if target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null then return; end if;
    return query select p.id,coalesce(p.supplier_id,p.employee_id),coalesce(s.name,e.display_name),null::uuid,null::text,case when p.opening_source_id is not null then 'OPENING_BALANCE' when p.purchase_receipt_id is not null then 'PURCHASE_RECEIPT' when p.supplier_fulfillment_id is not null then 'SUPPLIER_FULFILLMENT' when p.expense_id is not null then 'EXPENSE' else 'EARNING_EVENT' end::text,coalesce(p.opening_source_id,p.purchase_receipt_id,p.supplier_fulfillment_id,p.expense_id,p.earning_event_id),p.due_date,(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_as_of and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_as_of and a.allocated_at<=effective_cutoff),0))::bigint
    from public.payable_obligations p left join public.suppliers s on s.id=p.supplier_id left join public.employees e on e.id=p.employee_id where p.branch_id=target_branch_id and p.recorded_at<=effective_as_of and p.recorded_at<=effective_cutoff;
  else raise exception 'invalid_obligation_side' using errcode='22023'; end if;
end $$;

create or replace function public.finance_dashboard_snapshot(target_branch_id uuid,from_inclusive timestamptz,to_exclusive timestamptz,knowledge_cutoff timestamptz,target_customer_id uuid default null,target_site_id uuid default null,target_sales_employee_id uuid default null,target_activity_kind text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare effective_to timestamptz:=least(to_exclusive,now()); effective_cutoff timestamptz:=least(knowledge_cutoff,now()); can_profit boolean; can_expense boolean; can_ar boolean; can_ap boolean; can_comp boolean; revenue_total bigint:=0; direct_cost_total bigint:=0; opex_total bigint:=0; ar_total bigint:=0; ap_total bigint:=0; salary_total bigint:=0; commission_total bigint:=0; cost_incomplete boolean:=false; opex_not_applicable boolean:=false; unsupported_activity boolean:=target_activity_kind is not null and target_activity_kind not in ('DELIVERY','SERVICE','SALES','OPERATIONS','ADMIN');
begin
  if not private.has_permission(target_branch_id,'dashboard.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if from_inclusive>=to_exclusive then raise exception 'invalid_report_period' using errcode='22023'; end if;
  can_profit:=private.has_permission(target_branch_id,'finance.profit.read'); can_expense:=private.has_permission(target_branch_id,'finance.expense.read'); can_ar:=private.has_permission(target_branch_id,'finance.ar.read'); can_ap:=private.has_permission(target_branch_id,'finance.ap.read'); can_comp:=private.has_permission(target_branch_id,'compensation.read');
  select coalesce(sum(amount),0)::bigint into revenue_total from (
    select r.amount_vnd amount from public.revenue_entries r join public.sales_orders o on o.id=r.sales_order_id where r.branch_id=target_branch_id and r.recorded_at>=from_inclusive and r.recorded_at<effective_to and r.recorded_at<=effective_cutoff and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id) and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='DELIVERY')
    union all
    select v.billable_amount_vnd from public.service_verifications v join public.service_jobs j on j.id=v.service_job_id where j.branch_id=target_branch_id and v.verified_at>=from_inclusive and v.verified_at<effective_to and v.verified_at<=effective_cutoff and (target_customer_id is null or j.customer_id=target_customer_id) and (target_site_id is null or j.site_id=target_site_id) and (target_sales_employee_id is null or j.sales_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='SERVICE')
  ) revenue;
  if can_profit then
    select coalesce(sum(amount),0)::bigint into direct_cost_total from (
      select d.amount_delta_vnd amount from public.direct_cost_entries d join public.sales_orders o on o.id=d.sales_order_id where d.branch_id=target_branch_id and d.recorded_at>=from_inclusive and d.recorded_at<effective_to and d.recorded_at<=effective_cutoff and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id) and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and (target_activity_kind is null or target_activity_kind='DELIVERY')
      union all
      select ee.approved_amount_vnd from public.earning_events ee left join public.service_verifications sv on sv.id=ee.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id left join public.work_item_verifications wv on wv.id=ee.work_item_verification_id left join public.work_items wi on wi.id=wv.work_item_id left join public.deliveries d on d.id=wi.delivery_id left join public.sales_orders wo on wo.id=d.sales_order_id left join public.sales_orders so on so.id=ee.sales_order_id where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification='DIRECT_LABOR' and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff and (target_customer_id is null or coalesce(sj.customer_id,wo.customer_id,so.customer_id)=target_customer_id) and (target_site_id is null or coalesce(sj.site_id,wo.site_id,so.site_id)=target_site_id) and (target_sales_employee_id is null or coalesce(sj.sales_employee_id,wo.sales_owner_employee_id,so.sales_owner_employee_id)=target_sales_employee_id) and (target_activity_kind is null or (target_activity_kind='SERVICE' and ee.service_verification_id is not null) or (target_activity_kind='DELIVERY' and wi.delivery_id is not null))
    ) costs;
    select exists(select 1 from public.revenue_entries r join public.sales_orders o on o.id=r.sales_order_id where r.branch_id=target_branch_id and r.recorded_at>=from_inclusive and r.recorded_at<effective_to and r.recorded_at<=effective_cutoff and (target_customer_id is null or o.customer_id=target_customer_id) and (target_site_id is null or o.site_id=target_site_id) and (target_sales_employee_id is null or o.sales_owner_employee_id=target_sales_employee_id) and not exists(select 1 from public.direct_cost_entries d where d.sales_order_id=r.sales_order_id and d.recorded_at<=effective_cutoff)) into cost_incomplete;
  end if;
  if can_expense then
    select coalesce(sum(amount),0)::bigint into opex_total from (
      select e.amount_vnd amount from public.expenses e where e.branch_id=target_branch_id and e.approval_state='APPROVED' and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff and (target_customer_id is null or e.customer_id=target_customer_id) and (target_site_id is null or e.site_id=target_site_id) and (target_sales_employee_id is null or e.sales_employee_id=target_sales_employee_id) and (target_activity_kind is null or e.activity_kind=target_activity_kind)
      union all
      select ee.approved_amount_vnd from public.earning_events ee left join public.sales_orders so on so.id=ee.sales_order_id left join public.service_verifications sv on sv.id=ee.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification in ('OPEX','SALES_COMMISSION') and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff and (target_customer_id is null or coalesce(so.customer_id,sj.customer_id)=target_customer_id) and (target_site_id is null or coalesce(so.site_id,sj.site_id)=target_site_id) and (target_sales_employee_id is null or ee.employee_id=target_sales_employee_id) and (target_activity_kind is null or (target_activity_kind='SALES' and ee.classification='SALES_COMMISSION') or (target_activity_kind='SERVICE' and ee.service_verification_id is not null) or (target_activity_kind in ('OPERATIONS','ADMIN') and ee.manual_basis_id is not null))
    ) expenses_all;
    opex_not_applicable := (target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null) and (exists(select 1 from public.expenses e where e.branch_id=target_branch_id and e.approval_state='APPROVED' and e.effective_at>=from_inclusive and e.effective_at<effective_to and e.approved_at<=effective_cutoff and ((target_customer_id is not null and e.customer_id is null) or (target_site_id is not null and e.site_id is null) or (target_sales_employee_id is not null and e.sales_employee_id is null))) or exists(select 1 from public.earning_events ee where ee.branch_id=target_branch_id and ee.approval_state='APPROVED' and ee.classification='OPEX' and ee.manual_basis_id is not null and ee.approved_at>=from_inclusive and ee.approved_at<effective_to and ee.approved_at<=effective_cutoff));
  end if;
  if can_ar then select coalesce(sum(r.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.receivable_adjustments a where a.obligation_id=r.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.receivable_obligation_id=r.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into ar_total from public.receivable_obligations r left join public.delivery_verifications dv on dv.id=r.delivery_verification_id left join public.deliveries d on d.id=dv.delivery_id left join public.sales_orders so on so.id=d.sales_order_id left join public.service_verifications sv on sv.id=r.service_verification_id left join public.service_jobs sj on sj.id=sv.service_job_id where r.branch_id=target_branch_id and r.recorded_at<=effective_to and r.recorded_at<=effective_cutoff and (target_customer_id is null or r.customer_id=target_customer_id) and (target_site_id is null or r.site_id=target_site_id) and (target_sales_employee_id is null or coalesce(so.sales_owner_employee_id,sj.sales_employee_id)=target_sales_employee_id); end if;
  if can_ap then select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into ap_total from public.payable_obligations p where p.branch_id=target_branch_id and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff; end if;
  if can_comp then
    select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into salary_total from public.payable_obligations p join public.earning_events ee on ee.id=p.earning_event_id where p.branch_id=target_branch_id and ee.classification<>'SALES_COMMISSION' and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff;
    select coalesce(sum(p.original_amount_vnd+coalesce((select sum(a.amount_delta_vnd) from public.payable_adjustments a where a.obligation_id=p.id and a.recorded_at<=effective_to and a.recorded_at<=effective_cutoff),0)-coalesce((select sum(a.amount_delta_vnd) from public.payment_allocations a where a.payable_obligation_id=p.id and a.allocated_at<=effective_to and a.allocated_at<=effective_cutoff),0)),0)::bigint into commission_total from public.payable_obligations p join public.earning_events ee on ee.id=p.earning_event_id left join public.sales_orders so on so.id=ee.sales_order_id where p.branch_id=target_branch_id and ee.classification='SALES_COMMISSION' and p.recorded_at<=effective_to and p.recorded_at<=effective_cutoff and (target_customer_id is null or so.customer_id=target_customer_id) and (target_site_id is null or so.site_id=target_site_id) and (target_sales_employee_id is null or ee.employee_id=target_sales_employee_id);
  end if;
  return jsonb_build_object('scope',jsonb_build_object('from',from_inclusive,'to',effective_to,'as_of',effective_cutoff,'branch_id',target_branch_id),'revenue',jsonb_build_object('value_vnd',case when not unsupported_activity then revenue_total else null end,'quality',case when unsupported_activity then 'NOT_APPLICABLE' else 'READY' end),'direct_cost',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then direct_cost_total else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'gross_profit',jsonb_build_object('value_vnd',case when can_profit and not cost_incomplete and not unsupported_activity then revenue_total-direct_cost_total else null end,'quality',case when not can_profit then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' else 'READY' end),'operating_expense',jsonb_build_object('value_vnd',case when can_expense and not opex_not_applicable then opex_total else null end,'quality',case when not can_expense then 'FORBIDDEN' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_profit',jsonb_build_object('value_vnd',case when can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then revenue_total-direct_cost_total-opex_total else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'operating_margin_bps',jsonb_build_object('value',case when revenue_total>0 and can_profit and can_expense and not cost_incomplete and not opex_not_applicable and not unsupported_activity then ((revenue_total-direct_cost_total-opex_total)*10000/revenue_total) else null end,'quality',case when not can_profit or not can_expense then 'FORBIDDEN' when unsupported_activity then 'NOT_APPLICABLE' when cost_incomplete then 'INCOMPLETE' when opex_not_applicable then 'NOT_APPLICABLE' else 'READY' end),'receivable',jsonb_build_object('value_vnd',case when can_ar then ar_total else null end,'quality',case when can_ar then 'READY' else 'FORBIDDEN' end),'payable',jsonb_build_object('value_vnd',case when can_ap and target_customer_id is null and target_site_id is null and target_sales_employee_id is null then ap_total else null end,'quality',case when not can_ap then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null then 'NOT_APPLICABLE' else 'READY' end),'salary_payable',jsonb_build_object('value_vnd',case when can_comp and target_customer_id is null and target_site_id is null and target_sales_employee_id is null and target_activity_kind is null then salary_total else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_customer_id is not null or target_site_id is not null or target_sales_employee_id is not null or target_activity_kind is not null then 'NOT_APPLICABLE' else 'READY' end),'commission_payable',jsonb_build_object('value_vnd',case when can_comp and (target_activity_kind is null or target_activity_kind='SALES') then commission_total else null end,'quality',case when not can_comp then 'FORBIDDEN' when target_activity_kind is not null and target_activity_kind<>'SALES' then 'NOT_APPLICABLE' else 'READY' end));
end $$;

create or replace function private.reject_append_only_workforce_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'verified work and earning sources are append-only' using errcode='55000'; end $$;
create trigger work_assignments_immutable before update or delete on public.work_item_assignments for each row execute function private.reject_append_only_workforce_mutation();
create trigger work_results_immutable before update or delete on public.work_item_results for each row execute function private.reject_append_only_workforce_mutation();
create trigger work_heartbeats_immutable before update or delete on public.work_item_heartbeats for each row execute function private.reject_append_only_workforce_mutation();
create trigger work_verifications_immutable before update or delete on public.work_item_verifications for each row execute function private.reject_append_only_workforce_mutation();
create trigger service_logs_immutable before update or delete on public.service_work_logs for each row execute function private.reject_append_only_workforce_mutation();
create trigger service_verifications_immutable before update or delete on public.service_verifications for each row execute function private.reject_append_only_workforce_mutation();
create trigger compensation_bases_immutable before update or delete on public.compensation_manual_bases for each row execute function private.reject_append_only_workforce_mutation();
create trigger compensation_rules_immutable before update or delete on public.compensation_rules for each row execute function private.reject_append_only_workforce_mutation();
create trigger earning_events_no_delete before delete on public.earning_events for each row execute function private.reject_append_only_workforce_mutation();

alter table public.service_jobs enable row level security;
alter table public.work_items enable row level security;
alter table public.work_item_assignments enable row level security;
alter table public.work_item_results enable row level security;
alter table public.work_item_heartbeats enable row level security;
alter table public.work_item_verifications enable row level security;
alter table public.service_work_logs enable row level security;
alter table public.service_verifications enable row level security;
alter table public.compensation_manual_bases enable row level security;
alter table public.compensation_rules enable row level security;
alter table public.earning_events enable row level security;

revoke all on table public.service_jobs,public.work_items,public.work_item_assignments,public.work_item_results,public.work_item_heartbeats,public.work_item_verifications,public.service_work_logs,public.service_verifications,public.compensation_manual_bases,public.compensation_rules,public.earning_events from anon,authenticated;
grant select on table public.service_jobs,public.work_items,public.work_item_assignments,public.work_item_results,public.work_item_heartbeats,public.work_item_verifications,public.service_work_logs,public.service_verifications,public.compensation_manual_bases,public.compensation_rules,public.earning_events to authenticated;
grant select on public.receivable_read,public.payable_read,public.payment_read,public.work_item_read,public.service_job_read,public.workforce_read,public.earning_event_read to authenticated;

create policy service_jobs_read on public.service_jobs for select to authenticated using(private.has_permission(branch_id,'service.read'));
create policy work_items_read on public.work_items for select to authenticated using(private.has_permission(branch_id,'workforce.read') or private.has_permission(branch_id,'work.claim'));
create policy work_assignments_read on public.work_item_assignments for select to authenticated using(exists(select 1 from public.work_items w where w.id=work_item_id and (private.has_permission(w.branch_id,'workforce.read') or private.has_permission(w.branch_id,'work.claim'))));
create policy work_results_read on public.work_item_results for select to authenticated using(exists(select 1 from public.work_items w where w.id=work_item_id and (private.has_permission(w.branch_id,'workforce.read') or private.has_permission(w.branch_id,'work.claim'))));
create policy work_heartbeats_read on public.work_item_heartbeats for select to authenticated using(exists(select 1 from public.work_items w where w.id=work_item_id and private.has_permission(w.branch_id,'workforce.read')));
create policy work_verifications_read on public.work_item_verifications for select to authenticated using(exists(select 1 from public.work_items w where w.id=work_item_id and private.has_permission(w.branch_id,'workforce.read')));
create policy service_logs_read on public.service_work_logs for select to authenticated using(exists(select 1 from public.service_jobs j where j.id=service_job_id and private.has_permission(j.branch_id,'service.read')));
create policy service_verifications_read on public.service_verifications for select to authenticated using(exists(select 1 from public.service_jobs j where j.id=service_job_id and private.has_permission(j.branch_id,'service.read')));
create policy compensation_bases_read on public.compensation_manual_bases for select to authenticated using(private.has_permission(branch_id,'compensation.read'));
create policy compensation_rules_read on public.compensation_rules for select to authenticated using(private.has_permission(branch_id,'compensation.read'));
create policy earning_events_read on public.earning_events for select to authenticated using(private.has_permission(branch_id,'compensation.read'));
create policy employees_workforce_read on public.employees for select to authenticated using(exists(select 1 from public.employee_branch_access a where a.employee_id=id and a.active and (private.has_permission(a.branch_id,'workforce.read') or private.has_permission(a.branch_id,'compensation.read'))));
create policy employee_branch_access_workforce_read on public.employee_branch_access for select to authenticated using(private.has_permission(branch_id,'workforce.read') or private.has_permission(branch_id,'compensation.read'));
create policy roles_workforce_read on public.roles for select to authenticated using(exists(select 1 from public.employee_branch_access a where a.role_id=roles.id and a.active and (private.has_permission(a.branch_id,'workforce.read') or private.has_permission(a.branch_id,'compensation.read'))));
create policy vehicles_service_read on public.vehicles for select to authenticated using(private.has_permission(branch_id,'service.read'));
create policy machines_service_read on public.machines for select to authenticated using(private.has_permission(branch_id,'service.read'));

revoke all on function private.assert_work_resources_available(uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz) from public;
revoke all on function public.create_service_job(uuid,uuid,uuid,text,text,timestamptz,timestamptz,numeric,text,uuid,uuid,uuid,uuid) from public;
revoke all on function public.publish_work_item(uuid,text,uuid,text,uuid,uuid) from public;
revoke all on function public.assign_work_item(uuid,uuid,integer,uuid) from public;
revoke all on function public.claim_work_item(uuid,integer,uuid) from public;
revoke all on function public.start_work_item(uuid,integer,uuid) from public;
revoke all on function public.heartbeat_work_item(uuid,text,uuid) from public;
revoke all on function public.submit_work_result(uuid,numeric,text,text,uuid,integer,uuid) from public;
revoke all on function public.verify_delivery_work_item(uuid,integer,uuid) from public;
revoke all on function public.verify_service_job(uuid,numeric,numeric,bigint,date,text,integer,integer,uuid) from public;
revoke all on function public.create_compensation_rule(uuid,text,text,uuid,text,text,numeric,integer,text,date,date,uuid) from public;
revoke all on function public.record_compensation_basis(uuid,uuid,text,numeric,date,date,text,uuid,uuid,uuid) from public;
revoke all on function public.calculate_earning_event(uuid,text,uuid,uuid) from public;
revoke all on function public.approve_earning_event(uuid,bigint,date,integer,uuid) from public;
revoke all on function public.post_payment(uuid,text,uuid,uuid,uuid,bigint,timestamptz,text,text,jsonb,bigint,uuid,uuid) from public;
grant execute on function public.create_service_job(uuid,uuid,uuid,text,text,timestamptz,timestamptz,numeric,text,uuid,uuid,uuid,uuid),public.publish_work_item(uuid,text,uuid,text,uuid,uuid),public.assign_work_item(uuid,uuid,integer,uuid),public.claim_work_item(uuid,integer,uuid),public.start_work_item(uuid,integer,uuid),public.heartbeat_work_item(uuid,text,uuid),public.submit_work_result(uuid,numeric,text,text,uuid,integer,uuid),public.verify_delivery_work_item(uuid,integer,uuid),public.verify_service_job(uuid,numeric,numeric,bigint,date,text,integer,integer,uuid),public.create_compensation_rule(uuid,text,text,uuid,text,text,numeric,integer,text,date,date,uuid),public.record_compensation_basis(uuid,uuid,text,numeric,date,date,text,uuid,uuid,uuid),public.calculate_earning_event(uuid,text,uuid,uuid),public.approve_earning_event(uuid,bigint,date,integer,uuid),public.post_payment(uuid,text,uuid,uuid,uuid,bigint,timestamptz,text,text,jsonb,bigint,uuid,uuid) to authenticated;
