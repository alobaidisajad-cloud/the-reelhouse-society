-- Undo of 20261120_14: a member's analytics events are held to the day's ceiling: round 14's trigger on the events, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A6's trigger undone · analytics events are filed without a ceiling again (its function goes with H-A6.down) ──
-- add-only (1): no shipped client uses it: a trigger round 14 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS daily_ceiling ON public.analytics_events;
