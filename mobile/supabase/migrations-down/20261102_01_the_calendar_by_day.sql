-- Undo of 20261102_01_the_calendar_by_day: the function goes; the app's earlier read of the logs needs nothing back.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION public.calendar_days(uuid);
