-- ════════════════════════════════════════════════════════════════════════════
-- 20261002_01 — every honour counts the member's whole record
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
-- The member file's honours (SOCIETY HONORS) and passport stamps are earned
-- from a member's whole record. This summary counted only some of it, and the
-- apps computed the rest from whatever logs they held:
--   · THE CRITIC (10 reviews): the full-history rows the app reads carry no
--     review, so it could never be earned on your own file.
--   · GENRE EXPLORER (5 genres): logs carry no genres at all, so no member
--     could ever earn it.
--   · MARATHON RUNNER and THE COMPLETIONIST were counted from the logs in hand:
--     for a visitor, the first fifty.
--   · THE RETURNER (rewatched a film) asked for two logs of one film. A rewatch
--     is kept on ONE log (status 'rewatched', its view count and history);
--     production held 0 films logged twice, 28 logs marked rewatched and 36
--     viewed more than once (2026-10-02). No member could earn it.
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────────
-- get_public_profile_analytics' stamps gain four counts over the whole record:
--   reviews_count      reviews longer than 20 characters (THE CRITIC)
--   genres_count       distinct genres of the films logged (GENRE EXPLORER)
--   busiest_day_count  the most films on one day (MARATHON RUNNER)
--   unrated_count      logs with no rating (THE COMPLETIONIST)
-- and has_rewatched reads a rewatch where it is kept. Nothing else changes: who
-- may read it (can_view_user_data), and every other figure, as before.
--
-- No transaction control here: the rehearsal
-- (mobile/supabase/diagnostics/every_honour_counts_the_whole_record_rehearsal.sql)
-- includes this file inside its own transaction.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_public_profile_analytics(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL OR NOT public.can_view_user_data(p_user_id)
      THEN '{"error": "forbidden"}'::jsonb
    ELSE (
      WITH user_logs AS (
        SELECT *,
          -- A year of one to four digits; anything else is not a year.
          CASE WHEN year::text ~ '^\d{1,4}$' THEN year::text::int END AS year_int
        FROM public.logs WHERE user_id = p_user_id
      ),
      stamps AS (
        SELECT
          COUNT(*) AS total_logs,
          COUNT(*) FILTER (WHERE year_int < 1960) AS pre_1960_count,
          COUNT(*) FILTER (WHERE rating = 5) AS perfect_ratings_count,
          bool_or(physical_media IS NOT NULL) AS has_physical_media,
          bool_or(status = 'abandoned') AS has_abandoned,
          COUNT(DISTINCT (year_int / 10) * 10) FILTER (WHERE year_int IS NOT NULL) AS decades_logged_count,
          -- A rewatch is kept on its log; two logs of one film count too.
          -- (coalesce: a member with no logs has rewatched nothing, not "unknown".)
          (coalesce(bool_or(status = 'rewatched' OR coalesce(view_count, 1) > 1), false)
            OR EXISTS (SELECT 1 FROM user_logs GROUP BY film_id HAVING COUNT(*) > 1)) AS has_rewatched,
          COUNT(*) FILTER (WHERE length(review) > 20) AS reviews_count,
          COUNT(*) FILTER (WHERE coalesce(rating, 0) <= 0) AS unrated_count,
          (SELECT coalesce(max(n), 0) FROM (
             SELECT COUNT(*) AS n FROM user_logs
              GROUP BY coalesce(watched_date, (created_at AT TIME ZONE 'UTC')::date)
           ) days) AS busiest_day_count,
          (SELECT COUNT(DISTINCT g) FROM (
             SELECT DISTINCT film_id FROM user_logs WHERE film_id > 0
           ) mine
           JOIN public.films f ON f.id = mine.film_id,
           LATERAL unnest(f.genres) AS g) AS genres_count
        FROM user_logs
      ),
      decades AS (
        SELECT (year_int / 10) * 10 AS decade, COUNT(*) AS c
        FROM user_logs WHERE year_int IS NOT NULL
        GROUP BY decade ORDER BY c DESC LIMIT 3
      ),
      dna AS (
        SELECT
          AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
          (SELECT jsonb_agg(jsonb_build_object(d.decade::text || 's', d.c)) FROM decades d) AS top_decades
        FROM user_logs
      ),
      autopsies AS (
        SELECT
          AVG(CASE WHEN (autopsy::jsonb) ? '_v'
                THEN COALESCE(((autopsy::jsonb)->>'story')::numeric, ((autopsy::jsonb)->>'screenplay')::numeric, ((autopsy::jsonb)->>'script')::numeric)
                ELSE NULLIF(COALESCE((autopsy::jsonb)->>'story', (autopsy::jsonb)->>'screenplay', (autopsy::jsonb)->>'script')::numeric, 0)
              END) AS avg_story,
          AVG(CASE WHEN (autopsy::jsonb) ? '_v'
                THEN COALESCE(((autopsy::jsonb)->>'cinematography')::numeric, ((autopsy::jsonb)->>'visuals')::numeric, ((autopsy::jsonb)->>'acting')::numeric)
                ELSE NULLIF(COALESCE((autopsy::jsonb)->>'cinematography', (autopsy::jsonb)->>'visuals', (autopsy::jsonb)->>'acting')::numeric, 0)
              END) AS avg_cinematography,
          AVG(CASE WHEN (autopsy::jsonb) ? '_v'
                THEN COALESCE(((autopsy::jsonb)->>'sound')::numeric, ((autopsy::jsonb)->>'score')::numeric, ((autopsy::jsonb)->>'editing')::numeric)
                ELSE NULLIF(COALESCE((autopsy::jsonb)->>'sound', (autopsy::jsonb)->>'score', (autopsy::jsonb)->>'editing')::numeric, 0)
              END) AS avg_sound
        FROM user_logs WHERE is_autopsied = true AND autopsy IS NOT NULL
      )
      SELECT jsonb_build_object(
        'stamps', (SELECT to_jsonb(s.*) FROM stamps s),
        'dna', (SELECT to_jsonb(d.*) FROM dna d),
        'autopsy_math', (SELECT to_jsonb(a.*) FROM autopsies a)
      )
    )
  END;
$function$;
