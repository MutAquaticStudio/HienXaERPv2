begin read only;
set local statement_timeout = '3s';
with largest_tables as (
  select s.schemaname, s.relname as table_name,
    pg_total_relation_size(s.relid) as total_bytes,
    pg_table_size(s.relid) as table_bytes,
    pg_indexes_size(s.relid) as index_bytes,
    s.n_live_tup as estimated_live_rows, s.n_dead_tup as estimated_dead_rows,
    s.last_autovacuum, s.last_autoanalyze
  from pg_stat_user_tables s
  where s.schemaname in ('public','auth','storage')
  order by pg_total_relation_size(s.relid) desc, s.schemaname, s.relname limit 25
), largest_indexes as (
  select i.schemaname, i.relname as table_name, i.indexrelname as index_name,
    pg_relation_size(i.indexrelid) as index_bytes, i.idx_scan as recorded_scans,
    c.indisprimary as primary_key, c.indisunique as unique_constraint_index
  from pg_stat_user_indexes i join pg_index c on c.indexrelid = i.indexrelid
  where i.schemaname = 'public'
  order by pg_relation_size(i.indexrelid) desc, i.relname, i.indexrelname limit 25
), schema_sizes as (
  select s.schemaname, count(*) as table_count,
    sum(pg_total_relation_size(s.relid)) as total_relation_bytes
  from pg_stat_user_tables s
  where s.schemaname in ('public','auth','storage') group by s.schemaname
)
select jsonb_pretty(jsonb_build_object(
  'captured_at',now(), 'server_version',current_setting('server_version'),
  'database_bytes',pg_database_size(current_database()),
  'database_size',pg_size_pretty(pg_database_size(current_database())),
  'schemas',(select jsonb_agg(to_jsonb(s) order by s.schemaname) from schema_sizes s),
  'tables',(select jsonb_agg(to_jsonb(t) order by t.total_bytes desc,t.schemaname,t.table_name) from largest_tables t),
  'indexes',(select jsonb_agg(to_jsonb(i) order by i.index_bytes desc,i.table_name,i.index_name) from largest_indexes i)
)) as storage_inventory;
commit;
