-- Metadata only. No business rows, cleanup, VACUUM, grants or schema mutation.
-- Run only against the explicitly selected database with read-authorized access.
-- Tuple counts and index usage are estimates since the last statistics reset;
-- they are not proof of bloat, safe deletion or a removable index.
begin read only;
set local statement_timeout = '3s';

select current_database() as database_name,
  pg_database_size(current_database()) as database_bytes,
  pg_size_pretty(pg_database_size(current_database())) as database_size;

select s.schemaname, s.relname as table_name,
  pg_total_relation_size(s.relid) as total_bytes,
  pg_size_pretty(pg_total_relation_size(s.relid)) as total_size,
  pg_table_size(s.relid) as table_bytes,
  pg_indexes_size(s.relid) as index_bytes,
  s.n_live_tup as estimated_live_rows,
  s.n_dead_tup as estimated_dead_rows,
  s.last_autovacuum, s.last_autoanalyze
from pg_stat_user_tables s
where s.schemaname in ('public', 'auth', 'storage')
order by pg_total_relation_size(s.relid) desc, s.schemaname, s.relname
limit 25;

select i.schemaname, i.relname as table_name, i.indexrelname as index_name,
  pg_relation_size(i.indexrelid) as index_bytes,
  i.idx_scan as recorded_scans,
  c.indisprimary as primary_key, c.indisunique as unique_constraint_index
from pg_stat_user_indexes i
join pg_index c on c.indexrelid = i.indexrelid
where i.schemaname = 'public'
order by pg_relation_size(i.indexrelid) desc, i.relname, i.indexrelname
limit 25;

commit;
