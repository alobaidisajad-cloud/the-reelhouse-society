-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_14 — a member's analytics events are held to the day's ceiling: round 14's trigger on the events.
-- ════════════════════════════════════════════════════════════════════════════
--   1. Each analytics event asks the member's day's count before it is filed, on the function of
--      20261120_13 (review round 14).
--   Alone, so analytics_events is held (SHARE ROW EXCLUSIVE) only from the trigger to the end of this car.
-- Undo: mobile/supabase/migrations-down/20261120_14_a_members_events_are_held_to_the_ceiling.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- H-A6's trigger (a member's analytics events are held to a day's ceiling), on the function H-A6.up
-- made: it holds analytics_events (SHARE ROW EXCLUSIVE) only from here to this car's commit.
-- add-only (3): it only fixes: a member's 1,001st analytics event of the house's day is refused (RH429, the seconds to midnight), every event before it filed as before; replayed as the members themselves (H-A6 rehearsal)
CREATE OR REPLACE TRIGGER daily_ceiling
  BEFORE INSERT ON public.analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION public.analytics_events_daily_ceiling();
