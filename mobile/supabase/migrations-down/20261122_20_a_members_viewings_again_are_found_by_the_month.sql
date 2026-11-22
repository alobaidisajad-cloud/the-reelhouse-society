-- Undo of 20261122_20: its index is dropped, CONCURRENTLY, alone, as it was built. Undo 20261122_21 first:
-- its reads of a span find the records seen again by this index.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the logs of films seen again, by month, undone ──
-- add-only (1): no shipped client uses it: an index this car made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.logs_seen_again_by_month;
