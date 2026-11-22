-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_14 — a member is found by one or two letters without reading every member.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_14_a_member_is_found_by_their_short_words.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the members' short words · each one- and two-letter piece of a member's handle and name ──
--   A search of one or two letters has no three-letter piece for the trigram indexes to find, so
--   search_members read the members one by one asking each, the whole table when few held the words.
--   This holds each member under every one- and two-letter piece of their handle and name
--   (private.search_grams, 20261122_12): the members who hold the words are found from it.
--   search_members and the Reel's search by an author's handle read by it from 20261122_15. Built
--   without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_short_grams ON public.profiles USING gin (private.search_grams(username, display_name));
