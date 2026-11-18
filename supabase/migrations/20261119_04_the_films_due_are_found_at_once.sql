-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_04 — the films due to be read again are found without reading the catalogue.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261119_04_the_films_due_are_found_at_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-C5 (index) · the films read too early, found without reading the catalogue (review round 13) ──
--   claim_films_to_sync (H-C5) takes, after the films never read, the ones whose time to be read
--   again has come. This index holds only those (a reread_after set, or read before the house
--   counted and possibly too early), in the order they fall due, so each claim reads the few it
--   takes and never the whole catalogue. Each film leaves it as sync-films reads it. Built
--   CONCURRENTLY, so members keep films while it builds: applied alone, outside any transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_films_reread ON public.films USING btree (COALESCE(reread_after, synced_at), id)
  WHERE (reread_after IS NOT NULL
         OR (synced_at IS NOT NULL AND sync_reads IS NULL
             AND (cardinality(genres) = 0 OR director_id IS NULL OR cardinality(cast_ids) = 0
                  OR year IS NULL OR year >= 2026)))
    AND sync_failed < 3;
