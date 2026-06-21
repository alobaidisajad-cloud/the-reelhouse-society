-- ============================================================
-- FOUNDING MEMBERS TRACKING
-- Date: 2026-05-26
-- Purpose: Track founding members separately from role.
--   Since founding purchases map to role='auteur' in the DB,
--   we need a dedicated boolean to count founding seats filled.
-- ============================================================

-- 1. Add is_founding boolean (default false, non-destructive)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founding BOOLEAN DEFAULT FALSE;

-- 2. Partial index — only indexes rows WHERE is_founding = TRUE.
--    At most 100 rows will ever be indexed, making COUNT queries sub-millisecond.
CREATE INDEX IF NOT EXISTS idx_profiles_is_founding
  ON public.profiles (is_founding) WHERE is_founding = TRUE;
