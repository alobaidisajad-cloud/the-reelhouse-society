-- Undo of 20261120_16: a member's salon messages are held to a day's ceiling, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A8 undone · salon messages without a ceiling (run after H-A8.locks.down, which drops the trigger) ──
-- add-only (1): no shipped client uses it: a trigger's function round 14 made, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.lounge_messages_daily_ceiling();
