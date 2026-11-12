-- ════════════════════════════════════════════════════════════════════════════
-- 20261112_01 — the honours and passport read with less work per log.
-- ════════════════════════════════════════════════════════════════════════════
--   get_public_profile_analytics held every column of every log (the review's
--   text, the viewing history) for each of its passes, joined the films twice,
--   and counted the genres by sorting every name (COUNT DISTINCT): the whale's
--   10,000 logs took 73.2 ms at 100,000 members (load 42864988311). The same
--   answer now carries only what is counted, joins the films once for the genres
--   and the obscurity both, reads the autopsy once, and counts the genres by
--   grouping: 59.2 ms (load 43279500784; the logs' own read is 11.6 of it). The
--   rehearsal holds every member it reads, as each sees their own, to the answer
--   the function gave before.
-- Undo: mobile/supabase/migrations-down/20261112_01_the_honours_read_less.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the calls replayed, each member's honours as they ask for their own, before and after, the same (the_honours_read_less_rehearsal.sql)
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
