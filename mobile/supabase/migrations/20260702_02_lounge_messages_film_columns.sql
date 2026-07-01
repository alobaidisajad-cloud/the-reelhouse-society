-- ═══════════════════════════════════════════════════════════════════════════════
-- LOUNGE — add the missing film-share columns to lounge_messages
-- ═══════════════════════════════════════════════════════════════════════════════
-- Frontend↔backend drift (found by the schema audit): the app SELECTs and INSERTs
-- film_id / film_title / film_poster as top-level columns on lounge_messages (see
-- src/stores/lounge.ts — they sit in `explicitMetaKeys` alongside the reply_to_*
-- columns, which DO exist). But these three were never added to the table, so:
--   • the message SELECT 400s on the unknown columns (Lounge chat stays broken even
--     after the FK fix in 20260701_02), and
--   • sending a message that shares a film would fail on the INSERT.
--
-- Fix: add the three columns to match the app's contract. Additive, non-destructive.
-- Types mirror the app: film_id is a TMDB integer id; title/poster are text.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.lounge_messages
  ADD COLUMN IF NOT EXISTS film_id     integer,
  ADD COLUMN IF NOT EXISTS film_title  text,
  ADD COLUMN IF NOT EXISTS film_poster text;

-- Reload the PostgREST schema cache so the new columns resolve immediately.
NOTIFY pgrst, 'reload schema';
