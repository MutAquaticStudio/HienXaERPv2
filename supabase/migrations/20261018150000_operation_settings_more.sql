-- FB4 D19/D22 (Owner 17/10/2026): the branch settings auto-sourcing and auto-dispatch read.
-- * default_warehouse_id: the warehouse tried first when an order is sourced (empty = the warehouse that covers most lines).
-- * auto_source_enabled: confirming an order sources it by itself (default on).
-- * trip_cost_vnd: what one more trip costs; with it, a line the warehouse can only partly cover is bought whole from the
--   supplier when that is cheaper than one more trip. Empty = always use the stock first.
-- * dispatch_mode OFF | SUGGEST | AUTO (default AUTO) and the working day (07:00–18:00) for auto-dispatch.
-- save_branch_operation_settings takes any of these keys; keys left out keep their value.
begin;

alter table public.branch_operation_settings
  add column default_warehouse_id uuid references public.warehouses(id) on delete set null,
  add column auto_source_enabled boolean not null default true,
  add column trip_cost_vnd bigint check (trip_cost_vnd is null or trip_cost_vnd >= 0),
  add column dispatch_mode text not null default 'AUTO' check (dispatch_mode in ('OFF', 'SUGGEST', 'AUTO')),
  add column work_day_start time not null default '07:00',
  add column work_day_end time not null default '18:00',
  add constraint branch_operation_settings_work_day check (work_day_end > work_day_start);

-- The settings of a branch, with the defaults when the branch has not saved any.
create or replace function private.branch_settings(target_branch_id uuid) returns public.branch_operation_settings
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s from public.branch_operation_settings s where s.branch_id = target_branch_id),
    row(target_branch_id, 60, 1, null, null, null, true, null, 'AUTO', '07:00'::time, '18:00'::time)::public.branch_operation_settings)
$$;
revoke all on function private.branch_settings(uuid) from public, anon, authenticated, service_role;

create or replace function public.save_branch_operation_settings(target_branch_id uuid, settings jsonb, expected_version integer, operation_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  current_row public.branch_operation_settings%rowtype;
  next_row public.branch_operation_settings%rowtype;
  hash text;
  receipt public.command_receipts%rowtype;
  result_version integer;
  allowed constant text[] := array['stop_minutes', 'default_warehouse_id', 'auto_source_enabled', 'trip_cost_vnd', 'dispatch_mode', 'work_day_start', 'work_day_end'];
  changed text[];
begin
  if auth.uid() is null or target_branch_id is null or not private.has_permission(target_branch_id, 'roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(settings) is distinct from 'object' or settings = '{}'::jsonb or save_branch_operation_settings.operation_id is null
    or exists (select 1 from jsonb_object_keys(settings) key where not key = any(allowed)) then
    raise exception 'operation_settings_invalid' using errcode = '22023';
  end if;
  if (settings ? 'stop_minutes' and (coalesce(settings->>'stop_minutes', '') !~ '^[0-9]{1,3}$' or (settings->>'stop_minutes')::integer not between 5 and 720))
    or (settings ? 'auto_source_enabled' and coalesce(settings->>'auto_source_enabled', '') not in ('true', 'false'))
    or (settings ? 'trip_cost_vnd' and settings->>'trip_cost_vnd' is not null and settings->>'trip_cost_vnd' !~ '^[0-9]{1,12}$')
    or (settings ? 'dispatch_mode' and coalesce(settings->>'dispatch_mode', '') not in ('OFF', 'SUGGEST', 'AUTO'))
    or (settings ? 'work_day_start' and coalesce(settings->>'work_day_start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    or (settings ? 'work_day_end' and coalesce(settings->>'work_day_end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    or (settings ? 'default_warehouse_id' and settings->>'default_warehouse_id' is not null
      and coalesce(settings->>'default_warehouse_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'operation_settings_invalid' using errcode = '22023';
  end if;
  if settings->>'default_warehouse_id' is not null and not exists (select 1 from public.warehouses w
    where w.id = (settings->>'default_warehouse_id')::uuid and w.branch_id = target_branch_id and w.active) then
    raise exception 'operation_settings_invalid' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'settings', settings, 'version', expected_version));
  perform pg_advisory_xact_lock(hashtextextended(save_branch_operation_settings.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_branch_operation_settings.operation_id;
  if found then
    if receipt.command_name <> 'save_branch_operation_settings' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return (select s.version from public.branch_operation_settings s where s.branch_id = target_branch_id);
  end if;
  select * into current_row from public.branch_operation_settings s where s.branch_id = target_branch_id for update;
  if current_row.branch_id is null then
    if expected_version is not null then raise exception 'operation_settings_changed' using errcode = 'PT409'; end if;
    next_row := private.branch_settings(target_branch_id);
  else
    if current_row.version is distinct from expected_version then raise exception 'operation_settings_changed' using errcode = 'PT409'; end if;
    next_row := current_row;
  end if;
  if settings ? 'stop_minutes' then next_row.stop_minutes := (settings->>'stop_minutes')::integer; end if;
  if settings ? 'default_warehouse_id' then next_row.default_warehouse_id := (settings->>'default_warehouse_id')::uuid; end if;
  if settings ? 'auto_source_enabled' then next_row.auto_source_enabled := (settings->>'auto_source_enabled')::boolean; end if;
  if settings ? 'trip_cost_vnd' then next_row.trip_cost_vnd := (settings->>'trip_cost_vnd')::bigint; end if;
  if settings ? 'dispatch_mode' then next_row.dispatch_mode := settings->>'dispatch_mode'; end if;
  if settings ? 'work_day_start' then next_row.work_day_start := (settings->>'work_day_start')::time; end if;
  if settings ? 'work_day_end' then next_row.work_day_end := (settings->>'work_day_end')::time; end if;
  if next_row.work_day_end <= next_row.work_day_start then raise exception 'operation_settings_invalid' using errcode = '22023'; end if;
  if current_row.branch_id is null then
    insert into public.branch_operation_settings(branch_id, stop_minutes, default_warehouse_id, auto_source_enabled, trip_cost_vnd, dispatch_mode,
      work_day_start, work_day_end, updated_by)
    values (target_branch_id, next_row.stop_minutes, next_row.default_warehouse_id, next_row.auto_source_enabled, next_row.trip_cost_vnd,
      next_row.dispatch_mode, next_row.work_day_start, next_row.work_day_end, (select auth.uid()))
    returning version into result_version;
  else
    update public.branch_operation_settings set stop_minutes = next_row.stop_minutes, default_warehouse_id = next_row.default_warehouse_id,
      auto_source_enabled = next_row.auto_source_enabled, trip_cost_vnd = next_row.trip_cost_vnd, dispatch_mode = next_row.dispatch_mode,
      work_day_start = next_row.work_day_start, work_day_end = next_row.work_day_end,
      version = version + 1, updated_by = (select auth.uid()), updated_at = now()
    where branch_id = target_branch_id returning version into result_version;
  end if;
  select array_agg(key order by key) into changed from jsonb_object_keys(settings) key;
  insert into public.command_receipts values (save_branch_operation_settings.operation_id, auth.uid(), 'save_branch_operation_settings', hash, 'branch', target_branch_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values (auth.uid(), target_branch_id, 'branch_operation_settings.saved', 'branches', target_branch_id, save_branch_operation_settings.operation_id,
    changed, left('Cài đặt vận hành: ' || settings::text, 500));
  return result_version;
end
$function$;
revoke all on function public.save_branch_operation_settings(uuid, jsonb, integer, uuid) from public, anon;
grant execute on function public.save_branch_operation_settings(uuid, jsonb, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
