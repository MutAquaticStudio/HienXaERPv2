-- PROD-RETURN-COST-01: exact approved branch, current PT409 and security preserved.
-- Approval source SHA256: 3d8511e6ce2a8b37101a8158c30c679a0074feb83697222d89c8c6fd471d8b30
-- Exact already-equivalent QA body is accepted without rewriting it.
-- Preserve current PT409, row locks, command receipts and ACL; add only missing direct-return source cost.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $forward$
declare f record; definition text;
begin
 select p.*,pg_get_userbyid(p.proowner) owner into f from pg_proc p where p.oid='public.resolve_return_case(uuid,text,uuid,text,uuid,integer,uuid)'::regprocedure;
 if f.oid is null or f.owner<>'postgres' or not f.prosecdef or f.provolatile<>'v' or pg_get_function_result(f.oid)<>'uuid' or f.proconfig is distinct from array['search_path=""']::text[]
   or has_function_privilege('anon',f.oid,'EXECUTE') or not has_function_privilege('authenticated',f.oid,'EXECUTE')
   or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee not in (f.proowner,(select oid from pg_roles where rolname='authenticated')))
 then raise exception 'return_cost_forward_security_precondition_mismatch' using errcode='55000'; end if;
 if md5(f.prosrc)='bd1cca9d25c7d663c29d07cdc9f981f9' then return; end if;
 if md5(f.prosrc) not in ('763c794c9670a90950bb81a6b46bced8','bee84e2dacc07ac33a0c9c2182656b7e') then raise exception 'return_cost_forward_prestate_mismatch' using errcode='55000'; end if;
 definition:=pg_get_functiondef(f.oid);
 if strpos(definition,$needle$  unit_cost := coalesce(verified_line.inventory_unit_cost_vnd_per_base, handoff_line.unit_cost_vnd_per_base);
$needle$)=0 then raise exception 'return_cost_source_anchor_missing' using errcode='55000'; end if;
 execute replace(definition,$needle$  unit_cost := coalesce(verified_line.inventory_unit_cost_vnd_per_base, handoff_line.unit_cost_vnd_per_base);
$needle$,$replacement$  if line.source_mode = 'SUPPLIER_DIRECT' and case_row.case_kind = 'CUSTOMER_RETURN' then
    select sum(sfl.payable_amount_vnd)::numeric / nullif(sum(sfl.supplier_base_quantity), 0)
      into unit_cost
    from public.supply_allocations sa
    join public.supplier_fulfillment_lines sfl
      on sfl.purchase_order_line_id = sa.purchase_order_line_id
      and sfl.sales_order_line_id = line.sales_order_line_id
    join public.supplier_fulfillments sf on sf.id = sfl.supplier_fulfillment_id
    where sa.id = line.supply_allocation_id and sf.branch_id = case_row.branch_id;
  else
    unit_cost := coalesce(verified_line.inventory_unit_cost_vnd_per_base, handoff_line.unit_cost_vnd_per_base);
  end if;
$replacement$);
end $forward$;
notify pgrst, 'reload schema';
commit;
