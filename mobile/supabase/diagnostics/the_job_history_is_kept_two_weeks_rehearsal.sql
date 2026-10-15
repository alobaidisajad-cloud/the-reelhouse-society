-- ════════════════════════════════════════════════════════════════════════════
-- the_job_history_is_kept_two_weeks_rehearsal.sql — 20261015_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_job_history_is_kept_two_weeks_rehearsal.sql --with-train
--
-- With with_train set, 20261015_04 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). Then:
--   - no run older than 14 days is left, and every run of the last 14 days is;
--   - the removal is scheduled each night, and touches only the job log;
--   - the jobs themselves are untouched.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
-- Only runs started before this transaction (now() is its start): a job running meanwhile
-- changes no count.
SELECT count(*) AS recent FROM cron.job_run_details WHERE start_time >= now() - interval '14 days' AND start_time < now() \gset rh_
SELECT count(*) AS jobs FROM cron.job WHERE jobname <> 'the-job-history-is-kept-two-weeks' \gset rh_
\if :{?with_train}
\ir ../../../supabase/migrations/20261015_04_the_job_history_is_kept_two_weeks.sql
\endif

DO $$ BEGIN
  PERFORM pg_temp.rh_case('no run older than 14 days is left', '0',
    (SELECT count(*)::text FROM cron.job_run_details WHERE start_time < now() - interval '14 days'));
  PERFORM pg_temp.rh_case('the nightly removal is scheduled, and runs', '23 4 * * *|true',
    (SELECT j.schedule || '|' || j.active::text FROM cron.job j WHERE j.jobname = 'the-job-history-is-kept-two-weeks'));
  PERFORM pg_temp.rh_case('it removes from the job log alone, and only what is 14 days old', 'true',
    (SELECT j.command = 'DELETE FROM cron.job_run_details WHERE start_time < now() - interval ''14 days'''
     FROM cron.job j WHERE j.jobname = 'the-job-history-is-kept-two-weeks')::text);
END $$;
SELECT pg_temp.rh_case('every run of the last 14 days is kept', :'rh_recent',
  (SELECT count(*)::text FROM cron.job_run_details WHERE start_time >= now() - interval '14 days' AND start_time < now())) AS done \gset rh_
SELECT pg_temp.rh_case('the other jobs are untouched', :'rh_jobs',
  (SELECT count(*)::text FROM cron.job WHERE jobname <> 'the-job-history-is-kept-two-weeks')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
