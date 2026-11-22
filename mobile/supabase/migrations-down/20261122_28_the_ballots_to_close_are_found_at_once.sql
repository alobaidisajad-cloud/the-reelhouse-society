-- Undo of 20261122_28: its index is dropped, CONCURRENTLY, alone, as it was built.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the open ballots, by when they close, undone ──
-- add-only (1): no shipped client uses it: an index this car made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.dispatch_posts_ballots_to_close;
