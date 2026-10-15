-- ════════════════════════════════════════════════════════════════════════════
-- 20261015_04 — the scheduled jobs' run history is kept for two weeks.
-- ════════════════════════════════════════════════════════════════════════════
-- pg_cron writes a row for every run of every job and never removes one. Kept
-- since April, they had become most of the database, and the history grows
-- each day for as long as a job runs, towards the plan's size limit, where
-- the database stops taking writes. Each night a job removes the runs that
-- started more than 14 days ago; the first removal is made here. Only this
-- log is touched: no member's data is in it.
-- Undo: mobile/supabase/migrations-down/20261015_04_the_job_history_is_kept_two_weeks.sql
-- (the removed runs are not restored: they are a log, and no copy keeps them).
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days';

SELECT cron.schedule('the-job-history-is-kept-two-weeks', '23 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days'$$);
