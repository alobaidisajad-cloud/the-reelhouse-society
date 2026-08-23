-- ════════════════════════════════════════════════════════════════════════════
-- get_public_profile_analytics — one character class, one live crash removed.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
-- The function guards `logs.year` with `year::text ~ '^\d+$'` before casting it
-- to int. That pattern is UNBOUNDED, so it also accepts a string of twenty
-- digits — and `'12345678901234567890'::int` raises 22003, "value out of range
-- for type integer".
--
-- Measured on PostgreSQL 18, not reasoned about:
--     SELECT '12345678901234567890' ~ '^\d+$';   ->  t
--     SELECT '12345678901234567890'::int;        ->  ERROR 22003
--
-- The cast happens inside the `user_logs` CTE, which every other branch of the
-- function reads from. So ONE malformed year anywhere in a member's logs takes
-- down the WHOLE payload: stamps, dna and autopsy_math together. The client
-- receives null and falls back — which since this pass means their achievement
-- badges are judged on whatever page happened to load, quietly wrong for
-- everyone but themselves.
--
-- A year is four digits. `{1,4}` says so, and cannot overflow.
--
-- ── WHY THIS IS A SEPARATE FILE ─────────────────────────────────────────────
-- It is a different function from the one migration 01 rewrites, and it is
-- somebody else's code. Kept apart so it can be applied, skipped or rolled back
-- on its own. Everything else in the body below is BYTE-IDENTICAL to what is
-- deployed — the only change is `+` to `{1,4}` on the line marked below.
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
          -- ⚠️ THE ONLY CHANGE IN THIS FILE: was `^\d+$`, which accepts a
          -- twenty-digit string and then overflows the int cast, aborting the
          -- entire payload for that member.
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
          EXISTS(SELECT 1 FROM user_logs GROUP BY film_id HAVING COUNT(*) > 1) AS has_rewatched
        FROM user_logs
      ),
      decades AS (
        SELECT (year_int / 10) * 10 AS decade, COUNT(*) AS c
        FROM user_logs
        WHERE year_int IS NOT NULL
        GROUP BY decade
        ORDER BY c DESC
        LIMIT 3
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
        FROM user_logs
        WHERE is_autopsied = true AND autopsy IS NOT NULL
      )
      SELECT jsonb_build_object(
        'stamps', (SELECT to_jsonb(s.*) FROM stamps s),
        'dna', (SELECT to_jsonb(d.*) FROM dna d),
        'autopsy_math', (SELECT to_jsonb(a.*) FROM autopsies a)
      )
    )
  END;
$function$;
