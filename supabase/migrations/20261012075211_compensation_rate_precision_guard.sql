-- Reject nonfinite/overprecision rates before numeric(20,6) storage.
-- A successful old intent still returns its original result, without a new version.
begin;
create or replace function public.create_compensation_rule(target_branch_id uuid,rule_code text,rule_name text,target_employee_id uuid,earning_type text,calculation_kind text,rate_vnd_per_unit numeric,rate_bps integer,classification text,effective_from date,effective_to date,operation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare payload_hash text; receipt public.command_receipts%rowtype; entity_id uuid; next_version integer;
begin
  if not private.has_permission(target_branch_id,'compensation.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if upper(trim(rule_code))!~'^[A-Z0-9_-]{2,32}$' or char_length(trim(rule_name)) not between 2 and 160 or earning_type not in ('FIXED_MONTHLY','PER_JOB','PER_TRIP','PER_HOUR','PER_SHIFT','PER_DAY','PER_TON','PER_M3','PER_BAG','PER_UNIT','BONUS','ADJUSTMENT','SALES_COMMISSION') or calculation_kind not in ('FIXED_PER_BASIS','PERCENT_BPS') or classification not in ('DIRECT_LABOR','OPEX','SALES_COMMISSION') then raise exception 'invalid_compensation_rule' using errcode='22023'; end if;
  payload_hash:=private.command_payload_hash(jsonb_build_object('branch',target_branch_id,'code',upper(trim(rule_code)),'name',trim(rule_name),'employee',target_employee_id,'type',earning_type,'calculation',calculation_kind,'rate',rate_vnd_per_unit,'bps',rate_bps,'classification',classification,'from',effective_from,'to',effective_to));
  select * into receipt from public.command_receipts where command_receipts.operation_id=create_compensation_rule.operation_id;
  if found then if receipt.command_name<>'create_compensation_rule' or receipt.payload_hash<>payload_hash then raise exception 'operation_payload_conflict' using errcode='23505'; end if; return receipt.result_entity_id; end if;
  if calculation_kind='FIXED_PER_BASIS' then
    perform private.require_exact_quantity(rate_vnd_per_unit,false);
    if rate_bps is not null then raise exception 'invalid_compensation_rate' using errcode='22023'; end if;
  elsif rate_vnd_per_unit is not null or rate_bps is null or rate_bps not between 1 and 10000 then
    raise exception 'invalid_compensation_rate' using errcode='22023';
  end if;
  if target_employee_id is not null then perform 1 from public.employee_branch_access where employee_id=target_employee_id and branch_id=target_branch_id and active; if not found then raise exception 'invalid_rule_employee' using errcode='23503'; end if; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_branch_id::text||':'||upper(trim(rule_code)),0));
  select coalesce(max(version),0)+1 into next_version from public.compensation_rules where branch_id=target_branch_id and code=upper(trim(rule_code));
  insert into public.compensation_rules(branch_id,code,name,version,employee_id,earning_type,calculation_kind,rate_vnd_per_unit,rate_bps,classification,effective_from,effective_to,created_by) values(target_branch_id,upper(trim(rule_code)),trim(rule_name),next_version,target_employee_id,earning_type,calculation_kind,rate_vnd_per_unit,rate_bps,classification,effective_from,effective_to,(select auth.uid())) returning id into entity_id;
  insert into public.command_receipts values(operation_id,(select auth.uid()),'create_compensation_rule',payload_hash,'compensation_rule',entity_id,now());
  return entity_id;
end $$;
revoke all on function public.create_compensation_rule(uuid,text,text,uuid,text,text,numeric,integer,text,date,date,uuid) from public,anon;
grant execute on function public.create_compensation_rule(uuid,text,text,uuid,text,text,numeric,integer,text,date,date,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
