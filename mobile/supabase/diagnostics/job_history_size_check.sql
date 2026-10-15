-- How large the scheduled jobs' run history is, and how far back it goes.
--   node mobile/supabase/diagnostics/read-only.cjs job_history_size_check.sql
SELECT 'rows: ' || count(*) || ' | oldest: ' || coalesce(min(start_time)::text, 'none')
       || ' | size: ' || pg_size_pretty(pg_total_relation_size('cron.job_run_details'))
FROM cron.job_run_details;
SELECT 'job ' || j.jobname || ' | ' || j.schedule || ' | runs kept: ' || count(d.runid)
FROM cron.job j LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
GROUP BY j.jobname, j.schedule ORDER BY count(d.runid) DESC;
SELECT 'database size: ' || pg_size_pretty(pg_database_size(current_database()));
