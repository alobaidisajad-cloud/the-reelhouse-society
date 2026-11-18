-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_03 — a film says when it is to be read again.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A film read before TMDB had its details stayed blank for good: three columns let each read say
--      when the next is due (release_date, reread_after, sync_reads), for the claim of 20261119_17 and
--      the index of 20261119_04 (review round 13).
--   Nullable with no default: films is held only for the instant the catalogue changes, no row rewritten.
--   sync-films writes them; it is deployed after this car (before it, its update names columns not there).
-- Undo: mobile/supabase/migrations-down/20261119_03_a_film_says_when_it_is_read_again.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-C5 (locks) · a film read too early is read again: the films' read bookkeeping (review round 13) ──
--   A film is noted the moment a member keeps it (a log, a watchlist, a stack, the Vault), often
--   while it is only announced, and sync-films read it once and never again: read before TMDB had
--   its cast, director or genres, it stayed blank for good, and every member's Taste DNA left it
--   out while the coverage line said the profile was whole. Three columns let a read say when the
--   next is due:
--     release_date  TMDB's release date, as last read (null: TMDB has none, or not read since).
--     reread_after  when the film is to be read again; null: it is settled, or never read.
--     sync_reads    the reads made once the film had settled after its release; null: read only
--                   before the house counted, so one more read decides it.
--   sync-films (reread.js) writes all three at each read; claim_films_to_sync (H-C5.up) claims a
--   film again when its reread_after comes, after every film nobody has read yet.
--   Each is nullable with no default: added to the catalogue's table without rewriting a row, the
--   table held for an instant. Every client reads films with select lists of its own: a new
--   column changes no answer they get.
ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS release_date date,
  ADD COLUMN IF NOT EXISTS reread_after timestamptz,
  ADD COLUMN IF NOT EXISTS sync_reads smallint;

COMMENT ON COLUMN public.films.release_date IS 'TMDB''s release date, as last read. NULL: TMDB gives none, or the film has not been read since the house kept it.';
COMMENT ON COLUMN public.films.reread_after IS 'When sync-films is to read the film again (a read made before it settled after its release, or one missing genres, director or cast). NULL: settled, or never read.';
COMMENT ON COLUMN public.films.sync_reads IS 'How many reads were made once the film had settled after its release (at most 3). NULL: read only before the house counted.';
