-- ═══════════════════════════════════════════════════════════════════════════════
-- COMP-SPOILER-1 — expose is_spoiler through the feed cursor RPCs
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit ref: COMP-SPOILER-1 (LOW)
--
-- `logs.is_spoiler` is collected at log time and persisted, but the feed cursor
-- RPCs (get_community_feed_auth_cursor / get_following_feed_auth_cursor) did not
-- return it, so the client feed veil (SpoilerVeil) had no flag to act on. This
-- re-creates both RPCs verbatim from 20260620_feed_block_filtering.sql with a
-- single added trailing column: `is_spoiler boolean`. The direct-query fallbacks
-- already select is_spoiler client-side, so this only closes the RPC path.
--
-- Idempotent (CREATE OR REPLACE). Single transaction. The added column is
-- trailing, so the client Zod schema (is_spoiler optional) tolerates both the
-- pre- and post-deploy RPC shapes.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Community feed ──
CREATE OR REPLACE FUNCTION get_community_feed_auth_cursor(
  p_limit int DEFAULT 40,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  film_id int,
  film_title text,
  poster_path text,
  rating numeric,
  review text,
  drop_cap boolean,
  status text,
  abandoned_reason text,
  created_at timestamptz,
  year text,
  user_id uuid,
  username text,
  avatar_url text,
  role text,
  editorial_header text,
  pull_quote text,
  watched_with text,
  is_autopsied boolean,
  autopsy jsonb,
  is_spoiler boolean
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

-- ── Following feed ──
CREATE OR REPLACE FUNCTION get_following_feed_auth_cursor(
  p_limit int DEFAULT 40,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  film_id int,
  film_title text,
  poster_path text,
  rating numeric,
  review text,
  drop_cap boolean,
  status text,
  abandoned_reason text,
  created_at timestamptz,
  year text,
  user_id uuid,
  username text,
  avatar_url text,
  role text,
  editorial_header text,
  pull_quote text,
  watched_with text,
  is_autopsied boolean,
  autopsy jsonb,
  is_spoiler boolean
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
