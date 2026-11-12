-- ════════════════════════════════════════════════════════════════════════════
-- e2e/load/proposed.sql — a database change under MEASUREMENT, not a migration.
-- ════════════════════════════════════════════════════════════════════════════
-- load.yml applies this to its throwaway copy of production (100,000 members,
-- after the fidelity check) so a speed fix is measured at scale BEFORE anyone
-- applies it to production. It is never run against production. When it is
-- applied there, it moves to supabase/migrations under its own name and this
-- file is emptied.
--
-- Under measurement (2026-11-12): the profile's honours and passport,
-- get_public_profile_analytics, for the whale's 10,000 logs (51.6 ms at 500,000
-- members, load 42924788249; 55 in 42969529684). The same answer, less work:
--   · each log carries only what is counted (today every column, the review's
--     text and the viewing history among them, is held for every pass);
--   · the films a member logged are joined once, for the genres and the
--     obscurity both (today twice);
--   · the autopsy is read once per log.
-- Load 43255933243 (100k): 73.2 -> 60.7 ms. Its plan: the logs 11.9 ms, the
-- films' 10,000 lookups 21.9, the genres' COUNT(DISTINCT) a sort of 20,000
-- names, ~20 ms: now grouped (a hash of ~20), measured on the next push.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_public_profile_analytics(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  SELECT CASE
    WHEN auth.uid() IS NULL OR NOT public.can_view_user_data(p_user_id)
      THEN '{"error": "forbidden"}'::jsonb
    ELSE (
      WITH user_logs AS MATERIALIZED (
        SELECT film_id, rating, status, view_count,
          physical_media IS NOT NULL AS on_media,
          length(review) > 20 AS reviewed,
          coalesce(watched_date, (created_at AT TIME ZONE 'UTC')::date) AS on_day,
          -- A year of one to four digits; anything else is not a year.
          CASE WHEN year ~ '^\d{1,4}$' THEN year::int END AS year_int,
          CASE WHEN is_autopsied = true THEN autopsy END AS autopsy
        FROM public.logs WHERE user_id = p_user_id
      ),
      -- The films this member logged, each once, joined once.
      films_read AS MATERIALIZED (
        SELECT f.popularity, f.genres
        FROM (SELECT DISTINCT film_id FROM user_logs WHERE film_id > 0) mine
        JOIN public.films f ON f.id = mine.film_id
      ),
      stamps AS (
        SELECT
          COUNT(*) AS total_logs,
          COUNT(*) FILTER (WHERE year_int < 1960) AS pre_1960_count,
          COUNT(*) FILTER (WHERE rating = 5) AS perfect_ratings_count,
          bool_or(on_media) AS has_physical_media,
          bool_or(status = 'abandoned') AS has_abandoned,
          COUNT(DISTINCT (year_int / 10) * 10) FILTER (WHERE year_int IS NOT NULL) AS decades_logged_count,
          -- A rewatch is kept on its log; two logs of one film count too.
          -- (coalesce: a member with no logs has rewatched nothing, not "unknown".)
          (coalesce(bool_or(status = 'rewatched' OR coalesce(view_count, 1) > 1), false)
            OR EXISTS (SELECT 1 FROM user_logs GROUP BY film_id HAVING COUNT(*) > 1)) AS has_rewatched,
          COUNT(*) FILTER (WHERE reviewed) AS reviews_count,
          COUNT(*) FILTER (WHERE coalesce(rating, 0) <= 0) AS unrated_count,
          (SELECT coalesce(max(n), 0) FROM (
             SELECT COUNT(*) AS n FROM user_logs GROUP BY on_day
           ) days) AS busiest_day_count,
          -- Grouped, not sorted: COUNT(DISTINCT) sorted the whale's 20,000 genre names to find ~20.
          (SELECT COUNT(*) FROM (
             SELECT g FROM films_read, LATERAL unnest(films_read.genres) AS g
             WHERE g IS NOT NULL GROUP BY g
           ) kinds) AS genres_count
        FROM user_logs
      ),
      decades AS (
        SELECT (year_int / 10) * 10 AS decade, COUNT(*) AS c
        FROM user_logs WHERE year_int IS NOT NULL
        GROUP BY decade ORDER BY c DESC LIMIT 3
      ),
      -- The film page's obscurity mark (obscurityScore), for each film read.
      obscurity AS (
        SELECT
          round(avg(CASE WHEN popularity <= 0 THEN 99
                         ELSE greatest(2, least(99, round(100 - (log(greatest(popularity, 1)) / log(5000)) * 98)))
                    END)) AS obscurity_index,
          COUNT(*) AS obscurity_films
        FROM films_read
        WHERE popularity IS NOT NULL
      ),
      dna AS (
        SELECT
          AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
          (SELECT jsonb_agg(jsonb_build_object(d.decade::text || 's', d.c)) FROM decades d) AS top_decades,
          (SELECT o.obscurity_index FROM obscurity o) AS obscurity_index,
          (SELECT o.obscurity_films FROM obscurity o) AS obscurity_films
        FROM user_logs
      ),
      autopsies AS (
        SELECT
          AVG(CASE WHEN autopsy ? '_v'
                THEN COALESCE((autopsy->>'story')::numeric, (autopsy->>'screenplay')::numeric, (autopsy->>'script')::numeric)
                ELSE NULLIF(COALESCE(autopsy->>'story', autopsy->>'screenplay', autopsy->>'script')::numeric, 0)
              END) AS avg_story,
          AVG(CASE WHEN autopsy ? '_v'
                THEN COALESCE((autopsy->>'cinematography')::numeric, (autopsy->>'visuals')::numeric, (autopsy->>'acting')::numeric)
                ELSE NULLIF(COALESCE(autopsy->>'cinematography', autopsy->>'visuals', autopsy->>'acting')::numeric, 0)
              END) AS avg_cinematography,
          AVG(CASE WHEN autopsy ? '_v'
                THEN COALESCE((autopsy->>'sound')::numeric, (autopsy->>'score')::numeric, (autopsy->>'editing')::numeric)
                ELSE NULLIF(COALESCE(autopsy->>'sound', autopsy->>'score', autopsy->>'editing')::numeric, 0)
              END) AS avg_sound
        FROM user_logs WHERE autopsy IS NOT NULL
      )
      SELECT jsonb_build_object(
        'stamps', (SELECT to_jsonb(s.*) FROM stamps s),
        'dna', (SELECT to_jsonb(d.*) FROM dna d),
        'autopsy_math', (SELECT to_jsonb(a.*) FROM autopsies a)
      )
    )
  END;
$_$;

-- ════════════════════════════════════════════════════════════════════════════
-- Under measurement (2026-11-12): the Reel's stacks, searched,
-- get_filtered_stacks_auth_cursor_v2 (87.4 ms at 100,000, load 43255933243,
-- the slowest read left there). Its plan: the stacks walked newest first by
-- idx_lists_created_at_id_desc, ~28,000 buffers, each asked the title match OR
-- the author's handle match, until 60 pass: a rare word reads most of the
-- table, and lists_title_trigram (built for this) is never used, because the
-- OR with the handle and the empty search hides it. The same answer:
--   · no search: the same walk as today;
--   · a search: the matches read by the trigram indexes (the title's, and the
--     authors' handles', then their stacks), sorted newest first BEFORE any
--     per-stack check, then checked lazily in that order until the page is
--     full (a word every stack has stops at 60, as the walk did).
-- Made under its own name, beside today's, so probe.mjs times both on the same
-- runner in the same run (a rare word, a word every stack has, a handle); the
-- migration, if it earns one, replaces get_filtered_stacks_auth_cursor_v2.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_proposed(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_poster_count integer DEFAULT 4) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, film_count bigint, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH
  -- The matches of a search, newest first, before anything is asked of them.
  matched AS MATERIALIZED (
    SELECT m.id, m.created_at, m.user_id FROM (
      SELECT l.id, l.created_at, l.user_id
        FROM lists l
       WHERE COALESCE(p_search, '') <> '' AND l.is_private = false
         AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM profiles pu JOIN lists l ON l.user_id = pu.id
       WHERE COALESCE(p_search, '') <> '' AND l.is_private = false
         AND pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
    ) m
     WHERE p_cursor_created_at IS NULL OR (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id)
     ORDER BY m.created_at DESC, m.id DESC
  ),
  page AS (
    (SELECT l.id, l.created_at
       FROM lists l
      WHERE COALESCE(p_search, '') = ''
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
