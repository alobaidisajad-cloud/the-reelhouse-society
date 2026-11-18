-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_22 — a filing's SPOILERS mark reaches its cards: round 13's trigger on the filings.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A filing marked or unmarked SPOILERS has its cards titled by the share's rule, on the functions of
--      20261119_16 (review round 13).
--   Alone, so the filings are held (SHARE ROW EXCLUSIVE) only from the trigger to the end of this car.
-- Undo: mobile/supabase/migrations-down/20261119_22_a_spoilers_mark_reaches_its_cards.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- B9's trigger (a take marked SPOILERS keeps its words off its cards), on the function B9.up made: it
-- holds the filings (SHARE ROW EXCLUSIVE) only from here to this car's commit.
-- add-only (3): it only fixes: a filing marked or unmarked as a spoiler has its cards in the salons titled by the share's rule, every other write to dispatch_posts as before; replayed as the members themselves (B9 rehearsal)
CREATE OR REPLACE TRIGGER a_spoiler_take_veils_its_cards
  AFTER UPDATE OF spoiler_label ON public.dispatch_posts
  FOR EACH ROW
  WHEN (OLD.spoiler_label IS DISTINCT FROM NEW.spoiler_label AND NEW.ended_at IS NULL)
  EXECUTE FUNCTION public.a_spoiler_take_veils_its_cards();
