-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_08 — a member's critiques are paced: round 14's triggers on the critiques.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A critique on a record, a stack or a filing asks the member's pace before it is filed, after every
--      other check, on the function of 20261120_07 (review round 14).
--   Alone, so log_comments, list_comments and dispatch_comments are each held (SHARE ROW EXCLUSIVE) only
--   from its trigger to the end of this car.
-- Undo: mobile/supabase/migrations-down/20261120_08_critiques_are_paced_as_a_person_writes.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- H-A3's triggers (a member's critiques are paced as a person writes), on the function H-A3.up made:
-- they hold the critiques' tables (SHARE ROW EXCLUSIVE) only from here to this car's commit. Named to
-- run last of each table's checks before an insert (they run in name order), so a refusal for the
-- member's standing, a block or a piece gone is said as itself before the pace is asked.
-- add-only (3): it only fixes: a member's critiques on records are paced (a room of 30, one more every 20 seconds, 500 a day, 20 an hour on one record), every other critique filed as before; replayed as the members themselves (H-A3 rehearsal)
CREATE OR REPLACE TRIGGER zz_a_critique_is_paced
  BEFORE INSERT ON public.log_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_critique_pace();

-- add-only (3): it only fixes: a member's critiques on stacks are paced as on records, every other critique filed as before; replayed as the members themselves (H-A3 rehearsal)
CREATE OR REPLACE TRIGGER zz_a_critique_is_paced
  BEFORE INSERT ON public.list_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_critique_pace();

-- add-only (3): it only fixes: a member's critiques on filings are paced as on records, every other critique filed as before; replayed as the members themselves (H-A3 rehearsal)
CREATE OR REPLACE TRIGGER zz_a_critique_is_paced
  BEFORE INSERT ON public.dispatch_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_critique_pace();
