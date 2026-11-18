-- ════════════════════════════════════════════════════════════════════════════
-- 20261118_04 — the records are found by their words.
-- ════════════════════════════════════════════════════════════════════════════
--   search_logs (20261118_01) walks the newest 5,000 reviewed records for a word many hold; a word
--   rarer than that is read through this index: the trigram pieces of each reviewed record's film
--   title and review, so a rare word is found among every record in milliseconds, never by reading
--   them all (20-30 s at 100,000 members, P0.6's load house, against a 30 s limit). Only reviewed
--   records are held: a record with no review is never a search result.
--   Its cost, estimated: a trigram GIN index runs from the size of the text it holds to some three
--   times it, so at 100,000 members' some 1.2 million reviews (a review of 150 letters) some 0.2-0.5
--   GB; the load house's reviews, one sentence repeated, make 70 MB in 35 s. Every review written or
--   changed writes it, as the stacks' titles write lists_title_trigram now. Its true size is read
--   after the train with pg_relation_size('public.logs_reviewed_words').
--   Built CONCURRENTLY, so members write their records on while it builds: it is applied alone,
--   outside any transaction, and the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261118_04_the_records_are_found_by_their_words.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS logs_reviewed_words ON public.logs USING gin (film_title extensions.gin_trgm_ops, review extensions.gin_trgm_ops) WHERE ((review IS NOT NULL) AND (review <> ''::text));
