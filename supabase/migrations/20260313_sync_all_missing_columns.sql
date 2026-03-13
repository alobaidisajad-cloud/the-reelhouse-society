-- ============================================================
-- REELHOUSE SOCIETY — MASTER SYNC MIGRATION
-- Date: 2026-03-13
-- Purpose: Sync live DB to match supabase-schema.sql v2.0
-- Run this in Supabase SQL Editor if starting fresh or re-syncing
-- ============================================================

-- ── PROFILES ─────────────────────────────────────────────────
-- Live DB has: id, username, full_name, avatar_url, bio, website,
--              is_private, following(uuid[]), followers(uuid[]), created_at, updated_at
-- Schema needs: role, tier, persona, favorite_films, is_social_private,
--               followers_count, following_count, total_logs
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'cinephile'
    CHECK (role IN ('cinephile', 'archivist', 'auteur', 'venue_owner', 'admin')),
  ADD COLUMN IF NOT EXISTS tier text DEFAULT 'free'
    CHECK (tier IN ('free', 'archivist', 'auteur')),
  ADD COLUMN IF NOT EXISTS persona text DEFAULT 'The Cinephile',
  ADD COLUMN IF NOT EXISTS favorite_films jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_social_private boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_logs integer DEFAULT 0;

-- ── LOGS ─────────────────────────────────────────────────────
-- Live DB missing all editorial columns
ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS private_notes text,
  ADD COLUMN IF NOT EXISTS abandoned_reason text,
  ADD COLUMN IF NOT EXISTS physical_media text,
  ADD COLUMN IF NOT EXISTS is_autopsied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS autopsy jsonb,
  ADD COLUMN IF NOT EXISTS alt_poster text,
  ADD COLUMN IF NOT EXISTS editorial_header text,
  ADD COLUMN IF NOT EXISTS drop_cap boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pull_quote text DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── INTERACTIONS ─────────────────────────────────────────────
-- Missing target_list_id FK
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS target_list_id uuid REFERENCES public.lists(id) ON DELETE CASCADE;

-- ── LIST_ITEMS ───────────────────────────────────────────────
-- Missing poster_path
ALTER TABLE public.list_items
  ADD COLUMN IF NOT EXISTS poster_path text;

-- ── NOTIFICATIONS ────────────────────────────────────────────
-- Live has `read` instead of `is_read`, missing from_user_id & related_log_id
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS from_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_log_id uuid REFERENCES public.logs(id) ON DELETE SET NULL;

-- ── VENUES ───────────────────────────────────────────────────
-- All columns added in previous migration — confirming they exist
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS platform_fee_percent integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- ── WATCHLISTS ───────────────────────────────────────────────
-- Confirm year, poster_path exist (added by earlier work)
ALTER TABLE public.watchlists
  ADD COLUMN IF NOT EXISTS poster_path text,
  ADD COLUMN IF NOT EXISTS year integer;

-- ── PROGRAMMES ───────────────────────────────────────────────
-- Ensure table exists (may have been created mid-session)
CREATE TABLE IF NOT EXISTS public.programmes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  films jsonb DEFAULT '[]'::jsonb,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Programmes viewable by everyone or owner."
  ON programmes FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can manage their programmes."
  ON programmes FOR ALL USING (auth.uid() = user_id);

-- ── LOG_COMMENTS ─────────────────────────────────────────────
-- Ensure table exists with correct structure
CREATE TABLE IF NOT EXISTS public.log_comments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  log_id uuid REFERENCES public.logs(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.log_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Log comments viewable by everyone."
  ON log_comments FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Users can manage their comments."
  ON log_comments FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS log_comments_log_id_idx ON public.log_comments(log_id);
CREATE INDEX IF NOT EXISTS log_comments_user_id_idx ON public.log_comments(user_id);

-- ── INDEXES (ensure all performance indexes exist) ────────────
CREATE INDEX IF NOT EXISTS logs_user_id_idx ON public.logs(user_id);
CREATE INDEX IF NOT EXISTS logs_created_at_idx ON public.logs(created_at DESC);
CREATE INDEX IF NOT EXISTS logs_film_id_idx ON public.logs(film_id);
CREATE INDEX IF NOT EXISTS interactions_user_id_idx ON public.interactions(user_id);
CREATE INDEX IF NOT EXISTS interactions_target_log_id_idx ON public.interactions(target_log_id);
CREATE INDEX IF NOT EXISTS interactions_target_user_id_idx ON public.interactions(target_user_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON public.notifications(is_read);

-- ── AUTH TRIGGER (idempotent) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  _username text;
  _role text;
BEGIN
  _username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  );
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'cinephile');

  INSERT INTO public.profiles (id, username, role)
  VALUES (NEW.id, _username, _role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── UPDATED_AT TRIGGERS ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_logs ON public.logs;
CREATE TRIGGER set_updated_at_logs
  BEFORE UPDATE ON public.logs FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_lists ON public.lists;
CREATE TRIGGER set_updated_at_lists
  BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── DONE ──────────────────────────────────────────────────────
-- Run SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public'
-- to verify ~180+ columns are now present.
