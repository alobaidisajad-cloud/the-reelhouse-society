-- The undo of 20261015_04: the nightly removal stops. The runs it removed stay removed.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

SELECT cron.unschedule('the-job-history-is-kept-two-weeks');
