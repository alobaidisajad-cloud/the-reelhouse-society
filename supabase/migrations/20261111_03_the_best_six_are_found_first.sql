-- ════════════════════════════════════════════════════════════════════════════
-- 20261111_03 — a member's six highest rated, found first.
-- ════════════════════════════════════════════════════════════════════════════
--   HIGHEST RATED on a member's file (ProfileDataService.fetchHighestRated:
--   rating >= 4, by rating, then the newest watched, then id, six) read every
--   log of the member and asked the row rules of each, to keep six. This index
--   holds the ratings of 4 and up alone (a fraction of the table), in that order:
--   the six are its first six. Measured at 500,000 members (load 42969529684,
--   then 43019778229 with it): a record of 10,000, 85.4 ms -> under 0.1 ms.
--   Built CONCURRENTLY, so members write on while it builds: it is applied
--   alone, outside any transaction, and the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261111_03_the_best_six_are_found_first.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_user_highest_rated ON public.logs USING btree (user_id, rating DESC, watched_date DESC NULLS LAST, id DESC) WHERE rating >= 4;
