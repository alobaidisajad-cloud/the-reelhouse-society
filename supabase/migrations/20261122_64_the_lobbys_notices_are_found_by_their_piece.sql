-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_64 — the Lobby's notices are found by their piece.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_64_the_lobbys_notices_are_found_by_their_piece.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the Lobby's own notices, by their piece ──
--   lobby_choose_edition tells the authors of what hangs once a piece, never again, so each day it asks
--   whether a piece's notice was told before: found among every notice of the house, read whole (2.5
--   million at 100,000 members, for each piece). This holds only the Lobby's notices (a few a day), by
--   their piece's key, so the question is one lookup. Built without holding the table (CONCURRENTLY),
--   alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_lobby_told ON public.notifications USING btree (group_key)
  WHERE type = 'featured';
