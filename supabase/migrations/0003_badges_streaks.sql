-- ══════════════════════════════════════════════════════════════
-- ReelHouse — Badges & Streaks Migration
-- Adds persistent achievement tracking and streak counters
-- Version: 0003
-- ══════════════════════════════════════════════════════════════

-- Badges — JSONB array of earned badge keys
DO $$ BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Streaks — consecutive days of logging
DO $$ BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_log_date DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Index for streak lookups
CREATE INDEX IF NOT EXISTS profiles_last_log_date_idx ON public.profiles(last_log_date);
