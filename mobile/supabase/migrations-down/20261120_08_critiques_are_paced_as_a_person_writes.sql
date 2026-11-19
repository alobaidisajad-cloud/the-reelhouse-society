-- Undo of 20261120_08: a member's critiques are paced: round 14's triggers on the critiques, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A3's triggers undone · critiques are filed unpaced again (their function goes with H-A3.down) ──
-- add-only (1): no shipped client uses it: a trigger round 14 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS zz_a_critique_is_paced ON public.log_comments;
-- add-only (1): no shipped client uses it: a trigger round 14 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS zz_a_critique_is_paced ON public.list_comments;
-- add-only (1): no shipped client uses it: a trigger round 14 made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS zz_a_critique_is_paced ON public.dispatch_comments;
