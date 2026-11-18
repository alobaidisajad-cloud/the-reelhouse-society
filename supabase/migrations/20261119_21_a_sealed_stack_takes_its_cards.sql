-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_21 — a sealed stack takes its cards: round 13's triggers on the salons' messages and the stacks.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A stack's card is refused while the stack is sealed (lounge_messages), and sealing or opening a
--      stack turns its cards (lists), on the functions of 20261119_15 (review round 13).
--   Alone, so each table is held (SHARE ROW EXCLUSIVE) only from its trigger to the end of this car. A
--   stack sealed in the seconds between 20261119_15 and this car keeps its cards until it is sealed again.
-- Undo: mobile/supabase/migrations-down/20261119_21_a_sealed_stack_takes_its_cards.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- B3's triggers (a sealed stack is never shown in a salon), on the functions B3.up made: they hold the
-- salons' messages and the stacks (SHARE ROW EXCLUSIVE) only from here to this car's commit.
-- add-only (3): it only fixes: a stack's card is refused while the stack is sealed (or gone), every other message written as before; replayed as the members themselves (B3 rehearsal)
CREATE OR REPLACE TRIGGER a_sealed_stack_is_not_shared
  BEFORE INSERT ON public.lounge_messages
  FOR EACH ROW
  WHEN (NEW.type = 'list_share')
  EXECUTE FUNCTION public.a_sealed_stack_is_not_shared();

-- add-only (3): it only fixes: sealing a stack turns its cards sealed and opening it puts them back, every other write to lists as before; replayed as the members themselves (B3 rehearsal)
CREATE OR REPLACE TRIGGER a_sealed_stack_takes_its_cards
  AFTER UPDATE OF is_private ON public.lists
  FOR EACH ROW
  WHEN (OLD.is_private IS DISTINCT FROM NEW.is_private)
  EXECUTE FUNCTION public.a_sealed_stack_takes_its_cards();
