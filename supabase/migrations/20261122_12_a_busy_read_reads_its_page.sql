-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_12 — a busy read reads its page, never the house.
-- ════════════════════════════════════════════════════════════════════════════
--   The load lab judges each busy read by the rows it reads of the tables that grow with the house
--   (e2e/load/plan-shape.cjs; the kinds pass, stage C, kind 13: built for millions). At 100,000
--   members it refused reads that were fast but read in proportion to the house:
--   · the Reel's stacks searched by an author's handle read every open stack to join them to the
--     members whose handle holds the words (40,164 rows): each such member's stacks are now read by
--     their own index;
--   · a salon's words, and their reactions, were let through by a rule the planner answered by
--     reading every salon of the house (1,500 rows at 100,000 members) before the first word: the
--     rule is now asked of each word read, by the salon's own row (private.salon_words_are_read);
--   · (the corridor's newest salons, found by reading and sorting every salon, are held newest first by
--     20261122_16's index, built CONCURRENTLY in its own car);
--   · the projector room read the member's records seven times over (70,015 rows for the whale): it
--     reads them once, every figure counted from that one read, the answer as before.
--   And the pieces a search of one or two letters is found by (private.search_grams,
--   private.pattern_grams), for the indexes of 20261122_13 and _14 and the searches of _15.
--   Every answer is as before.
-- Undo: mobile/supabase/migrations-down/20261122_12_a_busy_read_reads_its_page.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- Each one- and two-letter piece of a text, in lower case: what a search of one or two letters is
-- found by (20261122_13, _14). Lower case as ILIKE reads both sides. The two-letter pieces are read as
-- the pairs from the first letter and the pairs from the second, by the regular-expression reader
-- (0.6 ms for a 1,000-letter description, where a piece-by-piece walk took 23).
-- add-only (1): no shipped client uses it: a function this car makes for an index, called by no client
CREATE OR REPLACE FUNCTION private.short_grams(p_text text) RETURNS text[]
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT string_to_array(x.t, NULL)
      || ARRAY(SELECT m[1] FROM regexp_matches(x.t, '(..)', 'g') m)
      || ARRAY(SELECT m[1] FROM regexp_matches(substr(x.t, 2), '(..)', 'g') m)
    FROM (SELECT lower(p_text) AS t) x;
$$;
-- The pieces of two texts (a stack's title and description, a member's handle and name), as one.
-- add-only (1): no shipped client uses it: a function this car makes for an index, called by no client
CREATE OR REPLACE FUNCTION private.search_grams(p_one text, p_two text) RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT private.short_grams(coalesce(p_one, '')) || private.short_grams(coalesce(p_two, ''));
$$;
-- The pieces every text matching a search must hold: a LIKE pattern (its \ escapes read) cut at its
-- wildcards, each part's one letter or each of its two-letter pieces. None when the pattern is all
-- wildcards: then no piece can find it.
-- add-only (1): no shipped client uses it: a function this car makes for the searches, called by no client
CREATE OR REPLACE FUNCTION private.pattern_grams(p_pattern text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  v_text text := lower(p_pattern);
  v_n    integer := char_length(v_text);
  v_i    integer := 1;
  v_c    text;
  v_seg  text := '';
  v_out  text[] := '{}';
BEGIN
  WHILE v_i <= v_n + 1 LOOP
    v_c := CASE WHEN v_i <= v_n THEN substr(v_text, v_i, 1) END;
    IF v_c = '\' AND v_i < v_n THEN
      v_seg := v_seg || substr(v_text, v_i + 1, 1);
      v_i := v_i + 2;
      CONTINUE;
    END IF;
    IF v_c IS NULL OR v_c IN ('%', '_') THEN
      IF char_length(v_seg) = 1 THEN
        v_out := v_out || v_seg;
      ELSE
        FOR k IN 1 .. char_length(v_seg) - 1 LOOP
          v_out := v_out || substr(v_seg, k, 2);
        END LOOP;
      END IF;
      v_seg := '';
    ELSE
      v_seg := v_seg || v_c;
    END IF;
    v_i := v_i + 1;
  END LOOP;
  RETURN CASE WHEN cardinality(v_out) = 0 THEN NULL ELSE v_out END;
END $$;
-- add-only (1): no shipped client uses it: functions this car makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.short_grams(text), private.search_grams(text, text), private.pattern_grams(text) FROM PUBLIC, anon, authenticated;

-- As 20261120_32 left it, but the stacks of a member whose handle holds the words are read by their own index.
-- add-only (3): it only fixes: the same stacks in the same order for every search (the rehearsal replays each search and compares it with the old reading); TestFlight build 41 and the website read it as before
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
        -- Each member whose handle holds the words, then their stacks by their own index (OFFSET 0
        -- keeps it a lookup per member): never every stack of the house read to be joined.
        SELECT l.id FROM profiles pu
         CROSS JOIN LATERAL (SELECT l.id FROM lists l WHERE l.user_id = pu.id AND l.is_private = false OFFSET 0) l
         WHERE pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
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
        FROM profiles pu
       CROSS JOIN LATERAL (SELECT l.id, l.created_at, l.user_id FROM lists l
                            WHERE l.user_id = pu.id AND l.is_private = false AND l.withheld_at IS NULL OFFSET 0) l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many)
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

-- As 20261120_32 left it, but the member's records are read once: every figure is counted from that one read.
-- add-only (3): it only fixes: the same answer, every field as before, its records read once instead of seven times (the rehearsal replays it and compares it with the old reading, field by field); TestFlight build 41 and the website read it as before
CREATE OR REPLACE FUNCTION public.get_user_analytics(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  result JSON;
  v_vault JSON := '[]'::json;
  v_decades JSON := '[]'::json;
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

  -- The member's records, read once (a withheld one its author's alone): every figure below is
  -- counted from this one read, never from the records read again.
  WITH mine AS MATERIALIZED (
    SELECT l.rating, l.format, l.watched_date, l.created_at, l.viewing_history
      FROM logs l
     WHERE l.user_id = p_user_id AND (l.withheld_at IS NULL OR l.user_id = auth.uid())
  ),
  -- The nights a member saw a film, as member_viewings reads them: every viewing's day, a rewatched
  -- film's earlier viewings among them. A run is consecutive days; date - row_number holds still
  -- along one, read ascending.
  --   current_streak: the run reaching the house's today or yesterday, as before, for the builds
  --     that read it.
  --   current_run: the newest run whole, its length and its last day, for the phone to judge on
  --     its own calendar (the house's day is not the member's). A day past the house's tomorrow
  --     is today nowhere, so a run ending after it is not the newest one.
  --   monthly_viewings: the viewings of each month, `YYYY-MM`.
  viewed AS (
    SELECT m.watched_date AS day FROM mine m
    UNION ALL
    SELECT COALESCE(CASE WHEN e->>'date' ~ '^\d{4}-\d{2}-\d{2}' AND pg_input_is_valid(left(e->>'date', 10), 'date')
                         THEN left(e->>'date', 10)::date END,
                    m.created_at::date)
      FROM mine m
     CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(m.viewing_history) = 'array' THEN m.viewing_history ELSE '[]'::jsonb END) AS e
     WHERE jsonb_typeof(e) = 'object'
  ),
  streak AS (
    SELECT d.day, d.day - (ROW_NUMBER() OVER (ORDER BY d.day))::int AS grp
    FROM (SELECT DISTINCT day FROM viewed) d
  ),
  runs AS (
    SELECT COUNT(*)::int AS len, MAX(day) AS ends_on FROM streak GROUP BY grp
  )
  SELECT json_build_object(
    'total_logs', (SELECT COUNT(*) FROM mine),
    'avg_rating', (SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0) FROM mine WHERE rating > 0),
    'rating_distribution', (
      SELECT COALESCE(json_agg(row_to_json(rd)), '[]'::json) FROM (
        SELECT rating, COUNT(*) as count FROM mine
        WHERE rating > 0
        GROUP BY rating ORDER BY rating) rd),

    -- The Archive's records by the month each is filed under, as its headings count the posters
    -- beneath them.
    'monthly_activity', (
      SELECT COALESCE(json_agg(row_to_json(ma)), '[]'::json) FROM (
        SELECT TO_CHAR(COALESCE(watched_date::date, created_at::date), 'YYYY-MM') as month,
               COUNT(*) as count
        FROM mine
        GROUP BY month ORDER BY month DESC) ma),

    'current_streak', COALESCE((SELECT r.len FROM runs r WHERE r.ends_on >= CURRENT_DATE - 1 ORDER BY r.ends_on DESC LIMIT 1), 0),
    'longest_streak', COALESCE((SELECT MAX(r.len) FROM runs r), 0),
    'current_run', (SELECT json_build_object('length', r.len, 'ends_on', r.ends_on)
                      FROM runs r WHERE r.ends_on <= CURRENT_DATE + 1 ORDER BY r.ends_on DESC LIMIT 1),
    'monthly_viewings', (SELECT COALESCE(json_agg(row_to_json(mv)), '[]'::json) FROM (
                           SELECT TO_CHAR(day, 'YYYY-MM') AS month, COUNT(*) AS count
                           FROM viewed GROUP BY 1 ORDER BY 1 DESC) mv),

    -- this is logs.format, how a film was watched — NOT the Vault
    'format_breakdown', (
      SELECT COALESCE(json_agg(row_to_json(fb)), '[]'::json) FROM (
        SELECT format, COUNT(*) as count FROM mine
        WHERE format IS NOT NULL AND format != ''
        GROUP BY format ORDER BY count DESC) fb),

    'vault_formats', v_vault,
    'watchlist_decades', v_decades
  ) INTO result
  FROM (SELECT 1) one;

  RETURN result;
END;
$_$;

-- A salon's words are read by whoever may read its room: an open room's, or a seat's (approved or
-- muted) in a closed one, as before. Asked as two questions the planner may answer for the whole
-- read at once: the seats question so, over the reader's own seats (read once); the open-room
-- question it answered by reading every salon of the house into a table before the first word
-- (1,500 at 100,000 members, 7,500 at 500,000). That question now names the word's own row beside
-- its join (`lounge_messages.lounge_id IS NOT NULL`, always true: lounge_id is never empty), which
-- the planner cannot turn into a table of every salon: it is asked of each word read, by its salon's
-- own row, so a page of a hundred words reads a hundred salon rows at any size of the house.
-- add-only (3): it only fixes: every reader reads every word they read before, and no other (the rehearsal replays the reads of an open room, a closed room from a seat, a closed room from none, and a muted seat, as the members themselves)
DROP POLICY "Lounge messages readable" ON public.lounge_messages;
CREATE POLICY "Lounge messages readable" ON public.lounge_messages FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.lounges l
  WHERE ((l.id = lounge_messages.lounge_id) AND (l.is_private = false) AND (lounge_messages.lounge_id IS NOT NULL)))) OR (EXISTS ( SELECT 1
   FROM public.lounge_members m
  WHERE ((m.lounge_id = lounge_messages.lounge_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = ANY (ARRAY['approved'::text, 'muted'::text])))))));
-- add-only (3): it only fixes: as the words' rule, for their reactions (the rehearsal replays their reads as the members themselves)
DROP POLICY "Reactions readable" ON public.lounge_message_reactions;
CREATE POLICY "Reactions readable" ON public.lounge_message_reactions FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.lounges l
  WHERE ((l.id = lounge_message_reactions.lounge_id) AND (l.is_private = false) AND (lounge_message_reactions.lounge_id IS NOT NULL)))) OR (EXISTS ( SELECT 1
   FROM public.lounge_members m
  WHERE ((m.lounge_id = lounge_message_reactions.lounge_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = ANY (ARRAY['approved'::text, 'muted'::text])))))));
