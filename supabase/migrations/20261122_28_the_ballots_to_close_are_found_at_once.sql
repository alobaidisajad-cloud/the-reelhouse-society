-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_28 — the ballots waiting to be closed are found at once.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_28_the_ballots_to_close_are_found_at_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the open ballots, by when they close ──
--   freeze_closed_ballots, every five minutes, finds the ballots that have closed and hold no frozen
--   totals yet by the index of every filing's kind, so it read every ballot the house has ever held,
--   closed and frozen long ago, each time. This holds only the ballots not yet frozen nor ended, by
--   when they close, so the schedule reads just those whose time has come. Built without holding the
--   table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS dispatch_posts_ballots_to_close ON public.dispatch_posts USING btree (closes_at)
  WHERE kind = 'ballot' AND frozen_totals IS NULL AND ended_at IS NULL;
