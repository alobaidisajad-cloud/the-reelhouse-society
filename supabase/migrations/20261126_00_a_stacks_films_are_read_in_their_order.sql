-- ════════════════════════════════════════════════════════════════════════════
-- 20261126_00 — a stack's films are read in their order.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261126_00_a_stacks_films_are_read_in_their_order.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── a stack's films, in the order its page draws them ──
--   A stack's page reads its films in its order (rank_position, then when added, then the film): its
--   first page and the order of its first 1,000 films in one read, and past those, each page after the
--   last film read, as it was read. The only index the stack's films had was (list_id, film_id), so
--   each read gathered every film of the stack and sorted them. This holds them in that order, so each
--   read takes its rows from the index's place for the stack and stops at its limit, however long the
--   stack. Built without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS list_items_in_order ON public.list_items USING btree (list_id, rank_position, created_at, film_id);
