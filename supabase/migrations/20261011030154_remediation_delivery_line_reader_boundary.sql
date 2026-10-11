begin;
create or replace view public.delivery_line_read with(security_invoker=false,security_barrier=true) as
select safe.* from (SELECT q.id,
    q.delivery_id,
    q.sales_order_line_id,
    q.supply_allocation_id,
    q.material_id,
    q.material_name_snapshot,
    q.base_uom_id,
    q.base_uom_symbol,
    q.source_mode,
    q.warehouse_id,
    q.planned_base_quantity,
    q.actual_base_quantity,
    q.accepted_base_quantity,
    q.billable_base_quantity,
    h.moved_base_quantity::text AS loaded_base_quantity
   FROM ( SELECT l.id,
            l.delivery_id,
            l.sales_order_line_id,
            l.supply_allocation_id,
            l.material_id,
            s.material_name_snapshot,
            l.base_uom_id,
            u.symbol AS base_uom_symbol,
            l.source_mode,
            l.warehouse_id,
            l.planned_base_quantity::text AS planned_base_quantity,
            COALESCE(r.actual_base_quantity, 0::numeric)::text AS actual_base_quantity,
            COALESCE(v.accepted_base_quantity, 0::numeric)::text AS accepted_base_quantity,
            COALESCE(v.billable_base_quantity, 0::numeric)::text AS billable_base_quantity
           FROM delivery_lines l
             JOIN sales_order_lines s ON s.id = l.sales_order_line_id
             JOIN units_of_measure u ON u.id = l.base_uom_id
             LEFT JOIN delivery_result_lines r ON r.delivery_line_id = l.id
             LEFT JOIN delivery_verification_lines v ON v.delivery_line_id = l.id) q
     LEFT JOIN delivery_handoff_lines h ON h.delivery_line_id = q.id) safe
where exists(select 1 from public.deliveries d where d.id=safe.delivery_id and private.has_permission(d.branch_id,'delivery.read'));
revoke all on public.delivery_line_read from public,anon;
grant select on public.delivery_line_read to authenticated;
notify pgrst,'reload schema';
commit;
