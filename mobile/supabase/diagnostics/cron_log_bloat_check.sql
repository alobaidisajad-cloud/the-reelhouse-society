-- ════════════════════════════════════════════════════════════════════════════
-- cron_log_bloat_check.sql — the scheduler's run log: its size, its rows, who owns it. Read-only.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/read-only.cjs cron_log_bloat_check.sql
--
-- disk_io_spend_check.sql (2026-11-10) found cron.job_run_details at 178 MB holding 4,392 rows:
-- 80% of the database, and read whole from disk by the daily cleanup. This reads its parts, its
-- oldest and newest rows, the rate it is written at, and whether postgres may shrink it.
-- ════════════════════════════════════════════════════════════════════════════
\pset format aligned
\pset tuples_only off
SELECT pg_size_pretty(pg_relation_size('cron.job_run_details')) AS heap,
       pg_size_pretty(pg_indexes_size('cron.job_run_details')) AS indexes,
       pg_size_pretty(pg_total_relation_size('cron.job_run_details') - pg_relation_size('cron.job_run_details')
                      - pg_indexes_size('cron.job_run_details')) AS toast,
       (SELECT count(*) FROM cron.job_run_details) AS rows,
       (SELECT min(start_time) FROM cron.job_run_details) AS oldest,
       (SELECT max(start_time) FROM cron.job_run_details) AS newest;
SELECT pg_get_userbyid(c.relowner) AS owner, has_table_privilege('postgres', 'cron.job_run_details', 'DELETE') AS postgres_deletes,
       pg_has_role('postgres', c.relowner, 'MEMBER') AS postgres_is_owner_member
  FROM pg_class c WHERE c.oid = 'cron.job_run_details'::regclass;
SELECT jobid, count(*) AS rows, pg_size_pretty(sum(pg_column_size(return_message))::bigint) AS messages,
       max(length(return_message)) AS longest_message
  FROM cron.job_run_details GROUP BY jobid ORDER BY rows DESC;
