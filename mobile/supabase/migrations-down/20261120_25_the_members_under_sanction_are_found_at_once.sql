-- Undo of 20261120_25: its index is dropped, CONCURRENTLY, alone, as it was built.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-B2's index undone ──
-- add-only (1): no shipped client uses it: an index round 14 made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.profiles_under_sanction;
