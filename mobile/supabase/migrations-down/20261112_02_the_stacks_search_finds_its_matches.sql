-- Undo of 20261112_02: the stacks search walks every search, as before it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the function as it was before 20261112_02, the same stacks found the slow way
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_auth_cursor_v2(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_poster_count integer DEFAULT 4) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, film_count bigint, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH page AS (
    SELECT l.id
      FROM lists l
     WHERE l.is_private = false
       AND NOT COALESCE(l.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
       AND (
         COALESCE(p_search, '') = ''
         OR l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
         OR l.user_id IN (
           SELECT pu.id FROM profiles pu
            WHERE pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
         )
       )
       AND public.can_view_user_data(l.user_id)
       AND (
         p_filter_following = false
         OR EXISTS (
           SELECT 1 FROM interactions i
           WHERE i.target_user_id = l.user_id
             AND i.user_id = auth.uid()
             AND i.type = 'follow'
         )
       )
       AND (
         p_cursor_created_at IS NULL
         OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
       )
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT p_limit
  )
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    COALESCE(
      (SELECT jsonb_agg(f ORDER BY f_created_at ASC)
       FROM (
         SELECT jsonb_build_object('id', li.film_id, 'title', li.film_title,
                                   'poster_path', li.poster_path) AS f,
                li.created_at AS f_created_at
         FROM list_items li
         WHERE li.list_id = l.id AND li.poster_path IS NOT NULL
         ORDER BY li.created_at ASC
         LIMIT LEAST(GREATEST(p_poster_count, 0), 10)
       ) top_films),
      '[]'::jsonb
    ) AS films,
    (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id) AS film_count,
    public.list_certify_count(l.id) AS certify_count,
    l.is_ranked
  FROM page pg
  JOIN lists l ON l.id = pg.id
  JOIN profiles p ON p.id = l.user_id
  ORDER BY l.created_at DESC, l.id DESC;
$$;
