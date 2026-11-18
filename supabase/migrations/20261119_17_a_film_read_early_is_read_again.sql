-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_17 — a film read too early is read again, and a taste counts a film known only with its details.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A film read before TMDB had its credits was never read again: the claim takes it again when its
--      time comes, after every film nobody has read (review round 13).
--   2. A blank film was counted known in Taste DNA's coverage: it is counted known only with its
--      genres, director and cast, or once TMDB's word on it is settled (review round 13).
--   Functions only; the columns are 20261119_03's, and the claim's index 20261119_04's.
-- Undo: mobile/supabase/migrations-down/20261119_17_a_film_read_early_is_read_again.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-C5 · a film read too early is read again, and a taste counts a film known only with its details (review round 13) ──
--   A film noted while only announced (watchlisted or stacked at its announcement) was read by
--   sync-films once, before TMDB had its credits and genres, and never again: claim_films_to_sync
--   took only a film never read (or read before popularity was kept). Every member who later
--   logged it got a Taste DNA and CINEMATIC INSIGHTS with its genres, director and cast missing,
--   while get_taste_profile counted it known (read at all), so the coverage line said the profile
--   was complete.
--   Now (with H-C5's columns, the car before, and its index, the car after):
--     · the claim takes, after every film nobody has read yet, a film whose reread_after has come
--       (sync-films sets it at each read: a read before the film settled after its release, or one
--       missing its genres, director or cast, at most three times settled), and once each film
--       read before the house counted (sync_reads null) that may have been read too early: one
--       missing genres, director or cast, with no year, or of a year the house was reading in
--       (2026 on: films were first read on 2026-08-25). Oldest due first. No film is rewritten
--       here: each leaves the claim as it is read.
--     · the claim hands back each film's settled reads (sync_reads) with its id, so sync-films
--       decides the next read from the claim alone, with no read of its own.
--     · films_known counts a film unknown only while it has never been read, or was read only
--       before it settled (no settled read yet), unless it already has its genres, director and
--       cast: a film read before the house counted is settled if its year is before 2026 (the
--       house began reading on 2026-08-25). A settled film still missing some details (a castless
--       documentary) counts known at once; its re-reads go on in the background.
--   get_taste_profile keeps its name, argument, answer and grants. The claim keeps its name and
--   argument and adds a column to its answer: it is asked by sync-films alone.

-- add-only (1): no shipped client uses it: dropped only to add sync_reads to its answer, asked by sync-films alone with the service role (TestFlight build 41 and the website never call it; the deployed sync-films reads each row's id, which stays)
DROP FUNCTION IF EXISTS public.claim_films_to_sync(integer);
CREATE FUNCTION public.claim_films_to_sync(p_limit integer DEFAULT 20) RETURNS TABLE(id integer, sync_reads smallint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_taken integer;
BEGIN
  -- The films nobody has read yet (or read before popularity was kept): first, as before.
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
  RETURNING f.id, f.sync_reads;
  GET DIAGNOSTICS v_taken = ROW_COUNT;
  IF v_taken >= v_limit THEN
    RETURN;
  END IF;

  -- Then the films read too early, oldest due first: one whose reread_after has come, and one read
  -- before the house counted that may have been read too early. The condition is idx_films_reread's
  -- own, so the claim reads only the films it names. A film claimed above is held (claimed now).
  RETURN QUERY
  UPDATE public.films f
     SET sync_claimed_at = now()
   WHERE f.id IN (
     SELECT c.id
       FROM public.films c
      WHERE (c.reread_after IS NOT NULL
             OR (c.synced_at IS NOT NULL AND c.sync_reads IS NULL
                 AND (cardinality(c.genres) = 0 OR c.director_id IS NULL OR cardinality(c.cast_ids) = 0
                      OR c.year IS NULL OR c.year >= 2026)))
        AND c.sync_failed < 3
        AND COALESCE(c.reread_after, c.synced_at) <= now()
        AND (c.sync_claimed_at IS NULL OR c.sync_claimed_at < now() - interval '10 minutes')
      ORDER BY COALESCE(c.reread_after, c.synced_at), c.id
      LIMIT v_limit - v_taken
      FOR UPDATE SKIP LOCKED
   )
  RETURNING f.id, f.sync_reads;
END;
$$;
-- add-only (1): no shipped client uses it: the claim's grants as production holds them (live-schema.sql), re-stated after its drop; sync-films alone asks it with the service role, never TestFlight build 41 or the website
REVOKE ALL ON FUNCTION public.claim_films_to_sync(integer) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.claim_films_to_sync(integer) TO service_role;

-- add-only (3): it only fixes: every count and list is read as before, and films_known leaves out a film read with its genres, director or cast missing while it waits to be read again, as the H-C5 rehearsal replays as the member; TestFlight build 41 and the website read films_known as a count, as before
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
    -- Known once read with its details (genres, director, cast), or read once it had settled after
    -- its release; read before the house counted, settled when its year is before 2026. Unknown:
    -- read only before it settled, so its details may still come.
    'films_known', (SELECT COUNT(*) FROM known
                     WHERE (cardinality(known.genres) > 0 AND known.director_id IS NOT NULL AND cardinality(known.cast_ids) > 0)
                        OR known.sync_reads >= 1
                        OR (known.sync_reads IS NULL AND known.year < 2026)),

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
