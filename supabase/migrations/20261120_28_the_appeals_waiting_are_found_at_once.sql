-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_28 — the appeals waiting are found without reading every verdict.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261120_28_the_appeals_waiting_are_found_at_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-B6's index · the appeals waiting are found without reading every verdict (review round 14) ──
--   The Tribunal's APPEALS (get_pending_appeals) reads the appeals not yet heard, oldest first, a page at
--   a time, and its door counts them (tribunal_waiting). Without an index every verdict the house ever
--   gave is read for the few waiting. This one holds the waiting appeals alone, in the list's own order;
--   an appeal heard leaves it. Built without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS mod_actions_appeals_waiting ON public.mod_actions (appeal_filed_at, id) WHERE (appeal_status = 'pending'::text);
