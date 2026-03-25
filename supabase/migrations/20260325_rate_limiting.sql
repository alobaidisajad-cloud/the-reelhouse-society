-- ============================================================
-- REELHOUSE — RLS RATE LIMITING
-- Prevents abuse by capping write operations per user per day.
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ────────────────────────────────────────────────
-- 1. Rate Limiter Helper Function
--    Counts how many rows a user inserted into
--    a given table within the last N minutes.
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rate_limit_check(
    table_name TEXT,
    user_col TEXT,
    max_count INTEGER,
    window_minutes INTEGER DEFAULT 1440  -- 24 hours
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_count INTEGER;
BEGIN
    EXECUTE format(
        'SELECT COUNT(*) FROM %I WHERE %I = auth.uid() AND created_at > now() - interval ''%s minutes''',
        table_name, user_col, window_minutes
    ) INTO current_count;
    RETURN current_count < max_count;
END;
$$;

-- ────────────────────────────────────────────────
-- 2. LOGS — Max 200 film logs per day per user
--    (Even the most obsessive cinephile won't log
--     200 films in 24 hours legitimately)
-- ────────────────────────────────────────────────
-- Drop existing insert policy if it exists, then recreate with rate limit
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'logs_insert_rate_limit' AND tablename = 'logs') THEN
        DROP POLICY "logs_insert_rate_limit" ON logs;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'logs') THEN
        EXECUTE 'CREATE POLICY "logs_insert_rate_limit" ON logs FOR INSERT WITH CHECK (auth.uid() = user_id AND rate_limit_check(''logs'', ''user_id'', 200, 1440))';
    END IF;
END $$;

-- ────────────────────────────────────────────────
-- 3. TIPS — Max 50 tips per day per user
--    (Prevents tipping bot abuse)
-- ────────────────────────────────────────────────
DO $$
BEGIN
    -- Drop old unlimited insert policy
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tips_insert' AND tablename = 'tips') THEN
        DROP POLICY "tips_insert" ON tips;
    END IF;
END $$;

CREATE POLICY "tips_insert_rate_limit" ON tips
    FOR INSERT WITH CHECK (
        auth.uid() = from_user_id
        AND rate_limit_check('tips', 'from_user_id', 50, 1440)
    );

-- ────────────────────────────────────────────────
-- 4. VIDEO_REVIEWS — Max 10 uploads per day
--    (A real creator posts maybe 1-2 per day)
-- ────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'video_reviews_insert' AND tablename = 'video_reviews') THEN
        DROP POLICY "video_reviews_insert" ON video_reviews;
    END IF;
END $$;

CREATE POLICY "video_reviews_insert_rate_limit" ON video_reviews
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND rate_limit_check('video_reviews', 'user_id', 10, 1440)
    );

-- ────────────────────────────────────────────────
-- 5. WATCHLISTS — Max 500 additions per day
-- ────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'watchlists') THEN
        IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'watchlists_insert_rate_limit' AND tablename = 'watchlists') THEN
            DROP POLICY "watchlists_insert_rate_limit" ON watchlists;
        END IF;
        EXECUTE 'CREATE POLICY "watchlists_insert_rate_limit" ON watchlists FOR INSERT WITH CHECK (auth.uid() = user_id AND rate_limit_check(''watchlists'', ''user_id'', 500, 1440))';
    END IF;
END $$;

-- ────────────────────────────────────────────────
-- 6. INTERACTIONS — Max 300 per day (follows, endorsements)
-- ────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'interactions') THEN
        IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'interactions_insert_rate_limit' AND tablename = 'interactions') THEN
            DROP POLICY "interactions_insert_rate_limit" ON interactions;
        END IF;
        EXECUTE 'CREATE POLICY "interactions_insert_rate_limit" ON interactions FOR INSERT WITH CHECK (auth.uid() = user_id AND rate_limit_check(''interactions'', ''user_id'', 300, 1440))';
    END IF;
END $$;

-- ────────────────────────────────────────────────
-- 7. WAITLIST — Max 5 signups per day (prevents email spam)
-- ────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'waitlist') THEN
        IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'waitlist_insert_rate_limit' AND tablename = 'waitlist') THEN
            DROP POLICY "waitlist_insert_rate_limit" ON waitlist;
        END IF;
        EXECUTE 'CREATE POLICY "waitlist_insert_rate_limit" ON waitlist FOR INSERT WITH CHECK (rate_limit_check(''waitlist'', ''email'', 5, 1440))';
    END IF;
END $$;
