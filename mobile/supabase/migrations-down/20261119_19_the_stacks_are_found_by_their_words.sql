-- Undo of 20261119_19: the house-wide search finds its stacks by their words, never by reading every stack, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-D4 undone · the stacks are read by the phone again ──
-- add-only (1): no shipped client uses it: a function round 13 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.search_stacks(text, timestamp with time zone, uuid, integer);
