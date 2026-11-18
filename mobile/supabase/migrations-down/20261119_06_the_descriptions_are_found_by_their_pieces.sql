-- Undo of 20261119_06: its index is dropped, CONCURRENTLY, alone, as it was built.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-D4's index undone ──
-- add-only (1): no shipped client uses it: an index round 13 made (TestFlight build 41 and the website checked)
DROP INDEX CONCURRENTLY IF EXISTS public.lists_description_trigram;
