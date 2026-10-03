-- ════════════════════════════════════════════════════════════════════════════
-- 20261002_03 — the OBSCURITY INDEX is measured, not made up.
-- ════════════════════════════════════════════════════════════════════════════
-- The Cinema DNA card printed an OBSCURITY INDEX worked out from the member's
-- average rating and film count (40 + (5 − avg) × 12 + min(count, 30)): a
-- number that said nothing about how obscure their films are.
--
-- Now:
--   · films keeps each film's TMDB popularity, read by sync-films with the rest
--     of the film. Films read before this are read again (the claim also takes
--     a film with no popularity), without ever being marked unread;
--   · get_public_profile_analytics' dna gains obscurity_index — the average,
--     over the member's distinct films that have been read, of the film page's
--     own obscurity mark (obscurityScore in the apps: 99 for a film nobody
--     looks at, down to 2 for the most looked at) — and obscurity_films, how
--     many films it is measured over. Until a film is read, it is not counted;
--     with none read, the index is null and the card says so.
-- Nothing else in the summary changes.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.films ADD COLUMN IF NOT EXISTS popularity numeric;

-- The outstanding films: never read, or read before popularity was kept.
DROP INDEX IF EXISTS public.idx_films_unsynced;
CREATE INDEX idx_films_unsynced ON public.films USING btree (id)
  WHERE ((synced_at IS NULL OR popularity IS NULL) AND sync_failed < 3);

CREATE OR REPLACE FUNCTION public.claim_films_to_sync(p_limit integer DEFAULT 20) RETURNS TABLE(id integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
  RETURN QUERY
  UPDATE public.films f
     SET sync_claimed_at = now()
   WHERE f.id IN (
     SELECT c.id
       FROM public.films c
      WHERE (c.synced_at IS NULL OR c.popularity IS NULL)
        AND c.sync_failed < 3
        AND (c.sync_claimed_at IS NULL OR c.sync_claimed_at < now() - interval '10 minutes')
      ORDER BY c.synced_at IS NOT NULL, c.id
      LIMIT v_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING f.id;
END;
$$;

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
      -- The film page's obscurity mark (obscurityScore), for each film read.
      obscurity AS (
        SELECT
          round(avg(CASE WHEN f.popularity <= 0 THEN 99
                         ELSE greatest(2, least(99, round(100 - (log(greatest(f.popularity, 1)) / log(5000)) * 98)))
                    END)) AS obscurity_index,
          COUNT(*) AS obscurity_films
        FROM (SELECT DISTINCT film_id FROM user_logs WHERE film_id > 0) mine
        JOIN public.films f ON f.id = mine.film_id
        WHERE f.popularity IS NOT NULL
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
