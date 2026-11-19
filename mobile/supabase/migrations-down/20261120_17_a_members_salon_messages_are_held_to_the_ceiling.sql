-- Undo of 20261120_17: a member's salon messages are held to the day's ceiling: round 14's trigger on the messages, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A8's trigger undone · salon messages are sent without a ceiling again (its function goes with H-A8.down) ──
-- add-only (1): no shipped client uses it: a trigger round 14 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS zz_a_salon_day_has_a_ceiling ON public.lounge_messages;
