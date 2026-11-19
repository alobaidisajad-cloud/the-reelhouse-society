-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_05 — whom a member follows is read newest first, a page at a time.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261120_05_whom_a_member_follows_is_read_newest_first.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-A2's index · whom a member follows is read newest first, a page at a time (review round 14) ──
--   A member's following list (the FOLLOWING sheet) asks for their follows newest first, fifty at a
--   time. Its followers' twin has an index in that order (interactions_followers_newest), so the
--   follows rule is asked of the page's rows alone; the following list had none, so every follow
--   the member ever made was read, asked the follows rule and sorted, for each page: 41 ms for the
--   load house's member of 2,025 follows, twice that with H-A2's block asked of each row. With this
--   index the page is read in its order and the rule asked of its rows alone, as the followers'
--   are. Built without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS interactions_following_newest ON public.interactions (user_id, created_at DESC, target_user_id DESC) WHERE (type = 'follow'::text);
