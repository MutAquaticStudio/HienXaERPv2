-- Native supplier purchase pricing; existing authoritative rows, RBAC and ledgers remain.
begin;
create function public.purchase_pricing_config_options(target_branch_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $f$
begin
 if auth.uid() is null or not private.has_permission(target_branch_id,'purchasing.price.manage') then raise exception 'forbidden' using errcode='42501';end if;
 return jsonb_build_object(
 'suppliers',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (select id,name from public.suppliers where branch_id=target_branch_id and active order by name,id limit 500) s),
 'materials',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from (select id,name from public.materials where active and purchase_enabled order by name,id limit 500) m),
 'units',(select coalesce(jsonb_agg(to_jsonb(u)),'[]'::jsonb) from (select id,symbol name from public.units_of_measure where active order by symbol,id limit 500) u),
 'customers','[]'::jsonb,'groups','[]'::jsonb);
end $f$;

create function public.save_purchase_price_rule(target_id uuid,target_branch_id uuid,supersedes_id uuid,expected_version integer,values_json jsonb,change_reason text,operation_id uuid) returns uuid
 language plpgsql security definer set search_path='' as $f$
declare old_rule public.purchase_price_rules%rowtype; receipt public.command_receipts%rowtype;
 supplier uuid; material uuid; uom uuid; amount bigint; source text; starts timestamptz; ends timestamptz;
 field_name text; next_version integer; payload_hash text;
begin
 if auth.uid() is null or not private.has_permission(target_branch_id,'purchasing.price.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if target_id is null or operation_id is null or jsonb_typeof(values_json) is distinct from 'object'
 or char_length(trim(coalesce(change_reason,''))) not between 3 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 for field_name in select jsonb_object_keys(values_json) loop
  if field_name<>all(array['supplier_id','material_id','purchase_uom_id','unit_cost_vnd','source_type','effective_from','effective_to']) then raise exception 'field_not_editable' using errcode='42501';end if;
 end loop;
 payload_hash=private.command_payload_hash(jsonb_build_object('target',target_id,'branch',target_branch_id,'supersedes',supersedes_id,'version',expected_version,'values',values_json,'reason',change_reason));
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 select * into receipt from public.command_receipts c where c.operation_id=save_purchase_price_rule.operation_id;
 if found then
  if receipt.command_name<>'save_purchase_price_rule' or receipt.payload_hash<>payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;
  return receipt.result_entity_id;
 end if;
 if coalesce(values_json->>'unit_cost_vnd','')!~'^[1-9][0-9]{0,18}$' or (values_json->>'unit_cost_vnd')::numeric>9223372036854775807 then raise exception 'invalid_price' using errcode='22023';end if;
 amount=(values_json->>'unit_cost_vnd')::bigint;source=values_json->>'source_type';
 starts=(values_json->>'effective_from')::timestamptz;ends=(values_json->>'effective_to')::timestamptz;
 if source is null or source not in ('LIST','CONTRACT') or starts is null or (ends is not null and ends<=starts) then raise exception 'invalid_price_rule' using errcode='22023';end if;
 if supersedes_id is not null then
  select * into old_rule from public.purchase_price_rules where id=supersedes_id and branch_id=target_branch_id;
  if old_rule.id is null then raise exception 'stale_price_rule' using errcode='PT409';end if;
  supplier=old_rule.supplier_id;material=old_rule.material_id;uom=old_rule.purchase_uom_id;
  if values_json ?| array['supplier_id','material_id','purchase_uom_id'] then raise exception 'scope_immutable' using errcode='22023';end if;
 else
  if expected_version is not null then raise exception 'unexpected_version' using errcode='22023';end if;
  supplier=(values_json->>'supplier_id')::uuid;material=(values_json->>'material_id')::uuid;uom=(values_json->>'purchase_uom_id')::uuid;
 end if;
 if not exists(select 1 from public.suppliers where id=supplier and branch_id=target_branch_id and active) then raise exception 'supplier_outside_branch' using errcode='42501';end if;
 if not exists(select 1 from public.materials where id=material and active and purchase_enabled)
 or not exists(select 1 from public.units_of_measure where id=uom and active) then raise exception 'material_or_uom_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_branch_id::text||':'||supplier::text||':'||material::text||':'||uom::text,0));
 if supersedes_id is not null then
  select * into old_rule from public.purchase_price_rules where id=supersedes_id and branch_id=target_branch_id for update;
  if old_rule.id is null or expected_version is null or old_rule.version<>expected_version or not old_rule.active
  or starts<old_rule.effective_from or exists(select 1 from public.purchase_price_rules p where p.supplier_id=supplier and p.material_id=material and p.purchase_uom_id=uom and p.version>old_rule.version) then raise exception 'stale_price_rule' using errcode='PT409';end if;
 end if;
 if exists(select 1 from public.purchase_price_rules p where p.branch_id=target_branch_id and p.supplier_id=supplier and p.material_id=material and p.purchase_uom_id=uom and p.active
  and (supersedes_id is null or p.id<>supersedes_id) and tstzrange(p.effective_from,p.effective_to,'[)')&&tstzrange(starts,ends,'[)')) then raise exception 'active_rule_exists' using errcode='PT409';end if;
 select coalesce(max(p.version),0)+1 into next_version from public.purchase_price_rules p where p.supplier_id=supplier and p.material_id=material and p.purchase_uom_id=uom;
 if supersedes_id is not null then
  update public.purchase_price_rules set effective_to=case when effective_from=starts then effective_to when effective_to is null or effective_to>starts then starts else effective_to end,
   active=case when effective_from=starts then false else active end where id=supersedes_id;
 end if;
 insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,effective_to,active,created_by)
 values(target_id,target_branch_id,supplier,material,uom,amount,next_version,source,starts,ends,true,auth.uid());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),target_branch_id,'purchase_pricing.save','purchase_price_rules',target_id,operation_id,array(select jsonb_object_keys(values_json)),change_reason);
 insert into public.command_receipts values(operation_id,auth.uid(),'save_purchase_price_rule',payload_hash,'purchase_price_rule',target_id,now());
 return target_id;
end $f$;

create function public.deactivate_purchase_price_rule(target_id uuid,target_branch_id uuid,expected_version integer,change_reason text,operation_id uuid) returns uuid
 language plpgsql security definer set search_path='' as $f$
declare old_rule public.purchase_price_rules%rowtype;receipt public.command_receipts%rowtype;payload_hash text;
begin
 if auth.uid() is null or not private.has_permission(target_branch_id,'purchasing.price.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if target_id is null or operation_id is null or expected_version is null or char_length(trim(coalesce(change_reason,''))) not between 3 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 payload_hash=private.command_payload_hash(jsonb_build_object('target',target_id,'branch',target_branch_id,'version',expected_version,'reason',change_reason));
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 select * into receipt from public.command_receipts c where c.operation_id=deactivate_purchase_price_rule.operation_id;
 if found then
  if receipt.command_name<>'deactivate_purchase_price_rule' or receipt.payload_hash<>payload_hash or receipt.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;
 end if;
 select * into old_rule from public.purchase_price_rules where id=target_id and branch_id=target_branch_id for update;
 if old_rule.id is null or old_rule.version<>expected_version or not old_rule.active then raise exception 'stale_price_rule' using errcode='PT409';end if;
 update public.purchase_price_rules set active=false where id=target_id;
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),target_branch_id,'purchase_pricing.deactivate','purchase_price_rules',target_id,operation_id,array['active'],change_reason);
 insert into public.command_receipts values(operation_id,auth.uid(),'deactivate_purchase_price_rule',payload_hash,'purchase_price_rule',target_id,now());
 return target_id;
end $f$;
revoke all on function public.purchase_pricing_config_options(uuid),public.save_purchase_price_rule(uuid,uuid,uuid,integer,jsonb,text,uuid),public.deactivate_purchase_price_rule(uuid,uuid,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.purchase_pricing_config_options(uuid),public.save_purchase_price_rule(uuid,uuid,uuid,integer,jsonb,text,uuid),public.deactivate_purchase_price_rule(uuid,uuid,integer,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
