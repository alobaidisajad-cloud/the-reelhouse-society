-- Undo of 20261122_27: a ballot's votes counted again on each read, as production held it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE FUNCTION public.ballot_tally(p_post uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.dispatch_posts p
       WHERE p.id = p_post
         AND p.kind = 'ballot'
         AND p.is_published AND p.withheld_at IS NULL AND p.ended_at IS NULL
         AND NOT COALESCE(p.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
         -- Voted in, or closed: until then the result is not the reader's to see.
         AND (p.closes_at <= now()
              OR EXISTS (SELECT 1 FROM public.dispatch_votes v
                          WHERE v.post_id = p.id AND v.user_id = auth.uid())))
    THEN (
      -- sum(t.n), not count(*): `t` is one row per option, as freeze_closed_ballots counts.
      SELECT jsonb_build_object(
               'total', COALESCE(sum(t.n), 0),
               'counts', COALESCE(jsonb_object_agg(t.option_index, t.n)
                                  FILTER (WHERE t.option_index IS NOT NULL), '{}'::jsonb))
        FROM (SELECT option_index, count(*) AS n FROM public.dispatch_votes
               WHERE post_id = p_post GROUP BY option_index) t)
  END
$$;

-- add-only (3): it only fixes: as production held it
CREATE OR REPLACE FUNCTION public.freeze_closed_ballots() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE n integer;
BEGIN
  WITH tallied AS (
    SELECT p.id,
           jsonb_build_object(
             -- sum(v.n), not count(v.id): `v` is already GROUPED BY option, so
             -- it has no id to count and one row per option rather than one per
             -- vote. Counting its rows would have recorded "2 ballots cast" for
             -- a ballot with two options and two hundred voters — a permanent,
             -- plausible, wrong number, written once and never recomputed.
             'total', coalesce(sum(v.n), 0),
             'counts', coalesce(jsonb_object_agg(v.option_index, v.n)
                                FILTER (WHERE v.option_index IS NOT NULL), '{}'::jsonb),
             'frozen_at', now()
           ) AS totals
      FROM public.dispatch_posts p
      LEFT JOIN (
        SELECT post_id, option_index, count(*) AS n
          FROM public.dispatch_votes GROUP BY post_id, option_index
      ) v ON v.post_id = p.id
     WHERE p.kind = 'ballot'
       AND p.closes_at <= now()
       AND p.frozen_totals IS NULL
       AND p.ended_at IS NULL
     GROUP BY p.id
  )
  UPDATE public.dispatch_posts p
     SET frozen_totals = t.totals
    FROM tallied t
   WHERE p.id = t.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;


--
-- Name: get_community_feed_auth_cursor(integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_community_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean, alt_poster text, physical_media text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT (SELECT private.hidden_authors()) AS hidden)
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    CASE
      WHEN COALESCE(cardinality(me.hidden), 0) = 0 THEN COALESCE(c.critique_count, 0)
      ELSE (SELECT count(*)::integer FROM log_comments x
             WHERE x.log_id = l.id AND NOT COALESCE(x.user_id = ANY (me.hidden), false)
               AND x.withheld_at IS NULL)
    END AS critique_count,
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM interactions im
       WHERE im.target_log_id = l.id AND im.user_id = (SELECT auth.uid()) AND im.type = 'endorse_log'
    )) AS certified,
    l.alt_poster, l.physical_media
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  LEFT JOIN log_counts c ON c.log_id = l.id
  CROSS JOIN me
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    -- a log the house withholds is in no feed, its author's own included (H-B10)
    AND l.withheld_at IS NULL
    AND NOT COALESCE(l.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

-- add-only (1): no shipped client uses it: the trigger this car made
DROP TRIGGER IF EXISTS a_vote_is_counted ON public.dispatch_votes;
-- add-only (1): no shipped client uses it: the trigger's function this car made
DROP FUNCTION IF EXISTS private.a_vote_is_counted();
-- add-only (1): no shipped client uses it: the counts this car made, in private
DROP TABLE IF EXISTS private.ballot_counts;
