-- Keep Customer/Site profile fields in the same transaction as the existing
-- branch-scoped, audited catalog writer. Pricing tier needs its own permission.
create function public.save_customer_site_profile(
  kind text, target_id uuid, target_branch_id uuid, values_json jsonb,
  expected_json jsonb, change_reason text, operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  previous jsonb;
  base_values jsonb;
  base_expected jsonb;
  extra_fields text[];
  field_name text;
begin
  if kind = 'customers' then
    extra_fields := array['tier_code', 'payment_terms_days', 'internal_note'];
    if values_json ? 'tier_code' and not private.has_permission(target_branch_id, 'pricing.manage') then
      raise exception 'pricing_permission_required' using errcode = '42501';
    end if;
    select to_jsonb(c) into previous from public.customers c where c.id = target_id for update;
  elsif kind = 'sites' then
    extra_fields := array['latitude', 'longitude'];
    select to_jsonb(s) into previous from public.customer_sites s where s.id = target_id for update;
    if (values_json ? 'latitude') <> (values_json ? 'longitude') then
      raise exception 'coordinate_pair_required' using errcode = '22023';
    end if;
  else
    raise exception 'unsupported_profile' using errcode = '22023';
  end if;

  if previous is not null then
    if expected_json is null then raise exception 'record_already_exists' using errcode = '23505'; end if;
    foreach field_name in array extra_fields loop
      if values_json ? field_name and (
        not expected_json ? field_name or previous->field_name is distinct from expected_json->field_name
      ) then raise exception 'stale_record_reload' using errcode = '40001'; end if;
    end loop;
  elsif expected_json is not null then
    raise exception 'record_missing' using errcode = '40001';
  end if;

  base_values := values_json - extra_fields;
  base_expected := case when expected_json is null then null else expected_json - extra_fields end;
  perform public.save_catalog_record(kind, target_id, target_branch_id, base_values,
    base_expected, change_reason, operation_id);

  if kind = 'customers' then
    update public.customers c set
      tier_code = case when values_json ? 'tier_code' then nullif(values_json->>'tier_code', '') else c.tier_code end,
      payment_terms_days = case when values_json ? 'payment_terms_days' then (values_json->>'payment_terms_days')::integer else c.payment_terms_days end,
      internal_note = case when values_json ? 'internal_note' then nullif(values_json->>'internal_note', '') else c.internal_note end
    where c.id = target_id and c.branch_id = target_branch_id;
  else
    update public.customer_sites s set
      latitude = case when values_json ? 'latitude' then nullif(values_json->>'latitude', '')::numeric else s.latitude end,
      longitude = case when values_json ? 'longitude' then nullif(values_json->>'longitude', '')::numeric else s.longitude end
    where s.id = target_id;
  end if;

  if values_json ?| extra_fields then
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type,
      entity_id, trace_id, changed_fields, reason)
    values(auth.uid(), target_branch_id, 'profile.save',
      case when kind = 'customers' then 'customers' else 'customer_sites' end,
      target_id, operation_id,
      array(select key from jsonb_object_keys(values_json) as key where key = any(extra_fields)),
      change_reason);
  end if;
  return target_id;
end $$;

revoke all on function public.save_customer_site_profile(text,uuid,uuid,jsonb,jsonb,text,uuid) from public, anon;
grant execute on function public.save_customer_site_profile(text,uuid,uuid,jsonb,jsonb,text,uuid) to authenticated;
