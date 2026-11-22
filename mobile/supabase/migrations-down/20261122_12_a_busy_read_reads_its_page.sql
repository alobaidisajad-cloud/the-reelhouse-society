-- Undo of 20261122_12: the stacks search and the projector room as 20261120_32 left them, the salon rules
-- as 20261116_01 left them, and the search pieces dropped. Undo 20261122_15, _14 and _13 first: their indexes
-- and searches read the pieces.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: as 20261120_32 left it
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_auth_cursor_v2(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_poster_count integer DEFAULT 4) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, film_count bigint, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH
  -- A search that matches many stacks walks them newest first, as with no search, and stops
  -- at its page; one that matches few is read by its matches. Counted by the trigram indexes,
  -- to 1,000 at most (load 43284739569: the walk 6.5 ms for a word every stack has and 292.7
  -- for a handle; the matches 94.7 and 4.4).
  -- Under three letters no trigram index can find a word (it is made of three-letter pieces): such
  -- a search walks, uncounted (load 43292798767: "m1" counted by the indexes took 506.9 ms).
  many AS MATERIALIZED (
    SELECT CASE WHEN char_length(COALESCE(p_search, '')) < 3 THEN true ELSE (
      SELECT count(*) >= 1000 FROM (
        SELECT l.id FROM lists l
         WHERE l.is_private = false
           AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        UNION ALL
        SELECT l.id FROM profiles pu JOIN lists l ON l.user_id = pu.id
         WHERE l.is_private = false
           AND pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        LIMIT 1000
      ) counted) END AS walk
  ),
  -- The matches of a few, newest first, before anything is asked of them.
  matched AS MATERIALIZED (
    SELECT m.id, m.created_at, m.user_id FROM (
      SELECT l.id, l.created_at, l.user_id
        FROM lists l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many) AND l.is_private = false
         AND l.withheld_at IS NULL
         AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM profiles pu JOIN lists l ON l.user_id = pu.id
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many) AND l.is_private = false
         AND l.withheld_at IS NULL
         AND pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
    ) m
     WHERE p_cursor_created_at IS NULL OR (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id)
     ORDER BY m.created_at DESC, m.id DESC
  ),
  page AS (
    -- No search, or a search of many: today's walk, today's test of each stack.
    (SELECT l.id, l.created_at
       FROM lists l
      WHERE (COALESCE(p_search, '') = '' OR (SELECT walk FROM many))
        AND (
          COALESCE(p_search, '') = ''
          OR l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
          -- The author's handle, looked up as the walk reaches each stack (a scalar subquery is
          -- never folded into a join): the walk stops at its page, never reading every member
          -- whose handle holds the word (today's IN (...) did, 219.4 ms for "m1").
          OR (SELECT pu.username FROM profiles pu WHERE pu.id = l.user_id)
               ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        )
        AND l.is_private = false
        -- a stack the house withholds is on no shelf (H-B10)
        AND l.withheld_at IS NULL
        AND NOT COALESCE(l.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
        AND private.can_view_user_data(l.user_id)
        AND (p_filter_following = false OR EXISTS (
              SELECT 1 FROM interactions i
               WHERE i.target_user_id = l.user_id AND i.user_id = auth.uid() AND i.type = 'follow'))
        AND (p_cursor_created_at IS NULL OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id))
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT p_limit)
    UNION ALL
    -- Read in the order it was kept (newest first), each asked only as it is reached.
    (SELECT m.id, m.created_at
       FROM matched m
      WHERE NOT COALESCE(m.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
        AND private.can_view_user_data(m.user_id)
        AND (p_filter_following = false OR EXISTS (
              SELECT 1 FROM interactions i
               WHERE i.target_user_id = m.user_id AND i.user_id = auth.uid() AND i.type = 'follow'))
      LIMIT p_limit)
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

-- add-only (3): it only fixes: as 20261120_32 left it
CREATE OR REPLACE FUNCTION public.get_user_analytics(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  result JSON;
  v_vault JSON := '[]'::json;
  v_decades JSON := '[]'::json;
  v_current integer := 0;
  v_longest integer := 0;
  v_run JSON;
  v_months JSON := '[]'::json;
BEGIN
  -- The check the other two functions already had. This one had none.
  IF NOT private.can_view_user_data(p_user_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  -- The two NEW fields, where a failure cannot reach the rest of the payload.
  BEGIN
    SELECT COALESCE(json_agg(row_to_json(vf)), '[]'::json) INTO v_vault
    FROM (
      SELECT COALESCE(f, 'unfiled') AS format, COUNT(*) AS count
      FROM physical_archive pa
      LEFT JOIN LATERAL unnest(NULLIF(pa.formats, '{}')) AS f ON TRUE
      WHERE pa.user_id = p_user_id
      GROUP BY 1 ORDER BY count DESC
    ) vf;
  EXCEPTION WHEN OTHERS THEN v_vault := '[]'::json;
  END;

  BEGIN
    SELECT COALESCE(json_agg(row_to_json(wd)), '[]'::json) INTO v_decades
    FROM (
      -- {1,4} not + : an unbounded pattern accepts a 20-digit string and the
      -- int cast then raises 22003, aborting everything.
      SELECT ((year::text)::int / 10) * 10 AS decade, COUNT(*) AS count
      FROM watchlists
      WHERE user_id = p_user_id
        AND year::text ~ '^\d{1,4}$'
        AND (year::text)::int > 0
      GROUP BY 1 ORDER BY 1 DESC
    ) wd;
  EXCEPTION WHEN OTHERS THEN v_decades := '[]'::json;
  END;

  -- The nights a member saw a film: every viewing's day, a rewatched film's earlier viewings
  -- among them. A run is consecutive days; date - row_number holds still along one, read
  -- ascending.
  --   current_streak: the run reaching the house's today or yesterday, as before, for the builds
  --     that read it.
  --   current_run: the newest run whole, its length and its last day, for the phone to judge on
  --     its own calendar (the house's day is not the member's). A day past the house's tomorrow
  --     is today nowhere, so a run ending after it is not the newest one.
  --   monthly_viewings: the viewings of each month, `YYYY-MM`.
  WITH viewed AS (
    SELECT v.day FROM public.member_viewings(p_user_id) v
  ),
  streak AS (
    SELECT d.day, d.day - (ROW_NUMBER() OVER (ORDER BY d.day))::int AS grp
    FROM (SELECT DISTINCT day FROM viewed) d
  ),
  runs AS (
    SELECT COUNT(*)::int AS len, MAX(day) AS ends_on FROM streak GROUP BY grp
  )
  SELECT
    COALESCE((SELECT r.len FROM runs r WHERE r.ends_on >= CURRENT_DATE - 1 ORDER BY r.ends_on DESC LIMIT 1), 0),
    COALESCE((SELECT MAX(r.len) FROM runs r), 0),
    (SELECT json_build_object('length', r.len, 'ends_on', r.ends_on)
       FROM runs r WHERE r.ends_on <= CURRENT_DATE + 1 ORDER BY r.ends_on DESC LIMIT 1),
    (SELECT COALESCE(json_agg(row_to_json(mv)), '[]'::json) FROM (
       SELECT TO_CHAR(day, 'YYYY-MM') AS month, COUNT(*) AS count
       FROM viewed GROUP BY 1 ORDER BY 1 DESC) mv)
  INTO v_current, v_longest, v_run, v_months;

  SELECT json_build_object(
    'total_logs', (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id AND (withheld_at IS NULL OR user_id = auth.uid())),
    'avg_rating', (SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
                   FROM logs WHERE user_id = p_user_id AND (withheld_at IS NULL OR user_id = auth.uid()) AND rating > 0),
    'rating_distribution', (
      SELECT COALESCE(json_agg(row_to_json(rd)), '[]'::json) FROM (
        SELECT rating, COUNT(*) as count FROM logs
        WHERE user_id = p_user_id AND (withheld_at IS NULL OR user_id = auth.uid()) AND rating > 0
        GROUP BY rating ORDER BY rating) rd),

    -- the 12-month window is gone. The Archive's records by the month each is filed under, as
    -- its headings count the posters beneath them.
    'monthly_activity', (
      SELECT COALESCE(json_agg(row_to_json(ma)), '[]'::json) FROM (
        SELECT TO_CHAR(COALESCE(watched_date::date, created_at::date), 'YYYY-MM') as month,
               COUNT(*) as count
        FROM logs WHERE user_id = p_user_id AND (withheld_at IS NULL OR user_id = auth.uid())
        GROUP BY month ORDER BY month DESC) ma),

    'current_streak', v_current,
    'longest_streak', v_longest,
    'current_run', v_run,
    'monthly_viewings', v_months,

    -- unchanged: this is logs.format, how a film was watched — NOT the Vault
    'format_breakdown', (
      SELECT COALESCE(json_agg(row_to_json(fb)), '[]'::json) FROM (
        SELECT format, COUNT(*) as count FROM logs
        WHERE user_id = p_user_id AND (withheld_at IS NULL OR user_id = auth.uid()) AND format IS NOT NULL AND format != ''
        GROUP BY format ORDER BY count DESC) fb),

    'vault_formats', v_vault,
    'watchlist_decades', v_decades
  ) INTO result;

  RETURN result;
END;
$_$;

-- add-only (3): it only fixes: as 20261116_01 left them
DROP POLICY "Lounge messages readable" ON public.lounge_messages;
CREATE POLICY "Lounge messages readable" ON public.lounge_messages FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.lounges l
  WHERE ((l.id = lounge_messages.lounge_id) AND (l.is_private = false)))) OR (EXISTS ( SELECT 1
   FROM public.lounge_members m
  WHERE ((m.lounge_id = lounge_messages.lounge_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = ANY (ARRAY['approved'::text, 'muted'::text])))))));
DROP POLICY "Reactions readable" ON public.lounge_message_reactions;
CREATE POLICY "Reactions readable" ON public.lounge_message_reactions FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.lounges l
  WHERE ((l.id = lounge_message_reactions.lounge_id) AND (l.is_private = false)))) OR (EXISTS ( SELECT 1
   FROM public.lounge_members m
  WHERE ((m.lounge_id = lounge_message_reactions.lounge_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = ANY (ARRAY['approved'::text, 'muted'::text])))))));

-- add-only (1): no shipped client uses it: functions 20261122_12 made
DROP FUNCTION IF EXISTS private.pattern_grams(text);
DROP FUNCTION IF EXISTS private.search_grams(text, text);
DROP FUNCTION IF EXISTS private.short_grams(text);
