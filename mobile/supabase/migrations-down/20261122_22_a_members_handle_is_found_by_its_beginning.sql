-- Undo of 20261122_22: its index is dropped, CONCURRENTLY, alone, as it was built. Undo 20261122_23 first:
-- its search reads by this index.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the members' handles by their beginnings undone ──
-- add-only (1): no shipped client uses it: an index this car made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.profiles_username_beginning;
