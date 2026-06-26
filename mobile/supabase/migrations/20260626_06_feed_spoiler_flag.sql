-- ═══════════════════════════════════════════════════════════════════════════════
-- COMP-SPOILER-1 (feed RPCs) — add is_spoiler so the feed veil works on the RPC path
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit ref: COMP-SPOILER-1 (LOW) — feed-veil portion
--
-- APPLIED MANUALLY to the live DB 2026-06-26 (⚠️ do NOT `supabase db push` — see
-- WAVE0_LIVE_NOTES.md). Rebuilt from the VERIFIED live bodies of the two feed cursor
-- RPCs, adding only the trailing `is_spoiler` column (+ l.is_spoiler in the SELECT)
-- so the client SpoilerVeil can veil spoiler-flagged reviews in the feed. Adding a
-- RETURNS TABLE column changes the return type, so it's DROP + CREATE (a plain
-- CREATE OR REPLACE would error), wrapped in a transaction so the feed never blinks.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_community_feed_auth_cursor(integer, timestamptz, uuid);
CREATE FUNCTION public.get_community_feed_auth_cursor(
  p_limit integer DEFAULT 40,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, film_id integer, film_title text, poster_path text, rating numeric,
  review text, drop_cap boolean, status text, abandoned_reason text,
  created_at timestamptz, year text, user_id uuid, username text, avatar_url text,
  role text, editorial_header text, pull_quote text, watched_with text,
  is_autopsied boolean, autopsy jsonb, is_spoiler boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND (auth.uid() IS NULL OR NOT is_hidden_by(auth.uid(), l.user_id))
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

DROP FUNCTION IF EXISTS public.get_following_feed_auth_cursor(integer, timestamptz, uuid);
CREATE FUNCTION public.get_following_feed_auth_cursor(
  p_limit integer DEFAULT 40,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, film_id integer, film_title text, poster_path text, rating numeric,
  review text, drop_cap boolean, status text, abandoned_reason text,
  created_at timestamptz, year text, user_id uuid, username text, avatar_url text,
  role text, editorial_header text, pull_quote text, watched_with text,
  is_autopsied boolean, autopsy jsonb, is_spoiler boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  JOIN interactions i ON i.target_user_id = l.user_id AND i.type = 'follow'
  WHERE i.user_id = auth.uid()
    AND l.review IS NOT NULL
    AND l.review <> ''
    AND NOT is_hidden_by(auth.uid(), l.user_id)
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

COMMIT;
