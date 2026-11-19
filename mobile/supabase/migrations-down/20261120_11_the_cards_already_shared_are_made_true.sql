-- Undo of 20261120_11: the cards already in the salons are made true, once, by the house's rule, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A4.pass undone · the pass's function goes; what the pass wrote on each card stays, as it is only
-- what the house holds of its piece ──
-- add-only (1): no shipped client uses it: a function H-A4.pass made, asked by the house alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.the_cards_made_true(integer);
