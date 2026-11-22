-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_17 — a member's name is found by its beginning, without reading every name that holds the word.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_17_a_members_name_is_found_by_its_beginning.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the members' names by their beginnings ──
--   search_members finds a name that begins with the words (its third closeness) by the trigram index of
--   the names, and a trigram index knows a word's start, not the name's: a search of one letter, "1",
--   read every member whose name held a word starting with 1 (13,116 of 100,000 in the load house) and
--   threw all but a few away. This holds each name in lower case, in the order of its letters
--   (text_pattern_ops, whatever the house's collation), so a beginning is one range of it.
--   search_members reads by it from 20261122_18. Built without holding the table (CONCURRENTLY), alone in
--   its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_display_name_beginning ON public.profiles USING btree (lower(display_name) text_pattern_ops);
