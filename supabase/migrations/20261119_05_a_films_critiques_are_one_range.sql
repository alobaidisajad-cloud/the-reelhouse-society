-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_05 — a film's critiques are read as a range of their own.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261119_05_a_films_critiques_are_one_range.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-DX's index · a film's critiques are read as a range of their own (review round 13) ──
--   A film's page reads its newest ten written critiques, and its Log Archive twenty at a time:
--   film_id, a review written, newest first (created_at, then id). There was no index of a film's
--   reviewed records in that order. For a film the planner thinks is popular, the read walked the
--   house-wide logs_reviewed_newest, every reviewed record of every film newest first, until ten were
--   this film's: for a popular film whose critiques are sparse among the house's recent ones, that walk
--   read some 550,000 index entries (90-220 ms; 6.9 s when the row rule ran before the film was
--   tested), and for any film the cold read of the walk took 128 ms. With this index every film's page
--   is one range of 10 or 20 entries, whatever the film and however its critiques are spread. Only
--   reviewed records are held (some 1.2 million of the load house's 4 million logs). Built without
--   holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS logs_film_reviewed_newest ON public.logs USING btree (film_id, created_at DESC, id DESC) WHERE ((review IS NOT NULL) AND (review <> ''::text));
