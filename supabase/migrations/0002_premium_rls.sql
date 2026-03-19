-- ══════════════════════════════════════════════════════════════
-- ReelHouse Premium Features RLS Migration
-- Adds tier-based gatekeeping for premium features
-- Version: 0002 — Premium RLS
-- ══════════════════════════════════════════════════════════════

-- ── Add tier column if missing ──
DO $$ BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'cinephile', 'archivist', 'auteur'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Add followers_count/following_count for social features ──
DO $$ BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Add display_name, social_visibility for Settings page ──
DO $$ BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS social_visibility TEXT DEFAULT 'public' CHECK (social_visibility IN ('public', 'members', 'private'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Add is_read column alias if notifications uses 'read' ──
DO $$ BEGIN
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Add new notification types ──
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('follow', 'endorse', 'comment', 'system', 'annotate', 'retransmit', 'achievement'));

-- ══════════════════════════════════════════════════════════════
-- PREMIUM FEATURE GATING — RLS policies for tier-restricted features
-- ══════════════════════════════════════════════════════════════

-- Vaults (physical media) — Archivist tier only
DROP POLICY IF EXISTS "Vaults viewable by owner" ON public.vaults;
CREATE POLICY "Vaults viewable by premium owner" ON public.vaults
    FOR SELECT USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND tier IN ('archivist', 'auteur')
        )
    );

-- Programmes — Archivist/Auteur tier only creation
DROP POLICY IF EXISTS "Users can manage their own programmes" ON public.programmes;
CREATE POLICY "Premium users can manage programmes" ON public.programmes
    FOR ALL USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND tier IN ('archivist', 'auteur')
        )
    );

-- Dispatch Dossiers — Auteur tier only
DROP POLICY IF EXISTS "Users can manage their own dossiers" ON public.dispatch_dossiers;
CREATE POLICY "Auteur users can manage dossiers" ON public.dispatch_dossiers
    FOR ALL USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND tier = 'auteur'
        )
    );

-- ══════════════════════════════════════════════════════════════
-- INDEXES for performance
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS profiles_tier_idx ON public.profiles(tier);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);
