-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_16 — the corridor's newest salons are read from the front of an index, never every salon.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_16_the_newest_salons_are_read_first.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the newest salons · every salon, newest first ──
--   The corridor (get_lounge_list) shows the fifty newest salons. With no index on when a salon was made,
--   every salon of the house was read and sorted for them at each open of the corridor (1,500 at 100,000
--   members, 7,500 at 500,000: the load lab refused it, 20261122_12's kinds pass, kind 13). This holds
--   them newest first: the fifty are read from its front, as many as the rule lets through, at any size.
--   Built without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS lounges_newest ON public.lounges (created_at DESC, id DESC);
