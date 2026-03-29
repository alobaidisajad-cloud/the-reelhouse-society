-- ============================================================
-- REELHOUSE SOCIETY — AUTH PERSISTENCE & LOBBY FEEDS v2
-- 2026-03-29
--
-- Adds:
--   1. display_name column to profiles (for showing real names)
--   2. preferences JSONB column to profiles (user settings store)
--   3. log_comments table (for FeaturedReview engagement scoring)
--   4. Performance indexes on logs for Lobby community feeds
--   5. Secure display_name + preferences update RPC
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. PROFILES: display_name & preferences
-- ──────────────────────────────────────────────────────────────

-- Add display_name (optional public name, separate from username)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add preferences JSONB for per-user settings (theme overrides, etc.)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::JSONB;

-- Update the handle_new_user trigger to include new columns
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, email, preferences)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    -- Only allow 'venue_owner' from metadata; everything else defaults to cinephile
    CASE
      WHEN NEW.raw_user_meta_data->>'role' = 'venue_owner' THEN 'venue_owner'
      ELSE 'cinephile'
    END,
    NEW.email,
    '{}'::JSONB
  )
  ON CONFLICT (id) DO UPDATE
    SET email       = EXCLUDED.email,
        updated_at  = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ──────────────────────────────────────────────────────────────
-- 2. LOG COMMENTS TABLE (used by FeaturedReview engagement score)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.log_comments (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  log_id     UUID REFERENCES public.logs(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content    TEXT NOT NULL CHECK (char_length(content) <= 2000),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.log_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments (public critique space)
DROP POLICY IF EXISTS "Log comments viewable by everyone." ON log_comments;
CREATE POLICY "Log comments viewable by everyone."
  ON log_comments FOR SELECT USING (true);

-- Authenticated users can post comments
DROP POLICY IF EXISTS "Users can insert log comments." ON log_comments;
CREATE POLICY "Users can insert log comments."
  ON log_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Authors can update/delete their own comments
DROP POLICY IF EXISTS "Users can manage their log comments." ON log_comments;
CREATE POLICY "Users can manage their log comments."
  ON log_comments FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS log_comments_log_id_idx    ON public.log_comments(log_id);
CREATE INDEX IF NOT EXISTS log_comments_user_id_idx   ON public.log_comments(user_id);
CREATE INDEX IF NOT EXISTS log_comments_created_at_idx ON public.log_comments(created_at DESC);

-- Add log_comments to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.log_comments;


-- ──────────────────────────────────────────────────────────────
-- 3. LOBBY FEED PERFORMANCE INDEXES
-- ──────────────────────────────────────────────────────────────

-- SocialPulse: ORDER BY created_at DESC, filter on rating/review
CREATE INDEX IF NOT EXISTS logs_pulse_idx
  ON public.logs(created_at DESC)
  WHERE rating > 0 OR review IS NOT NULL AND review != '';

-- FeaturedReview: recent reviewed logs (24h window)
CREATE INDEX IF NOT EXISTS logs_featured_idx
  ON public.logs(created_at DESC)
  WHERE review IS NOT NULL AND review != '' AND rating > 0;

-- Interactions: count endorsements by target_log_id
CREATE INDEX IF NOT EXISTS interactions_endorse_log_idx
  ON public.interactions(target_log_id, type)
  WHERE type = 'endorse_log';


-- ──────────────────────────────────────────────────────────────
-- 4. SECURE PROFILE UPDATE RPC (preferences + display_name)
-- ──────────────────────────────────────────────────────────────
-- Allows client to safely merge preferences without exposing
-- the entire profiles row for update. SECURITY DEFINER ensures
-- the function runs with full trust but validates caller identity.

CREATE OR REPLACE FUNCTION public.update_my_preferences(
  p_preferences JSONB
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  UPDATE public.profiles
  SET preferences = preferences || p_preferences,
      updated_at  = NOW()
  WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION public.update_my_display_name(
  p_display_name TEXT
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;
  IF char_length(p_display_name) > 60 THEN
    RAISE EXCEPTION 'Display name too long (max 60 chars).';
  END IF;

  UPDATE public.profiles
  SET display_name = p_display_name,
      updated_at   = NOW()
  WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ──────────────────────────────────────────────────────────────
-- 5. UPDATED_AT TRIGGER FOR LOG_COMMENTS
-- ──────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_updated_at_log_comments ON public.log_comments;
CREATE TRIGGER set_updated_at_log_comments
  BEFORE UPDATE ON public.log_comments
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
