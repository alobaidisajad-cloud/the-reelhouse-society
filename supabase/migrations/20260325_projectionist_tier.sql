-- ============================================================
-- THE PROJECTIONIST TIER — SUPABASE TABLES
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Video Reviews Table
CREATE TABLE IF NOT EXISTS video_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    avatar TEXT,
    film_id INTEGER NOT NULL,
    film_title TEXT NOT NULL,
    film_poster TEXT,
    title TEXT NOT NULL,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    tip_total NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tips Table
CREATE TABLE IF NOT EXISTS tips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_username TEXT,
    to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES video_reviews(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_video_reviews_film ON video_reviews(film_id);
CREATE INDEX IF NOT EXISTS idx_video_reviews_user ON video_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_tips_to_user ON tips(to_user_id);
CREATE INDEX IF NOT EXISTS idx_tips_video ON tips(video_id);

-- 4. RLS Policies
ALTER TABLE video_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

-- Video Reviews: Anyone can read, only owner can write/delete
CREATE POLICY "video_reviews_select" ON video_reviews FOR SELECT USING (true);
CREATE POLICY "video_reviews_insert" ON video_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "video_reviews_update" ON video_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "video_reviews_delete" ON video_reviews FOR DELETE USING (auth.uid() = user_id);

-- Tips: Authenticated can insert, users can read their own sent/received
CREATE POLICY "tips_insert" ON tips FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "tips_select_from" ON tips FOR SELECT USING (auth.uid() = from_user_id);
CREATE POLICY "tips_select_to" ON tips FOR SELECT USING (auth.uid() = to_user_id);

-- 5. Add 'projectionist' to profiles tier column (if using enum, alter the check)
-- If the tier is stored as TEXT, no migration needed.
-- If using a CHECK constraint, run:
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_tier_check CHECK (tier IN ('free', 'cinephile', 'archivist', 'auteur', 'projectionist'));
