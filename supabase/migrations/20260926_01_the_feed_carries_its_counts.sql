-- ════════════════════════════════════════════════════════════════════════════
-- The feed carries its counts.
-- ════════════════════════════════════════════════════════════════════════════
-- Every action bar in the app now shows a mark's count beside its icon —
-- CERTIFY 12, CRITIQUE 3. A log card on the Reel had neither number: the two
-- feed functions returned the log and its author and nothing about the
-- conversation around it. Fetching the counts afterwards would make every card
-- appear first and have its numbers pop in a moment later, so they come IN the
-- feed rows instead, and each card arrives whole.
--
-- The counts are computed with the VIEWER's own visibility. Both functions are
-- SECURITY INVOKER, so the two subqueries run under the same row security the
-- log page runs under: a critique by someone the viewer has blocked is not
-- counted here because it is not shown there (log_comments_hide_blocked), and
-- a certification is counted only where interactions_select_authorized lets
-- the viewer see it. The number on the card is the number on the page.
--
-- Both subqueries have indexes: interactions_endorse_log_idx (partial, on
-- target_log_id WHERE type = 'endorse_log') and log_comments_log_id_idx.
--
-- Same names, same arguments, same columns in the same order — the two counts
-- are ADDED at the end. A shipped build parses these rows through a schema that
-- ignores keys it does not know, so it keeps working and simply shows no count.
-- A RETURNS TABLE cannot gain columns in place, so each function is dropped and
-- created again inside this one transaction: no moment exists without it. The
-- grants are restated exactly as they were (anon, authenticated, service_role).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION public.get_community_feed_auth_cursor(integer, timestamp with time zone, uuid);

CREATE FUNCTION public.get_community_feed_auth_cursor(
  p_limit integer DEFAULT 40,
  p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid
) RETURNS TABLE(
  id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text,
  drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone,
  year text, user_id uuid, username text, avatar_url text, role text, editorial_header text,
  pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean,
  certify_count integer, critique_count integer
)
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
    (SELECT count(*)::integer FROM interactions ie
      WHERE ie.target_log_id = l.id AND ie.type = 'endorse_log') AS certify_count,
    (SELECT count(*)::integer FROM log_comments lc
      WHERE lc.log_id = l.id) AS critique_count
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

GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;

DROP FUNCTION public.get_following_feed_auth_cursor(integer, timestamp with time zone, uuid);

CREATE FUNCTION public.get_following_feed_auth_cursor(
  p_limit integer DEFAULT 40,
  p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid
) RETURNS TABLE(
  id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text,
  drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone,
  year text, user_id uuid, username text, avatar_url text, role text, editorial_header text,
  pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean,
  certify_count integer, critique_count integer
)
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
    (SELECT count(*)::integer FROM interactions ie
      WHERE ie.target_log_id = l.id AND ie.type = 'endorse_log') AS certify_count,
    (SELECT count(*)::integer FROM log_comments lc
      WHERE lc.log_id = l.id) AS critique_count
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

GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_following_feed_auth_cursor(p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) TO service_role;

COMMIT;
