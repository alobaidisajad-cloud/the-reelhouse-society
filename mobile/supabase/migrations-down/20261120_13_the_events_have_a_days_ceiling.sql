-- Undo of 20261120_13: a member's analytics events are held to a day's ceiling, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A6 undone · analytics events without a ceiling (run after H-A6.locks.down, which drops the trigger) ──
-- add-only (1): no shipped client uses it: a trigger's function round 14 made, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.analytics_events_daily_ceiling();
