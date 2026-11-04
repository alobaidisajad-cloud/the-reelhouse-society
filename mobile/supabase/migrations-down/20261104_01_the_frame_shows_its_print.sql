-- ════════════════════════════════════════════════════════════════════════════
-- Undo of 20261104_01 — the two feed functions as production had them, without
-- alt_poster and physical_media; their grants restated exactly.
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION public.get_community_feed_auth_cursor(integer, timestamp with time zone, uuid);
CREATE FUNCTION public.get_community_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    COALESCE(c.critique_count, 0) AS critique_count,
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    )) AS certified
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  LEFT JOIN log_counts c ON c.log_id = l.id
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND NOT COALESCE(l.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;

DROP FUNCTION public.get_following_feed_auth_cursor(integer, timestamp with time zone, uuid);
CREATE FUNCTION public.get_following_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH followed AS (
    SELECT i.target_user_id AS author
      FROM public.interactions i
     WHERE i.user_id = auth.uid()
       AND i.type = 'follow'
       AND NOT COALESCE(i.target_user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false)
       AND public.can_view_user_data(i.target_user_id)
  ),
  page AS (
    SELECT r.id, r.created_at
      FROM followed f
      CROSS JOIN LATERAL (
        SELECT l.id, l.created_at
          FROM public.logs l
         WHERE l.user_id = f.author
           AND l.review IS NOT NULL
           AND l.review <> ''
           AND (p_cursor_created_at IS NULL OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id))
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT p_limit
      ) r
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT p_limit
  )
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    COALESCE(c.critique_count, 0) AS critique_count,
    EXISTS (
      SELECT 1 FROM public.interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    ) AS certified
  FROM page pg
  JOIN public.logs l ON l.id = pg.id
  JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN public.log_counts c ON c.log_id = l.id
  ORDER BY pg.created_at DESC, pg.id DESC;
$$;
REVOKE ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;
