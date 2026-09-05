-- Run in the Hiền Xa project's SQL Editor after observing slow read IDs.
-- Read-only diagnostics: no schema changes and no customer/contact values.
begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '3s';

select relname, n_live_tup, seq_scan, seq_tup_read, idx_scan,
       last_analyze, last_autoanalyze
from pg_stat_user_tables
where schemaname = 'public'
  and relname in ('customers', 'customer_contacts', 'customer_sites',
    'customer_price_rules', 'materials', 'material_uom_conversions',
    'purchase_orders', 'purchase_order_lines', 'purchase_order_evidence',
    'supplier_price_history', 'sales_order_lines', 'supply_allocations',
    'deliveries', 'delivery_lines')
order by seq_tup_read desc;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('customers', 'customer_contacts', 'customer_sites',
    'customer_price_rules', 'materials', 'material_uom_conversions',
    'purchase_orders', 'purchase_order_lines', 'purchase_order_evidence',
    'supplier_price_history', 'sales_order_lines', 'supply_allocations',
    'deliveries', 'delivery_lines')
order by tablename, indexname;

select state, wait_event_type, wait_event, count(*) as connections
from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid()
group by state, wait_event_type, wait_event;

explain (analyze, buffers)
select id from public.customers order by id limit 51;

explain (analyze, buffers)
select id from public.materials order by id limit 51;

explain (analyze, buffers)
select id from public.purchase_orders order by id limit 51;

explain (analyze, buffers)
select line.id
from public.purchase_order_lines line
where line.purchase_order_id in (
  select id from public.purchase_orders order by id limit 50
)
order by line.purchase_order_id, line.line_number;

explain (analyze, buffers)
select line.id
from public.sales_order_lines line
join public.sales_orders so on so.id = line.sales_order_id
where so.status in ('CONFIRMED', 'FULFILLING')
   or exists (select 1 from public.supply_allocations history
              where history.sales_order_line_id = line.id)
order by line.id limit 51;

rollback;
