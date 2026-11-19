-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_17 — a member's salon messages are held to the day's ceiling: round 14's trigger on the messages.
-- ════════════════════════════════════════════════════════════════════════════
--   1. Each salon message asks the member's day's count before it is sent, after every other check,
--      on the function of 20261120_16 (review round 14).
--   Alone, so lounge_messages is held (SHARE ROW EXCLUSIVE) only from the trigger to the end of this car.
-- Undo: mobile/supabase/migrations-down/20261120_17_a_members_salon_messages_are_held_to_the_ceiling.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- H-A8's trigger (a member's salon messages are held to a day's ceiling), on the function H-A8.up made:
-- it holds lounge_messages (SHARE ROW EXCLUSIVE) only from here to this car's commit. Named to run last
-- of the table's checks before an insert (they run in name order), so a refusal for the rank, the seat
-- or a card is said as itself before the ceiling is asked.
-- add-only (3): it only fixes: a member's 1,001st salon message of the house's day is refused (RH429 'day', the seconds to midnight), every message before it sent as before; replayed as the members themselves (H-A8 rehearsal)
CREATE OR REPLACE TRIGGER zz_a_salon_day_has_a_ceiling
  BEFORE INSERT ON public.lounge_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.lounge_messages_daily_ceiling();
