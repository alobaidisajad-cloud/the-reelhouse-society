-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_13 — a stack is found by one or two letters without reading every stack.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_13_a_stack_is_found_by_its_short_words.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the stacks' short words · each one- and two-letter piece of an open stack's title and description ──
--   A search of one or two letters ("m1") has no three-letter piece for the trigram indexes to find, so
--   it walked every open stack of the house asking each, the whole table when none held the words (the
--   load house, 20,000 stacks at 100,000 members). This holds each open stack under every one- and two-
--   letter piece of its title and description (private.search_grams, 20261122_12): the stacks that hold
--   the words are found from it, as many as hold them. search_stacks and the Reel's stack search read by
--   it from 20261122_15. Built without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS lists_short_grams ON public.lists USING gin (private.search_grams(title, description)) WHERE (is_private = false);
