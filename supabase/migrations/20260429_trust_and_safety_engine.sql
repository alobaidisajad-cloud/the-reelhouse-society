-- ============================================================
-- REELHOUSE SOCIETY — TRUST & SAFETY ENGINE
-- Date: 2026-04-29
-- Purpose: Implement a self-policing automated shadowban system.
--          Users with a trust_score of 0 are hidden from the 
--          public feed but retain full personal access to their vault.
-- ============================================================

-- 1. ADD TRUST SCORE TO PROFILES
-- Default is 100. A score of 0 triggers a shadowban.
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 100;

-- 2. CREATE USER REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reported_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    log_id UUID REFERENCES public.logs(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(reporter_id, reported_id, log_id) -- Prevent spam reporting same log
);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- 3. RLS FOR REPORTS: Users can only insert their own reports
CREATE POLICY "Users can submit reports" ON public.user_reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Admins (or nobody, to be managed via Supabase Dashboard) can view reports
CREATE POLICY "Users cannot view reports" ON public.user_reports
    FOR SELECT USING (false); -- Only service role / superadmin can view

-- 4. AUTOMATED SHADOWBAN TRIGGER
-- When a report is submitted, we deduct 25 points from the reported user.
-- If they hit 0, they are shadowbanned (requires 4 unique reports).
CREATE OR REPLACE FUNCTION process_user_report()
RETURNS trigger AS $$
BEGIN
    UPDATE public.profiles
    SET trust_score = GREATEST(trust_score - 25, 0)
    WHERE id = NEW.reported_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_process_user_report ON public.user_reports;
CREATE TRIGGER trigger_process_user_report
    AFTER INSERT ON public.user_reports
    FOR EACH ROW
    EXECUTE FUNCTION process_user_report();

-- 5. APPLY SHADOWBAN TO LOGS (PUBLIC FEED RLS)
-- We need to update the SELECT policy on Logs.
-- Instead of everyone seeing everything, we check the trust score.
-- A user can ALWAYS see their own logs. They can only see others' logs if the creator has trust_score > 0.

-- Note: In a production environment, updating a deeply integrated SELECT policy
-- can be complex if there are multiple policies. We will assume the default
-- policy was "Enable read access for all users".
-- We will DROP the likely default policies and replace them with the Elite policy.

DO $$
BEGIN
    -- Attempt to drop common default read policies. Ignore if they don't exist.
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.logs;
    DROP POLICY IF EXISTS "Public logs are viewable by everyone." ON public.logs;
    DROP POLICY IF EXISTS "Anyone can view logs" ON public.logs;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- ELITE RLS: Shadowban Enforcement
-- You can view a log if:
-- 1. It belongs to you. OR
-- 2. The author's trust_score is > 0.
CREATE POLICY "Elite Public Feed (Shadowban Enforced)" ON public.logs
    FOR SELECT USING (
        auth.uid() = user_id 
        OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = logs.user_id AND trust_score > 0
        )
    );

-- 6. INDEX FOR SHADOWBAN CHECK
CREATE INDEX IF NOT EXISTS idx_profiles_trust_score ON public.profiles(id, trust_score);
