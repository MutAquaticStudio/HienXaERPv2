-- Owner approved source-tuple freeze after a non-CANCELLED Delivery (2026-10-07).
-- No role/ACL change, data backfill, quantity-policy change, or historical rewrite.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $source_guard$
declare f record; definition text;
begin
 select p.*,pg_get_userbyid(p.proowner) owner into f from pg_proc p where p.oid='public.upsert_supply_allocation(uuid,text,uuid,uuid,numeric,uuid,integer,uuid)'::regprocedure;
 if f.oid is null or f.owner<>'postgres' or not f.prosecdef or f.provolatile<>'v' or pg_get_function_result(f.oid)<>'uuid' or f.proconfig is distinct from array['search_path=""']::text[]
   or has_function_privilege('anon',f.oid,'EXECUTE') or not has_function_privilege('authenticated',f.oid,'EXECUTE')
   or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee not in (f.proowner,(select oid from pg_roles where rolname='authenticated'))) then
   raise exception 'allocation_source_guard_security_precondition_mismatch' using errcode='55000';
 end if;
 if md5(f.prosrc)='7c6b351c15944e3de3b3e8aa4e510ca9' then return; end if;
 if md5(f.prosrc)<>'4af0faf2b075f27ec5271aed33a48fcd' then raise exception 'allocation_source_guard_prestate_mismatch' using errcode='55000'; end if;
 definition:=pg_get_functiondef(f.oid);
 if strpos(definition,$needle$    perform private.assert_allocation_capacity(target_sales_order_line_id, requested_base_quantity, target_allocation_id);$needle$)=0 then raise exception 'allocation_source_guard_anchor_missing' using errcode='55000'; end if;
 execute replace(definition,$needle$    perform private.assert_allocation_capacity(target_sales_order_line_id, requested_base_quantity, target_allocation_id);$needle$,$replacement$    if row(existing.supply_mode, existing.purchase_order_line_id, existing.warehouse_id)
      is distinct from row(upsert_supply_allocation.supply_mode, target_purchase_order_line_id, target_warehouse_id)
      and exists (select 1 from public.delivery_lines l join public.deliveries d on d.id=l.delivery_id
        where l.supply_allocation_id=existing.id and d.execution_state<>'CANCELLED') then
      raise exception 'allocation_source_locked_after_delivery' using errcode='23514';
    end if;
    perform private.assert_allocation_capacity(target_sales_order_line_id, requested_base_quantity, target_allocation_id);$replacement$);
end $source_guard$;
notify pgrst,'reload schema';
commit;
