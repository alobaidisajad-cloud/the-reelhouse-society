-- ════════════════════════════════════════════════════════════════════════════
-- e2e/load/proposed.sql — a database change under MEASUREMENT, not a migration.
-- ════════════════════════════════════════════════════════════════════════════
-- load.yml applies this to its throwaway copy of production (100,000 members,
-- after the fidelity check) so a speed fix is measured at scale BEFORE anyone
-- applies it to production. It is never run against production. When it is
-- applied there, it moves to supabase/migrations under its own name and this
-- file is emptied.
--
-- The honours and passport, measured here (load 43255933243, 43279500784: 73.2 ->
-- 59.2 ms at 100,000), are migration 20261112_01_the_honours_read_less.sql now.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- Under measurement (2026-11-12): the Reel's stacks, searched,
-- get_filtered_stacks_auth_cursor_v2 (87.4 ms at 100,000, load 43255933243,
-- the slowest read left there). Its plan: the stacks walked newest first by
-- idx_lists_created_at_id_desc, ~28,000 buffers, each asked the title match OR
-- the author's handle match, until 60 pass: a rare word reads most of the
-- table, and lists_title_trigram (built for this) is never used, because the
-- OR with the handle and the empty search hides it. The same answer:
--   · no search: the same walk as today;
--   · a search of few matches (under 1,000, counted by the trigram indexes):
--     the matches read by the trigram indexes (the title's, and the authors'
--     handles', then their stacks), sorted newest first BEFORE any per-stack
--     check, then checked lazily in that order until the page is full;
--   · a search of many: today's walk, which stops at its page at once.
-- Load 43284739569 (100k), the first form (matches always): a rare word 85.8 ->
-- 7.7 ms, a handle 292.7 -> 4.4, but a word every stack has 6.5 -> 94.7 (all
-- 20,000 sorted): hence the count, and the walk for many. Load 43292798767,
-- the count: a rare word 5.7, a common word 8.6, a handle 4.1, but "m1" 506.9
-- (two letters: no trigram, every member counted; today's 219.4, its IN (...)
-- reading every matching member): hence under three letters the walk at once,
-- and the walk's handle looked up per stack it reaches.
-- Made under its own name, beside today's, so probe.mjs times both on the same
-- runner in the same run (a rare word, a word every stack has, a handle); the
-- migration, if it earns one, replaces get_filtered_stacks_auth_cursor_v2.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_proposed(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_poster_count integer DEFAULT 4) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, film_count bigint, certify_count bigint, is_ranked boolean)
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
         AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM profiles pu JOIN lists l ON l.user_id = pu.id
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many) AND l.is_private = false
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
        AND NOT COALESCE(l.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
        AND public.can_view_user_data(l.user_id)
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
      WHERE NOT COALESCE(m.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
        AND public.can_view_user_data(m.user_id)
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
GRANT EXECUTE ON FUNCTION public.get_filtered_stacks_proposed(text, boolean, integer, timestamp with time zone, uuid, integer) TO authenticated;
