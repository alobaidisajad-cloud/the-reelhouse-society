-- ============================================================
-- REELHOUSE — get_following_feed RPC
-- Paste this into Supabase SQL Editor → Run
-- Eliminates the N+1 "following" feed query from the native app
-- ============================================================

CREATE OR REPLACE FUNCTION get_following_feed(
  p_usernames TEXT[],        -- Array of usernames the caller follows
  p_limit INT DEFAULT 40,    -- Page size
  p_offset INT DEFAULT 0     -- Cursor offset for pagination
)
RETURNS TABLE (
  id UUID,
  film_id INT,
  film_title TEXT,
  poster_path TEXT,
  rating NUMERIC,
  review TEXT,
  drop_cap BOOLEAN,
  status TEXT,
  created_at TIMESTAMPTZ,
  year INT,
  user_id UUID,
  editorial_header TEXT,
  pull_quote TEXT,
  watched_with TEXT,
  is_autopsied BOOLEAN,
  autopsy JSONB,
  username TEXT,
  avatar_url TEXT,
  role TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    l.id,
    l.film_id,
    l.film_title,
    l.poster_path,
    l.rating,
    l.review,
    l.drop_cap,
    l.status,
    l.created_at,
    l.year,
    l.user_id,
    l.editorial_header,
    l.pull_quote,
    l.watched_with,
    l.is_autopsied,
    l.autopsy,
    p.username,
    p.avatar_url,
    p.role
  FROM logs l
  INNER JOIN profiles p ON p.id = l.user_id
  WHERE p.username = ANY(p_usernames)
    AND l.review IS NOT NULL
    AND l.review <> ''
  ORDER BY l.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Index to accelerate the join (create only if not exists)
CREATE INDEX IF NOT EXISTS idx_logs_user_id_created_at 
  ON logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_username 
  ON profiles (username);
