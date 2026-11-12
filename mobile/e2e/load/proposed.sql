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
          (SELECT COUNT(DISTINCT g) FROM films_read, LATERAL unnest(films_read.genres) AS g) AS genres_count
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
