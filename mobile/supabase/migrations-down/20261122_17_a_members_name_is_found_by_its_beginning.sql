-- Undo of 20261122_17: its index is dropped, CONCURRENTLY, alone, as it was built. Undo 20261122_18 first:
-- its search reads by this index.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the members' names by their beginnings undone ──
-- add-only (1): no shipped client uses it: an index this car made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.profiles_display_name_beginning;
