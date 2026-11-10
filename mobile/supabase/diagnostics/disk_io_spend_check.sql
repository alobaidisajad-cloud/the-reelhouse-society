-- ════════════════════════════════════════════════════════════════════════════
-- disk_io_spend_check.sql — what spends the disk's IO on production. Read-only.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/read-only.cjs disk_io_spend_check.sql
--
-- The Infrastructure page showed the Disk IO balance at 0% for days on a 222 MB
-- database with the CPU idle (2026-11-10). This lists what reads and writes the
-- disk: the scheduled jobs, the statements that read or write the most blocks,
-- the tables read most from disk, the queues that grow, and the checkpoints.
-- ════════════════════════════════════════════════════════════════════════════
\pset format aligned
\pset tuples_only off

\echo '── scheduled jobs (pg_cron) ──'
SELECT jobid, schedule, active, left(regexp_replace(command, '\s+', ' ', 'g'), 120) AS command
  FROM cron.job ORDER BY jobid;

\echo '── scheduled runs, last 24 h: count and time by job ──'
SELECT jobid, count(*) AS runs, round(avg(extract(epoch FROM end_time - start_time))::numeric, 2) AS avg_s,
       count(*) FILTER (WHERE status <> 'succeeded') AS failed
  FROM cron.job_run_details WHERE start_time > now() - interval '24 hours'
 GROUP BY jobid ORDER BY runs DESC;

\echo '── statements by blocks read from disk + written (pg_stat_statements) ──'
SELECT calls, round(total_exec_time::numeric / 1000, 1) AS total_s,
       shared_blks_read AS disk_reads, shared_blks_written + shared_blks_dirtied AS writes,
       temp_blks_written AS temp_writes, wal_bytes / 1024 / 1024 AS wal_mb,
       left(regexp_replace(query, '\s+', ' ', 'g'), 140) AS query
  FROM pg_stat_statements
 ORDER BY shared_blks_read + shared_blks_written + shared_blks_dirtied + temp_blks_written DESC
 LIMIT 15;

\echo '── statements by WAL written ──'
SELECT calls, wal_bytes / 1024 / 1024 AS wal_mb, left(regexp_replace(query, '\s+', ' ', 'g'), 140) AS query
  FROM pg_stat_statements ORDER BY wal_bytes DESC LIMIT 10;

\echo '── when the statistics were last reset ──'
SELECT stats_reset FROM pg_stat_statements_info;

\echo '── tables read most from disk, and rows churned ──'
SELECT schemaname || '.' || relname AS tab, heap_blks_read, idx_blks_read, heap_blks_hit
  FROM pg_statio_all_tables ORDER BY heap_blks_read + coalesce(idx_blks_read, 0) DESC LIMIT 12;
SELECT schemaname || '.' || relname AS tab, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup,
       last_autovacuum, autovacuum_count
  FROM pg_stat_all_tables ORDER BY n_tup_ins + n_tup_upd + n_tup_del DESC LIMIT 12;

\echo '── queues and logs that can grow ──'
SELECT 'net.http_request_queue' AS what, count(*) FROM net.http_request_queue
UNION ALL SELECT 'net._http_response', count(*) FROM net._http_response
UNION ALL SELECT 'cron.job_run_details', count(*) FROM cron.job_run_details;

\echo '── checkpoints and the background writer ──'
SELECT * FROM pg_stat_checkpointer;
SELECT buffers_clean, maxwritten_clean, stats_reset FROM pg_stat_bgwriter;

\echo '── biggest relations ──'
SELECT n.nspname || '.' || c.relname AS rel, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r', 'm') ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 12;
