-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_22 — a member's handle is found by its beginning, without reading every handle that holds the word.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_22_a_members_handle_is_found_by_its_beginning.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the members' handles by their beginnings ──
--   search_members finds a handle that begins with the words (its second closeness) by the trigram
--   index of the handles, and a trigram index knows a word's start, not the handle's: a handle such as
--   film_1924 holds a word starting with 1924, so "1924" read every member whose handle held it
--   anywhere a word starts. This holds each handle in lower case, in the order of its letters
--   (text_pattern_ops, whatever the house's collation), so a beginning is one range of it, as
--   profiles_display_name_beginning (20261122_17) is for names. search_members reads by it from
--   20261122_23. Built without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_username_beginning ON public.profiles USING btree (lower(username) text_pattern_ops);
