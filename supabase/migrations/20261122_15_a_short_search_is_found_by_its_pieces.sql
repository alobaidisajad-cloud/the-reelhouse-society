-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_15 — a search of one or two letters is found by its pieces, never by walking the house.
-- ════════════════════════════════════════════════════════════════════════════
--   A search without three letters or digits in a row ("m1", "é", "a b") holds no piece the trigram
--   indexes can find, so each search read the house one row at a time asking each: search_stacks read
--   every open stack when none held the words (20,000 at 100,000 members), search_members every member,
--   and the Reel's stack search walked uncounted. Now each reads by the words' one- and two-letter
--   pieces (private.pattern_grams) from 20261122_13's and _14's indexes: counted to 1,000 by them, the
--   few read from them, and a walk only for many (when a page is met at once) or for words of wildcards
--   alone. The same rows in the same order: the pieces only choose where to look, and every row is
--   still asked the words themselves.
--   Then the two tables are analysed, so the planner knows the new indexes' pieces (a new index
--   needs its statistics: round 14's feed went from 2.8 ms to 14 s without them).
--   Applied after 20261122_13 and _14; if the train stops before this car, the searches stand as
--   20261122_12 and 20261120_32 left them, answering as before.
-- Undo: mobile/supabase/migrations-down/20261122_15_a_short_search_is_found_by_its_pieces.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- As 20261122_12 left it, but a search without a trigram is counted and read by its short pieces.
-- add-only (3): it only fixes: the same stacks in the same order for every search (the rehearsal compares it with the old reading); TestFlight build 41 and the website read it as before
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_auth_cursor_v2(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_poster_count integer DEFAULT 4) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, film_count bigint, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH
  -- A search's one- and two-letter pieces, when it has no three letters or digits in a row; none when it
  -- is all wildcards (then it walks). Read by them, the words' own test is asked inside COALESCE, so no
  -- plan reads a trigram index for them whole (it holds nothing to find them by).
  short AS MATERIALIZED (
    SELECT CASE WHEN p_search !~ '[[:alnum:]]{3}'
                THEN private.pattern_grams('%' || like_escape(COALESCE(p_search, '')) || '%') END AS grams
  ),
  -- A search that matches many stacks walks them newest first, as with no search, and stops
  -- at its page; one that matches few is read by its matches. Counted by the trigram indexes,
  -- to 1,000 at most (load 43284739569: the walk 6.5 ms for a word every stack has and 292.7
  -- for a handle; the matches 94.7 and 4.4).
  -- Without three letters or digits in a row no trigram index can find a word (it is made of three-
  -- letter pieces; "m1" counted by them took 506.9 ms, load 43292798767): such a search is counted by
  -- its one- and two-letter pieces instead (lists_short_grams, profiles_short_grams), and walks only
  -- when it has none (all wildcards).
  many AS MATERIALIZED (
    SELECT CASE WHEN COALESCE(p_search, '') = '' OR (p_search !~ '[[:alnum:]]{3}' AND (SELECT grams FROM short) IS NULL) THEN true
                WHEN p_search !~ '[[:alnum:]]{3}' THEN (
      SELECT count(*) >= 1000 FROM (
        SELECT l.id FROM lists l
         WHERE l.is_private = false
           AND private.search_grams(l.title, l.description) @> (SELECT grams FROM short)
           AND COALESCE(l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
        UNION ALL
        SELECT l.id FROM profiles pu
         CROSS JOIN LATERAL (SELECT l.id FROM lists l WHERE l.user_id = pu.id AND l.is_private = false OFFSET 0) l
         WHERE private.search_grams(pu.username, pu.display_name) @> (SELECT grams FROM short)
           AND COALESCE(pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
        LIMIT 1000
      ) counted_short)
                ELSE (
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
         AND p_search ~ '[[:alnum:]]{3}'
         AND l.withheld_at IS NULL
         AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM lists l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many) AND l.is_private = false
         AND p_search !~ '[[:alnum:]]{3}'
         AND private.search_grams(l.title, l.description) @> (SELECT grams FROM short)
         AND l.withheld_at IS NULL
         AND COALESCE(l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM profiles pu
       CROSS JOIN LATERAL (SELECT l.id, l.created_at, l.user_id FROM lists l
                            WHERE l.user_id = pu.id AND l.is_private = false AND l.withheld_at IS NULL OFFSET 0) l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many)
         AND p_search ~ '[[:alnum:]]{3}'
         AND pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM profiles pu
       CROSS JOIN LATERAL (SELECT l.id, l.created_at, l.user_id FROM lists l
                            WHERE l.user_id = pu.id AND l.is_private = false AND l.withheld_at IS NULL OFFSET 0) l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many)
         AND p_search !~ '[[:alnum:]]{3}'
         AND private.search_grams(pu.username, pu.display_name) @> (SELECT grams FROM short)
         AND COALESCE(pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
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

-- As 20261120_32 left it, but a search without a trigram is counted and read by its short pieces.
-- add-only (3): it only fixes: the same stacks in the same order for every search (the rehearsal compares it with the old reading); TestFlight build 41 and the website read it as before
CREATE OR REPLACE FUNCTION public.search_stacks(p_pattern text, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, user_id uuid, title text, description text, is_ranked boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $$
#variable_conflict use_column
DECLARE
  v_me     uuid := auth.uid();
  v_hidden uuid[];
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_words  text := '%' || p_pattern || '%';
  -- The cursor as one bound on (created_at, id), newest first: none is the newest stack.
  v_at     timestamp with time zone := COALESCE(p_cursor_at, 'infinity'::timestamp with time zone);
  v_id     uuid := CASE WHEN p_cursor_at IS NULL THEN 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid ELSE p_cursor_id END;
  -- A trigram is three letters or digits in a row: without one, no index can find the words.
  v_pieces boolean := p_pattern ~ '[[:alnum:]]{3}';
  -- Without one, the words' one- and two-letter pieces (lists_short_grams): none when all wildcards.
  -- Read by them, the words' own test is asked inside COALESCE, so no plan reads a trigram index whole.
  v_grams  text[] := CASE WHEN p_pattern !~ '[[:alnum:]]{3}' THEN private.pattern_grams('%' || p_pattern || '%') END;
  v_few    boolean := false;
  v_page   uuid[];
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT private.hidden_authors()), '{}'::uuid[]);

  -- 1. Counted by the trigram indexes, or by the short pieces, to 1,000.
  IF v_grams IS NOT NULL THEN
    SELECT count(*) < 1000 INTO v_few
      FROM (SELECT 1 FROM public.lists l
             WHERE l.is_private = false AND l.withheld_at IS NULL
               AND private.search_grams(l.title, l.description) @> v_grams
               AND COALESCE((l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\'), false)
             LIMIT 1000) c;
  ELSIF v_pieces THEN
    SELECT count(*) < 1000 INTO v_few
      FROM (SELECT 1 FROM public.lists l
             WHERE l.is_private = false AND l.withheld_at IS NULL
               AND (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\')
             LIMIT 1000) c;
  END IF;

  IF v_few THEN
    -- 2. The few stacks that hold the words, newest first, the rule asked of each in that order.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT m.id, m.created_at
              FROM (SELECT l.id, l.created_at, l.user_id
                      FROM public.lists l
                     WHERE l.is_private = false AND l.withheld_at IS NULL
                       AND (v_grams IS NULL OR private.search_grams(l.title, l.description) @> v_grams)
                       AND CASE WHEN v_grams IS NULL THEN (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\') ELSE COALESCE((l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\'), false) END
                       AND (l.created_at, l.id) < (v_at, v_id)
                    -- Read by the indexes and sorted before any stack is asked the rule.
                    OFFSET 0) m
              LEFT JOIN public.profiles p ON p.id = m.user_id
             WHERE NOT (m.user_id = ANY (v_hidden))
               AND (m.user_id = v_me
                    OR (p.id IS NOT NULL AND NOT COALESCE(p.is_social_private, false))
                    OR private.can_view_user_data(m.user_id))
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT v_limit) w;
  ELSE
    -- 3. Many, or no piece at all: the public stacks newest first, each asked the words, then the rule.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT l.id, l.created_at
              FROM public.lists l
              LEFT JOIN public.profiles p ON p.id = l.user_id
             WHERE l.is_private = false AND l.withheld_at IS NULL
               AND (l.created_at, l.id) < (v_at, v_id)
               AND (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\')
               AND NOT (l.user_id = ANY (v_hidden))
               AND (l.user_id = v_me
                    OR (p.id IS NOT NULL AND NOT COALESCE(p.is_social_private, false))
                    OR private.can_view_user_data(l.user_id))
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT v_limit) w;
  END IF;

  RETURN QUERY
  SELECT l.id, l.user_id, l.title, l.description, l.is_ranked, l.created_at
    FROM unnest(v_page) WITH ORDINALITY AS g(list_id, n)
    JOIN public.lists l ON l.id = g.list_id
   ORDER BY g.n;
END $$;

-- As 20261120_02 left it, but a search without a trigram gathers its members by their short pieces.
-- add-only (3): it only fixes: the same members in the same order for every search (the rehearsal compares it with the old reading); TestFlight build 41 and the website read it as before
CREATE OR REPLACE FUNCTION public.search_members(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, username text, avatar_url text, role text, closeness integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_names  boolean := NOT COALESCE(p_handles_only, false);
  v_hidden uuid[];
  v_tests  text[];
  v_few    uuid[];
  v_past   text;
  v_tier   integer;
  v_not    text := '';
  v_got    integer := 0;
  v_n      integer;
  v_short  text := '';
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT private.hidden_authors())::uuid[], '{}'::uuid[]);
  -- Each closeness's own test, as the one read's CASE asked it. Plain, so the planner reads the words
  -- and their indexes: a WHERE drops a test that is unknown (a name not given), as the CASE did.
  -- The handle that is the words: words with no wildcard left once their escapes are read are one
  -- handle, any case, so the case-blind unique index (profiles_username_lower_unique) finds it at once
  -- (ILIKE is that same lower() on both sides: the equality adds no member and takes none away).
  v_tests := ARRAY[
    format('p.username ILIKE %L ESCAPE %L', p_pattern, '\')
      || CASE WHEN regexp_replace(p_pattern, '\\.', '', 'g') !~ '[%_\\]'
              THEN format(' AND lower(p.username) = lower(%L)', regexp_replace(p_pattern, '\\(.)', '\1', 'g')) ELSE '' END,
    format('p.username ILIKE %L ESCAPE %L', p_pattern || '%', '\'),
    CASE WHEN v_names THEN format('p.display_name ILIKE %L ESCAPE %L', p_pattern || '%', '\') ELSE 'false' END,
    format('(p.username ILIKE %L ESCAPE %L', '%' || p_pattern || '%', '\')
      || CASE WHEN v_names THEN format(' OR p.display_name ILIKE %L ESCAPE %L)', '%' || p_pattern || '%', '\') ELSE ')' END
  ];
  -- Words without three letters or digits in a row hold no trigram inside a handle or a name: the
  -- gatherings of who holds them anywhere (the one read's own, and the last closeness) then read by
  -- their one- and two-letter pieces (profiles_short_grams), never member by member through the house,
  -- the words' own test asked inside COALESCE so no plan reads a trigram index for them whole. A handle
  -- or a name that begins with them is found by its trigrams as before (a beginning has its own).
  IF p_pattern !~ '[[:alnum:]]{3}' AND private.pattern_grams(p_pattern) IS NOT NULL THEN
    v_short := format(' AND private.search_grams(p.username, p.display_name) @> %L::text[]', private.pattern_grams(p_pattern));
  END IF;
  -- Who holds the words at all (the one read's own WHERE), gathered once by the plan the words want,
  -- up to a thousand: when fewer hold them, the page is the one read's own over just those few, by id.
  EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                 CASE WHEN v_short = '' THEN v_tests[4] ELSE format('COALESCE(%s, false)', v_tests[4]) END, v_short)
    INTO v_few USING v_hidden;
  IF COALESCE(cardinality(v_few), 0) <= 1000 THEN
    RETURN QUERY
    SELECT m.id, m.username, m.avatar_url, m.role, m.closeness
      FROM (
        SELECT p.id, p.username, p.avatar_url, p.role,
               CASE WHEN p.username ILIKE p_pattern ESCAPE '\' THEN 0
                    WHEN p.username ILIKE p_pattern || '%' ESCAPE '\' THEN 1
                    WHEN v_names AND p.display_name ILIKE p_pattern || '%' ESCAPE '\' THEN 2
                    ELSE 3 END AS closeness
          FROM public.profiles p
         WHERE p.id = ANY (COALESCE(v_few, '{}'::uuid[]))
      ) m
     WHERE p_cursor_closeness IS NULL OR (m.closeness, m.username) > (p_cursor_closeness, p_cursor_username)
     ORDER BY m.closeness, m.username
     LIMIT v_limit;
    RETURN;
  END IF;
  -- More hold them: each closeness in turn, as far as the page needs. A member of a closeness meets its
  -- test and none of the closer ones; in the cursor's own closeness, it is past the cursor's handle (a
  -- member with no handle is never past it). Its members are gathered first, up to a thousand, by the
  -- plan the words want: fewer, and they are put in handle order themselves; more, and the closeness
  -- holds so many that its handles are walked in their own order (profiles_username_unique) and the
  -- page is met within the first few hundred. The walk asks its test as one the planner cannot weigh
  -- (COALESCE), so it is planned as a walk however few it guesses: its guess of a name's beginning
  -- once took 100,000 for 4, and sorted them all.
  FOR v_tier IN 0..3 LOOP
    IF (p_cursor_closeness IS NULL OR v_tier >= p_cursor_closeness) AND v_tests[v_tier + 1] <> 'false' THEN
      v_past := CASE WHEN v_tier = p_cursor_closeness THEN format(' AND p.username > %L', p_cursor_username) ELSE '' END;
      EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s%s%s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                     CASE WHEN v_short = '' OR v_tier < 3 THEN v_tests[v_tier + 1] ELSE format('COALESCE(%s, false)', v_tests[v_tier + 1]) END, v_not, v_past,
                     CASE WHEN v_tier = 3 THEN v_short ELSE '' END)
        INTO v_few USING v_hidden;
      IF COALESCE(cardinality(v_few), 0) <= 1000 THEN
        RETURN QUERY
        SELECT p.id, p.username, p.avatar_url, p.role, v_tier
          FROM public.profiles p
         WHERE p.id = ANY (COALESCE(v_few, '{}'::uuid[]))
         ORDER BY p.username
         LIMIT v_limit - v_got;
      ELSE
        RETURN QUERY EXECUTE format(
          'SELECT p.id, p.username, p.avatar_url, p.role, %s
             FROM public.profiles p
            WHERE COALESCE(%s, false)%s%s
              AND NOT COALESCE(p.id = ANY ($1), false)
            ORDER BY p.username
            LIMIT %s',
          v_tier, v_tests[v_tier + 1], v_not, v_past, v_limit - v_got)
        USING v_hidden;
      END IF;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_got := v_got + v_n;
      EXIT WHEN v_got >= v_limit;
    END IF;
    -- A closer test ruled out: one that is unknown was not met, so it rules nothing out.
    v_not := v_not || ' AND NOT COALESCE(' || v_tests[v_tier + 1] || ', false)';
  END LOOP;
END;
$$;

-- The new indexes' pieces, known to the planner.
-- add-only (1): no shipped client uses it: statistics, read by the planner alone
ANALYZE public.lists;
-- add-only (1): no shipped client uses it: statistics, read by the planner alone
ANALYZE public.profiles;
