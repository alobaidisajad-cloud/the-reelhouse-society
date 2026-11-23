-- The jobs self-test's starting point: a schedule kept as pg_cron keeps one (a job by its name, put on
-- again in its place), a job that stands for good, and a job whose function takes it off the schedule
-- once its work is done, as the members' lists, a closed ballot's voters and the Lobby's draft do.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, schedule text NOT NULL, command text NOT NULL,
  active boolean NOT NULL DEFAULT true, jobname text UNIQUE);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid $$;
CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobid = job_id RETURNING true $$;
CREATE FUNCTION public.self_test_fill() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'the-self-test-is-filled';
  RETURN 'complete';
END $$;
SELECT cron.schedule('the-self-test-stands', '17 * * * *', 'SELECT 1;');
SELECT cron.schedule('the-self-test-is-filled', '1 seconds', 'SELECT public.self_test_fill();');
