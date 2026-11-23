-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_65 — the stacks open to all are read newest first.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_65_the_stacks_open_to_all_are_read_newest_first.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the stacks open to all, newest first ──
--   lobby_choose_edition reaches the newest stacks open to all, each with four films or more, so a quiet
--   day still hangs one: it counted the films of every stack of the house to find them. A stack is open
--   to all unless it is marked private (one marked neither way is open, as the stacks' read rule has it),
--   which the index of the stacks marked open (is_private = false) does not hold whole. This holds every
--   stack open to all, newest first, so the newest are walked from the top until 24 qualify. Built
--   without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS lists_open_newest ON public.lists USING btree (created_at DESC, id DESC)
  WHERE is_private IS NOT TRUE;
