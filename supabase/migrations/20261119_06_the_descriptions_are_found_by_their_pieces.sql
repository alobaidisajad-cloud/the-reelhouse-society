-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_06 — a public stack's description is found by its pieces.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261119_06_the_descriptions_are_found_by_their_pieces.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-D4's index · a public stack's description is found by its pieces (review round 13) ──
--   search_stacks (H-D4) finds a stack whose title or description holds the words. The titles were
--   read by lists_title_trigram; the descriptions had no index, so the OR of the two could be read by
--   none and every public stack was read for a rare word. This is the descriptions' twin of
--   lists_title_trigram, over the same public stacks: with both, the words are counted and found by
--   their trigram pieces. Built without holding the table (CONCURRENTLY), alone in its file; its cost
--   is some one to three times the descriptions' text (the load house's 20,000 stacks: measured below
--   the H-D4 rehearsal's probe), and every stack written writes it, as the titles' index does now.
CREATE INDEX CONCURRENTLY IF NOT EXISTS lists_description_trigram ON public.lists USING gin (description extensions.gin_trgm_ops) WHERE (is_private = false);
