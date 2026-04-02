-- ============================================================
-- THE TRIBUNAL — Content Moderation Tables
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Create the reports table
CREATE TABLE IF NOT EXISTS reports (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    content_type text NOT NULL CHECK (content_type IN ('log', 'list', 'list_comment', 'user')),
    content_id text NOT NULL,
    reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'spoilers', 'offensive', 'other')),
    details text DEFAULT '',
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution text CHECK (resolution IS NULL OR resolution IN ('dismissed', 'content_removed', 'user_warned', 'user_banned')),
    created_at timestamptz DEFAULT now(),
    resolved_at timestamptz
);

-- 2. Add ban columns to profiles (safe — won't error if they already exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text DEFAULT '';

-- 3. Enable RLS on reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Any authenticated user can INSERT a report
CREATE POLICY "Users can create reports" ON reports
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

-- Only the admin can SELECT/UPDATE reports
-- Admin user ID: d1c40ed8-10bc-4a6e-b51a-b6d3559bf755
CREATE POLICY "Admin can view all reports" ON reports
    FOR SELECT TO authenticated
    USING (auth.uid() = 'd1c40ed8-10bc-4a6e-b51a-b6d3559bf755'::uuid);

CREATE POLICY "Admin can update reports" ON reports
    FOR UPDATE TO authenticated
    USING (auth.uid() = 'd1c40ed8-10bc-4a6e-b51a-b6d3559bf755'::uuid);

-- 5. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_content ON reports(content_type, content_id);
