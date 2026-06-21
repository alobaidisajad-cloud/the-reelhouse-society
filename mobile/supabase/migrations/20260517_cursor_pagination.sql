-- ═══════════════════════════════════════════════════════════════════
-- REELHOUSE PRODUCTION MIGRATION: Cursor-Based Keyset Pagination
-- ═══════════════════════════════════════════════════════════════════
-- Date: 2026-05-17
-- Author: Production Audit — Offset→Cursor Migration
--
-- WHY: Offset pagination is O(N²) for deep scrolling and causes
-- duplicate items when new rows are inserted between page fetches.
-- Keyset pagination with (created_at, id) composite cursor is:
--   • O(N) at any depth
--   • Duplicate-free regardless of concurrent inserts
--   • Index-friendly (uses composite DESC indexes below)
--
-- SAFETY: Creates NEW functions alongside existing ones — zero
-- downtime. Old RPCs remain untouched until client fully migrates.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. FOLLOWING FEED: Cursor-Based ─────────────────────────────
-- Replaces get_following_feed(p_usernames, p_limit, p_offset)
-- with cursor-based keyset pagination using (created_at, id).

CREATE OR REPLACE FUNCTION get_following_feed_cursor(
  p_usernames text[],
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
  year int,
  user_id uuid,
  username text,
  avatar_url text,
  role text,
  editorial_header text,
  pull_quote text,
  watched_with text,
  is_autopsied boolean,
  autopsy jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  WHERE p.username = ANY(p_usernames)
    AND l.review IS NOT NULL
    AND l.review <> ''
    AND (
      -- First page: no cursor, return newest rows
      p_cursor_created_at IS NULL
      OR
      -- Subsequent pages: composite keyset cursor for deterministic ordering
      -- Handles ties in created_at by using id as the tiebreaker
      (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;


-- ── 2. STACKS FEED: Cursor-Based ───────────────────────────────
-- Replaces get_filtered_stacks(p_search, p_following, p_limit, p_offset)
-- with cursor-based keyset pagination.

CREATE OR REPLACE FUNCTION get_filtered_stacks_cursor(
  p_search text DEFAULT '',
  p_following text[] DEFAULT '{}',
  p_limit int DEFAULT 60,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  username text,
  user_id uuid,
  created_at timestamptz,
  films jsonb,
  certify_count bigint,
  is_ranked boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object('id', li.film_id, 'title', li.film_title, 'poster_path', li.poster_path)
        ORDER BY li.created_at ASC
      )
      FROM list_items li WHERE li.list_id = l.id),
      '[]'::jsonb
    ) AS films,
    (SELECT COUNT(*) FROM interactions i
     WHERE i.target_list_id = l.id AND i.type = 'endorse_list') AS certify_count,
    l.is_ranked
  FROM lists l
  JOIN profiles p ON p.id = l.user_id
  WHERE l.is_private = false
    -- Search filter (empty string = no filter)
    AND (
      p_search = ''
      OR l.title ILIKE '%' || p_search || '%'
      OR p.username ILIKE '%' || p_search || '%'
    )
    -- Following filter (empty array = show all)
    AND (
      array_length(p_following, 1) IS NULL
      OR p.username = ANY(p_following)
    )
    -- Cursor pagination
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;


-- ── 3. PERFORMANCE INDEXES ──────────────────────────────────────
-- Composite (created_at DESC, id DESC) indexes ensure cursor conditions
-- are index-scannable. CREATE INDEX IF NOT EXISTS prevents errors.

CREATE INDEX IF NOT EXISTS idx_logs_created_at_id_desc
  ON logs (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_lists_created_at_id_desc
  ON lists (created_at DESC, id DESC)
  WHERE is_private = false;

CREATE INDEX IF NOT EXISTS idx_watchlists_created_at_id_desc
  ON watchlists (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_physical_archive_created_at_id_desc
  ON physical_archive (created_at DESC, id DESC);

COMMIT;
