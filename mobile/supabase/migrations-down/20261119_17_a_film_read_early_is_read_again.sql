-- Undo of 20261119_17: a film read too early is read again, and a taste counts a film known only with its details, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- Undo of H-C5: the claim takes only the films never read (or read before popularity was kept), and
-- films_known counts every film read, as before round 13.
-- add-only (1): no shipped client uses it: dropped only to put back the answer production ran before round 13 (live-schema.sql), asked by sync-films alone
DROP FUNCTION IF EXISTS public.claim_films_to_sync(integer);
CREATE FUNCTION public.claim_films_to_sync(p_limit integer DEFAULT 20) RETURNS TABLE(id integer)
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
-- add-only (1): no shipped client uses it: the claim's grants as production holds them (live-schema.sql)
REVOKE ALL ON FUNCTION public.claim_films_to_sync(integer) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.claim_films_to_sync(integer) TO service_role;

-- add-only (3): it only puts back the definition production ran before round 13 (live-schema.sql)
CREATE OR REPLACE FUNCTION public.get_taste_profile(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.can_view_user_data(p_user_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  WITH mine AS (
    SELECT DISTINCT l.film_id
      FROM public.logs l
     WHERE l.user_id = p_user_id AND l.film_id > 0
  ),
  known AS (
    SELECT f.*
      FROM public.films f
      JOIN mine m ON m.film_id = f.id
     WHERE f.synced_at IS NOT NULL
  )
  SELECT json_build_object(
    'films_total', (SELECT COUNT(*) FROM mine),
    'films_known', (SELECT COUNT(*) FROM known),

    'genres', (
      SELECT COALESCE(json_agg(row_to_json(g)), '[]'::json) FROM (
        SELECT genre AS name, COUNT(*) AS count
          FROM known, LATERAL unnest(known.genres) AS genre
         GROUP BY genre
         ORDER BY count DESC, genre
         LIMIT 12
      ) g
    ),

    'actors', (
      SELECT COALESCE(json_agg(row_to_json(a)), '[]'::json) FROM (
        SELECT p.id,
               MAX(p.name) AS name,
               MAX(p.profile) AS profile_path,
               COUNT(*) AS count
          FROM known,
               LATERAL unnest(known.cast_ids, known.cast_names, known.cast_profiles)
                    AS p(id, name, profile)
         WHERE p.id IS NOT NULL AND p.name IS NOT NULL AND p.name <> ''
         GROUP BY p.id
         ORDER BY count DESC, name
         LIMIT 10
      ) a
    ),

    'directors', (
      SELECT COALESCE(json_agg(row_to_json(d)), '[]'::json) FROM (
        SELECT director_id AS id,
               MAX(director) AS name,
               MAX(director_profile) AS profile_path,
               COUNT(*) AS count
          FROM known
         WHERE director_id IS NOT NULL AND director IS NOT NULL AND director <> ''
         GROUP BY director_id
         ORDER BY count DESC, name
         LIMIT 10
      ) d
    ),

    'countries', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) FROM (
        SELECT code, COUNT(*) AS count
          FROM known, LATERAL unnest(known.country_codes) AS code
         GROUP BY code
         ORDER BY count DESC, code
         LIMIT 20
      ) c
    ),

    'total_runtime', (SELECT COALESCE(SUM(runtime), 0) FROM known WHERE runtime > 0)
  ) INTO result;

  RETURN result;
END;
$$;
