-- FB2 Đợt 7, owner decision D12 (16/10/2026): custom roles, created and edited only by someone holding roles.manage (the
-- owner; no preset role has it). A custom role can never carry roles.manage, nor any permission its editor does not hold,
-- so nobody can raise their own rights through it. Preset (system) roles and roles that hold roles.manage stay read-only.
-- Permission changes apply at once to everyone holding the role; a role still assigned to someone cannot be retired.
begin;

create or replace function public.save_custom_role(target_branch_id uuid, target_role_id uuid, role_name text, permission_codes text[],
  expected_permission_codes text[], role_active boolean, operation_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  role_row public.roles%rowtype;
  wanted text[];
  current_codes text[];
  hash text;
  receipt public.command_receipts%rowtype;
  result_id uuid;
  wanted_code text;
begin
  if auth.uid() is null or not private.has_permission(target_branch_id, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(role_name, ''))) not between 2 and 100 then raise exception 'role_name_required' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct c order by c), '{}') into wanted from unnest(coalesce(permission_codes, '{}')) c;
  hash := private.command_payload_hash(jsonb_build_object('branch_id', target_branch_id, 'role_id', target_role_id, 'name', trim(role_name),
    'permissions', to_jsonb(wanted), 'expected', to_jsonb(expected_permission_codes), 'active', coalesce(role_active, true)));
  select * into receipt from public.command_receipts r where r.operation_id = save_custom_role.operation_id;
  if found then
    if receipt.command_name <> 'save_custom_role' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if;
    return receipt.result_entity_id;
  end if;

  if coalesce(role_active, true) and cardinality(wanted) = 0 then raise exception 'role_permissions_required' using errcode = '22023'; end if;
  foreach wanted_code in array wanted loop
    if not exists (select 1 from public.permissions p where p.code = wanted_code) then raise exception 'unknown_permission' using errcode = '22023'; end if;
    if wanted_code = 'roles.manage' then raise exception 'owner_only_permission' using errcode = '42501'; end if;
    if not private.has_permission(target_branch_id, wanted_code) then raise exception 'role_exceeds_actor_permissions' using errcode = '42501'; end if;
  end loop;
  if exists (select 1 from public.roles r where r.active and lower(r.name) = lower(trim(role_name)) and r.id is distinct from target_role_id) then
    raise exception 'role_name_taken' using errcode = '23505';
  end if;

  if target_role_id is null then
    result_id := gen_random_uuid();
    insert into public.roles(id, code, name, active, system_role)
    values (result_id, 'custom_' || substr(replace(result_id::text, '-', ''), 1, 16), trim(role_name), true, false);
    insert into public.role_permissions(role_id, permission_code) select result_id, c from unnest(wanted) c;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values ((select auth.uid()), target_branch_id, 'role.custom_created', 'role', result_id, save_custom_role.operation_id, array['name', 'permissions']);
  else
    select * into role_row from public.roles r where r.id = target_role_id for update;
    if role_row.id is null then raise exception 'role_not_found' using errcode = '23503'; end if;
    if role_row.system_role or exists (select 1 from public.role_permissions rp where rp.role_id = role_row.id and rp.permission_code = 'roles.manage') then
      raise exception 'role_not_editable' using errcode = '42501';
    end if;
    select coalesce(array_agg(rp.permission_code order by rp.permission_code), '{}') into current_codes from public.role_permissions rp where rp.role_id = role_row.id;
    if expected_permission_codes is null or current_codes is distinct from (select coalesce(array_agg(distinct c order by c), '{}') from unnest(expected_permission_codes) c) then
      raise exception 'role_changed' using errcode = 'PT409';
    end if;
    -- Removing a permission only narrows the role; every permission it keeps or adds was checked against the editor above.
    if not coalesce(role_active, true) and exists (select 1 from public.employee_branch_access a where a.role_id = role_row.id and a.active) then
      raise exception 'role_in_use' using errcode = 'PT409';
    end if;
    update public.roles set name = trim(role_name), active = coalesce(role_active, true) where id = role_row.id;
    delete from public.role_permissions rp where rp.role_id = role_row.id and not (rp.permission_code = any (wanted));
    insert into public.role_permissions(role_id, permission_code) select role_row.id, c from unnest(wanted) c on conflict do nothing;
    result_id := role_row.id;
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
    values ((select auth.uid()), target_branch_id, 'role.custom_updated', 'role', result_id, save_custom_role.operation_id, array['name', 'permissions', 'active']);
  end if;
  insert into public.command_receipts values (save_custom_role.operation_id, (select auth.uid()), 'save_custom_role', hash, 'role', result_id, now());
  return result_id;
end
$function$;

revoke all on function public.save_custom_role(uuid, uuid, text, text[], text[], boolean, uuid) from public, anon;
grant execute on function public.save_custom_role(uuid, uuid, text, text[], text[], boolean, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
