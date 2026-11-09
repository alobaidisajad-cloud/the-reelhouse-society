-- Undo of 20261109_01: the Dispatch's filings without their stored word count.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it: a column 20261109_01 makes, named by no client before it (TestFlight build 41 and the website checked)
ALTER TABLE public.dispatch_posts DROP COLUMN words;
