-- Undo of 20261119_18: a member's marks are read in one trip at launch, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-D2 undone · the marks are read page by page again ──
-- add-only (1): no shipped client uses it: a function round 13 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_marks_ledger();
