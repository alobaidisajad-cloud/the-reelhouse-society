-- ============================================================
-- REELHOUSE SOCIETY — SCHEMA HARDENING MIGRATION
-- Date: 2026-04-25
-- Purpose: Close all schema gaps identified in god-tier audit.
--   1. Create physical_archive table (missing from numbered migrations)
--   2. Fix interactions type CHECK to allow 'endorse_list'
--   3. Add missing columns to dispatch_dossiers, notifications, logs
--   4. Add unique constraint on logs(user_id, film_id) if missing
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- 1. PHYSICAL ARCHIVE TABLE
-- The mobile app's Vault feature writes to this table.
-- Without it, fresh deployments crash on any vault operation.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.physical_archive (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    film_id INTEGER NOT NULL,
    film_title TEXT NOT NULL DEFAULT 'Unknown',
    poster_path TEXT,
    year INTEGER,
    formats TEXT[] DEFAULT '{}',
    notes TEXT DEFAULT '',
    condition TEXT DEFAULT 'good' CHECK (condition IN ('mint', 'good', 'fair', 'poor')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, film_id)
);

ALTER TABLE public.physical_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own archive"
    ON public.physical_archive FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can manage their own archive"
    ON public.physical_archive FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS physical_archive_user_id_idx
    ON public.physical_archive(user_id);

CREATE INDEX IF NOT EXISTS physical_archive_film_id_idx
    ON public.physical_archive(film_id);


-- ══════════════════════════════════════════════════════════════
-- 2. FIX INTERACTIONS TYPE CHECK CONSTRAINT
-- The client writes 'endorse_list' but the baseline only allows
-- 'follow' and 'endorse_log'. This silently drops list endorsements.
-- ══════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Drop the old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'interactions' AND constraint_name = 'interactions_type_check'
    ) THEN
        ALTER TABLE public.interactions DROP CONSTRAINT interactions_type_check;
    END IF;
    
    -- Add the expanded constraint
    ALTER TABLE public.interactions ADD CONSTRAINT interactions_type_check
        CHECK (type IN ('follow', 'endorse_log', 'endorse_list'));
EXCEPTION
    WHEN duplicate_object THEN NULL; -- Constraint already exists with correct definition
END $$;


-- ══════════════════════════════════════════════════════════════
-- 3. MISSING COLUMNS ON dispatch_dossiers
-- The content store queries views and certify_count but they
-- don't exist in the baseline migration.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.dispatch_dossiers
    ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS certify_count INTEGER DEFAULT 0;


-- ══════════════════════════════════════════════════════════════
-- 4. MISSING COLUMNS ON notifications
-- The social store queries film_id and poster_path but they
-- don't exist in any migration.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS film_id INTEGER,
    ADD COLUMN IF NOT EXISTS poster_path TEXT;


-- ══════════════════════════════════════════════════════════════
-- 5. MISSING COLUMNS ON logs (belt-and-suspenders)
-- Ensure video_url and format exist for the film store writes.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.logs
    ADD COLUMN IF NOT EXISTS video_url TEXT,
    ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'Digital',
    ADD COLUMN IF NOT EXISTS viewing_history JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 1;


-- ══════════════════════════════════════════════════════════════
-- 6. UNIQUE INDEX ON logs(user_id, film_id)
-- Prevents duplicate logs from concurrent devices.
-- Idempotent — IF NOT EXISTS prevents errors if already applied.
-- ══════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS logs_user_film_unique
    ON public.logs (user_id, film_id);


-- ══════════════════════════════════════════════════════════════
-- DONE — All schema gaps identified in the audit are now closed.
-- ══════════════════════════════════════════════════════════════
