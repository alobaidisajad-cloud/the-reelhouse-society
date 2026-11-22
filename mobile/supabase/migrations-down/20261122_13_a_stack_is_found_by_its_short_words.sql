-- Undo of 20261122_13: its index is dropped, CONCURRENTLY, alone, as it was built. Undo 20261122_15 first:
-- its searches read by this index.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the stacks' short words undone ──
-- add-only (1): no shipped client uses it: an index this car made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.lists_short_grams;
