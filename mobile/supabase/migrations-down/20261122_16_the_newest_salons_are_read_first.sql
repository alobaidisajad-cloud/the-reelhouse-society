-- Undo of 20261122_16: its index is dropped, CONCURRENTLY, alone, as it was built.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the newest salons undone ──
-- add-only (1): no shipped client uses it: an index this car made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.lounges_newest;
