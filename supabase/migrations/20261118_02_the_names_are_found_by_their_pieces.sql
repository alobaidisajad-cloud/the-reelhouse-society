-- ════════════════════════════════════════════════════════════════════════════
-- 20261118_02 — the members' names, found by their pieces.
-- ════════════════════════════════════════════════════════════════════════════
--   search_members (20261118_01) finds the handles through profiles_username_trigram and the
--   names through this index, so a search of three letters or more never reads every profile.
--   Its cost, estimated: a trigram GIN index runs from the size of the text it holds to some three
--   times it (a name of a dozen letters is a dozen trigrams, each a compressed posting), so under
--   100 KB today and some 10-30 MB at 500,000 members; every rename writes it as the handles'
--   index is written now. Its true size is read after the train with
--   pg_relation_size('public.profiles_display_name_trigram').
--   Built CONCURRENTLY, so members write their profiles on while it builds: it is applied alone,
--   outside any transaction, and the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261118_02_the_names_are_found_by_their_pieces.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_display_name_trigram ON public.profiles USING gin (display_name extensions.gin_trgm_ops);
