-- ════════════════════════════════════════════════════════════════════════════
-- 20261117_02 — what goes takes its word with it: round 11's triggers on the tables members write.
-- ════════════════════════════════════════════════════════════════════════════
--   20261117_01 made their functions and ran the one-time statements; this car hangs them on
--   their tables, alone, so each table is held (SHARE ROW EXCLUSIVE) only from its trigger to the
--   end of this car, in the train and in its rehearsal (e2e/load/train-locks.mjs):
--   1. a critique on a record or a stack gone is told LOG_GONE or STACK_GONE (log_comments,
--      list_comments);
--   2. a certification taken back takes its notice (interactions, dispatch_certifications);
--   3. a deleted stack leaves its cards in the salons marked gone (lists).
--   The same train run applies it right after 20261117_01: what 20261117_01 swept once (the notices
--   of certifications already taken back, the cards of stacks already gone) can be left by a
--   member's act only in the seconds between the two cars, as every one was before. A train that
--   stops between them is run again, and this car is its first.
-- Undo: mobile/supabase/migrations-down/20261117_02_what_goes_takes_its_word_with_it.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- F4's trigger (a deleted stack leaves its cards), on the function 20261117_01 made: it holds stacks
-- (SHARE ROW EXCLUSIVE) only from here to this car's commit.
-- add-only (3): it only fixes: the calls replayed as the members themselves, a stack deleted by its curator and its card in a salon reading as gone, a stack still standing and its card untouched (F4 rehearsal); TestFlight build 41 deletes a stack as before, and draws a card with no title as no card; the website draws a stack's card only when it has a title
CREATE OR REPLACE TRIGGER a_deleted_stack_leaves_its_cards AFTER DELETE
  ON public.lists FOR EACH ROW EXECUTE FUNCTION public.a_deleted_stack_leaves_its_cards();

-- B6's two triggers (a certification taken back takes its notice), on the functions 20261117_01
-- made: each holds its table (SHARE ROW EXCLUSIVE, as CREATE OR REPLACE TRIGGER takes it) only from
-- here to this car's commit.
-- add-only (3): it only fixes: a certification taken back takes its notice, every other write to interactions as before; replayed as the members themselves (B6 rehearsal)
CREATE OR REPLACE TRIGGER a_certification_takes_its_notice
  AFTER DELETE ON public.interactions
  FOR EACH ROW
  WHEN (OLD.type IN ('endorse_log', 'endorse_list'))
  EXECUTE FUNCTION public.a_certification_takes_its_notice();
-- add-only (3): it only fixes: a Dispatch certification taken back takes its notice, every other write to dispatch_certifications as before; replayed as the members themselves (B6 rehearsal)
CREATE OR REPLACE TRIGGER a_certification_takes_its_notice
  AFTER DELETE ON public.dispatch_certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.a_dispatch_certification_takes_its_notice();

-- A4's two triggers (a critique on a page gone is told as such), on the function 20261117_01 made:
-- each holds its critiques (SHARE ROW EXCLUSIVE) only from here to this car's commit.
-- add-only (3): it only fixes: a critique on a record that stands is filed as before, and one on a record gone is refused as LOG_GONE where it was refused as 42501; replayed as the members themselves (A4 rehearsal: critique_has_its_page)
CREATE OR REPLACE TRIGGER a_critique_has_its_page BEFORE INSERT ON public.log_comments
    FOR EACH ROW EXECUTE FUNCTION public.a_critique_has_its_page();
-- add-only (3): it only fixes: a critique on a stack that stands is filed as before, and one on a stack gone is refused as STACK_GONE where it was refused as 42501; replayed as the members themselves (A4 rehearsal: critique_has_its_page)
CREATE OR REPLACE TRIGGER a_critique_has_its_page BEFORE INSERT ON public.list_comments
    FOR EACH ROW EXECUTE FUNCTION public.a_critique_has_its_page();
