-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_10 — a card in a salon is written by the house: round 14's trigger on the salons' messages.
-- ════════════════════════════════════════════════════════════════════════════
--   1. Each salon message's card is written from the piece it names before it is kept, on the functions
--      of 20261120_09; it fires after a_sealed_stack_is_not_shared, so a sealed stack is told as sealed
--      (review round 14).
--   Alone, so lounge_messages is held (SHARE ROW EXCLUSIVE) only from its trigger to the end of this
--   car. The cards written before it are made true by the next car, 20261120_11.
-- Undo: mobile/supabase/migrations-down/20261120_10_a_card_is_written_by_the_house.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A4.locks · a card in a salon says what the house holds: its trigger (review round 14) ──
--   H-A4's rule, hung before each salon message is written. Alone, so the salons' messages are held
--   (SHARE ROW EXCLUSIVE) only from here to the end of this car. It fires after
--   a_sealed_stack_is_not_shared (by name), so a sealed stack is still told as sealed.
-- add-only (3): it only fixes: a card's headline, byline and count are written from the piece it names, a card of a piece gone or unreadable is refused, a kind no app sends is refused, every message the apps send written as before; replayed as the members themselves (H-A4 rehearsal)
CREATE OR REPLACE TRIGGER a_shared_card_is_the_houses
  BEFORE INSERT ON public.lounge_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.a_shared_card_is_the_houses();
