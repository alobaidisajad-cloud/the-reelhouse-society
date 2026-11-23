-- A migration that puts a job on the schedule with the function that takes it off once its work is done.
CREATE FUNCTION public.self_test_tell() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'the-self-test-is-told';
  RETURN 'none waits';
END $$;
SELECT cron.schedule('the-self-test-is-told', '1 seconds', 'SELECT public.self_test_tell();');
