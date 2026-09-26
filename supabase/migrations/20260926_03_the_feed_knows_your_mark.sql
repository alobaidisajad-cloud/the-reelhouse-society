-- ════════════════════════════════════════════════════════════════════════════
-- The feed knows your mark.
-- ════════════════════════════════════════════════════════════════════════════
-- The heart on a card is filled when the member has certified the log. The app
-- learned that from ONE fetch at sign-in — the member's newest 500
-- certifications — so a log certified before those 500 showed an empty heart,
-- and tapping it tried to certify it a second time. Fetching every
-- certification a member ever made grows without end; asking about exactly the
-- rows on screen does not.
--
-- So each feed row now carries `certified`: whether the VIEWER has certified
-- that log. False for a signed-out visitor (auth.uid() is null). The answer is
-- read under the viewer's own row security, which always lets a member see
-- their own interactions (interactions_select_authorized: auth.uid() = user_id).
--
-- Served by idx_interactions_covering (target_log_id, user_id) INCLUDE (type):
-- one index probe per row.
--
-- Same names, same arguments, same 23 columns in the same order — `certified`
-- is ADDED at the end. A shipped build parses these rows through a schema that
-- ignores keys it does not know. A RETURNS TABLE cannot gain columns in place,
-- so each function is dropped and created again inside this one transaction;
-- the grants are restated exactly as they were.
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
  certify_count integer, critique_count integer, certified boolean
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
      WHERE lc.log_id = l.id) AS critique_count,
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    )) AS certified
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
  certify_count integer, critique_count integer, certified boolean
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
      WHERE lc.log_id = l.id) AS critique_count,
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    )) AS certified
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
