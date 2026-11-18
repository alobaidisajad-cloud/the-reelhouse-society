-- Undo of 20261119_22: a filing's SPOILERS mark reaches its cards: round 13's trigger on the filings, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B9's trigger undone · a filing's spoiler mark leaves its cards as they are (its functions go with B9.down) ──
-- add-only (1): no shipped client uses it: a trigger round 13 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_spoiler_take_veils_its_cards ON public.dispatch_posts;
