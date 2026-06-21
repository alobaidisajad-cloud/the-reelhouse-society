-- ============================================================
-- REELHOUSE SOCIETY — ELITE HYPERSCALE INDEXING
-- Date: 2026-04-29
-- Purpose: Implement Index-Only Scans (Covering Indexes) to 
--          serve the Social Pulse feed entirely from RAM at 200k+ scale.
-- ============================================================

-- 1. SOCIAL PULSE COVERING INDEX
-- The Social Pulse queries `logs` ordered by `created_at DESC`, fetching 
-- the user's rating, review, and the film context.
-- By including the payload columns directly in the index, Postgres can
-- bypass the heap entirely.

CREATE INDEX IF NOT EXISTS idx_logs_social_pulse_covering 
    ON public.logs (created_at DESC, user_id)
    INCLUDE (film_id, rating, review, id);

-- 2. PROFILE JOIN OPTIMIZATION
-- The feed always joins the `profiles` table to get the username/avatar.
-- We ensure a highly optimized index exists for this exact lookup.

CREATE INDEX IF NOT EXISTS idx_profiles_feed_join
    ON public.profiles (id)
    INCLUDE (username, avatar_url, tier);

-- 3. INTERACTION (ENDORSEMENTS) COVERING INDEX
-- When checking if a user has endorsed a log, we shouldn't scan the table.
-- We cover the `target_id` and `user_id` with the `type`.

CREATE INDEX IF NOT EXISTS idx_interactions_covering
    ON public.interactions (target_log_id, user_id)
    INCLUDE (type);

-- ============================================================
-- VERIFICATION NOTE:
-- Run `EXPLAIN ANALYZE` on a feed query after applying this.
-- You should see "Index Only Scan" instead of "Index Scan" or "Seq Scan".
-- ============================================================
