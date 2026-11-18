-- Undo of 20261119_16: a take marked SPOILERS keeps its words off its cards in the salons, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B9 undone · the functions of a spoiler take's cards (their trigger goes first, with B9.locks.down) ──
--   The cards titled stay titled: their words were a take its author marked as a spoiler; an undo
--   that wrote them back would print the spoiler in the salon again.
-- add-only (1): no shipped client uses it: a trigger's function round 13 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_spoiler_take_veils_its_cards();
-- add-only (1): no shipped client uses it: a function round 13 made, asked by the house alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_filings_shared_line(text, text, text, text, text);
