-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_26 — the Reel's stack search reads its page by id, and asks many by a bounded walk first.
-- ════════════════════════════════════════════════════════════════════════════
--   get_filtered_stacks_auth_cursor_v2 joined its page of sixty to every stack of the house: the planner
--   hashed the whole of lists to find them (20,000 stacks read at 100,000 members, 102,174 rows at
--   500,000, load 44985355298). Now each stack of the page is read by its id. And a search of words
--   many stacks hold was first counted by the indexes that gather every holder: "m1", a piece of many
--   handles, gathered 11,112 members of 100,000 from the short pieces' index before the first was kept.
--   Now the newest 300 public stacks are asked first, by title and author's handle, as the walk asks
--   them: when enough of them hold the words that the walk meets its page within some 2,000 stacks, the
--   search walks, as it would have after counting, and no gathering index is read. The same stacks in the same order, for every search.
--   One function replaced; no table is locked.
-- Undo: mobile/supabase/migrations-down/20261122_26_the_reels_stack_search_reads_its_page_by_id.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- As 20261122_15 left it, but the page is read by id and many is asked of the newest stacks first.
-- add-only (3): it only fixes: the same stacks in the same order for every search (the rehearsal replays each search and compares it with the old reading); TestFlight build 41 and the website read it as before
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
  -- Asked first of the newest 300 public stacks, each asked the words by its title and its author's
  -- handle: when three in twenty of a page's worth hold them (9 for 60), the words are held by one stack
  -- in about 33 or more, so the walk meets its page within some 2,000 stacks, and no index that gathers
  -- every holder is read ("m1" gathered 11,112 members of 100,000 from the short pieces, in
  -- proportion to the house).
  many AS MATERIALIZED (
    SELECT CASE WHEN COALESCE(p_search, '') = '' OR (p_search !~ '[[:alnum:]]{3}' AND (SELECT grams FROM short) IS NULL) THEN true
                WHEN (SELECT count(*) FROM (
                        SELECT 1 FROM (SELECT l.title, l.user_id FROM lists l
                                        WHERE l.is_private = false
                                        ORDER BY l.created_at DESC, l.id DESC
                                        LIMIT 300) w
                         WHERE COALESCE(w.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
                            OR COALESCE((SELECT pu.username FROM profiles pu WHERE pu.id = w.user_id)
                                          ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\', false)
                         LIMIT GREATEST(p_limit * 3 / 20, 1)) newest) >= GREATEST(p_limit * 3 / 20, 1) THEN true
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
  -- Each stack of the page read by its id (OFFSET 0 keeps it a lookup per stack): never every stack of
  -- the house hashed to be joined to a page of sixty.
  CROSS JOIN LATERAL (SELECT l.id, l.title, l.description, l.user_id, l.created_at, l.is_ranked
                        FROM lists l WHERE l.id = pg.id OFFSET 0) l
  JOIN profiles p ON p.id = l.user_id
  ORDER BY l.created_at DESC, l.id DESC;
$$;
