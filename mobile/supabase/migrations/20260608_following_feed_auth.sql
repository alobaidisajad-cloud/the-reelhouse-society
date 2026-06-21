BEGIN;

-- Elite Full-Stack Fix: Retrieve following feed using auth.uid() and server-side JOINs
-- This perfectly bypasses the 414 URI Too Long limits and eliminates client-side list management.

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
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

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

COMMIT;
