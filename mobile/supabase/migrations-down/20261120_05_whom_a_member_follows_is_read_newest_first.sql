-- Undo of 20261120_05: its index is dropped, CONCURRENTLY, alone, as it was built.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-A2's index undone ──
-- add-only (1): no shipped client uses it: an index round 14 made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.interactions_following_newest;
