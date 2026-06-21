-- BUG FIX: Feed pagination silently truncated for users with blocks/mutes.
--
-- useFeeds.ts decided whether another page exists by checking the raw
-- page length (e.g. `< 40`) BEFORE filterContentByBlocks() removed
-- blocked/muted authors' items client-side. A page that came back full
-- (40 rows) but contained several blocked authors would render shorter
-- than 40 items on screen, while getNextPageParam already concluded
-- there was no more data — the feed stopped loading with no error.
--
-- Fix: filter blocked/muted authors out at the query level, so the page
-- length the client measures for pagination is the same length it
-- renders. The client-side filterContentByBlocks() call stays in place
-- as a defense-in-depth backstop for the direct-query fallback paths
-- (used only when these RPCs are unavailable).

BEGIN;

-- ── Block-or-mute check (broader than is_blocked_by, which is block-only) ──
-- Matches the client's filterContentByBlocks()/BlockStore.isHidden() semantics:
-- hide content from an author the viewer has blocked OR muted.
CREATE OR REPLACE FUNCTION is_hidden_by(viewer_id uuid, author_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_blocks
    WHERE blocker_id = viewer_id AND blocked_id = author_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Community feed: new auth-cursor RPC with block filtering ──
-- Supersedes FeedService.getCommunityFeed()'s direct `.from('logs')` query,
-- which had no block filtering at all (community feed isn't scoped to a
-- single relationship, so the bug applied here even more than to following).
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

-- ── Following feed: add block filtering to the existing cursor RPC ──
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

-- ── Stacks feed: add block filtering to the existing cursor RPC ──
CREATE OR REPLACE FUNCTION get_filtered_stacks_auth_cursor(
  p_search text DEFAULT '',
  p_filter_following boolean DEFAULT false,
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
    AND (auth.uid() IS NULL OR NOT is_hidden_by(auth.uid(), l.user_id))
    -- Search filter
    AND (
      p_search = ''
      OR l.title ILIKE '%' || p_search || '%'
      OR p.username ILIKE '%' || p_search || '%'
    )
    -- Following filter (JOIN safely if requested)
    AND (
      p_filter_following = false
      OR EXISTS (
        SELECT 1 FROM interactions i
        WHERE i.target_user_id = l.user_id
          AND i.user_id = auth.uid()
          AND i.type = 'follow'
      )
    )
    -- Cursor pagination
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION is_hidden_by(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_community_feed_auth_cursor(int, timestamptz, uuid) TO authenticated, anon;

COMMIT;
