-- ════════════════════════════════════════════════════════════════════════════
-- Two functions: one that hands work to the reader, one that answers the
-- question the reader's work makes answerable.
-- ════════════════════════════════════════════════════════════════════════════

-- One transaction. Nothing here can half-apply and leave a function that exists
-- with privileges it should not have, or grants pointing at a function that was
-- never created.
BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- claim_films_to_sync — take work, exactly once
-- ════════════════════════════════════════════════════════════════════════════
-- Two people opening the app at the same moment means two workers reaching for
-- the same unread films. Without a claim they both spend a TMDB call on the
-- same row — wasteful at ten films, and at a hundred thousand it is the
-- difference between a backfill that finishes and one that thrashes.
--
-- `FOR UPDATE SKIP LOCKED` is the whole trick: a second worker arriving mid-
-- claim does not block and does not fail — it steps over the locked rows and
-- takes the next ones. Standard queue-in-Postgres, and it needs no queue.
--
-- ── WHY A CLAIM CAN GO STALE ────────────────────────────────────────────────
-- An edge worker can die between claiming and writing — a timeout, a deploy, a
-- cold start that never warms. Its claim would otherwise pin those films as
-- "someone is on it" for ever, and they would silently never be read again.
-- Ten minutes is far longer than a batch takes and short enough that nobody
-- notices the delay.
CREATE OR REPLACE FUNCTION public.claim_films_to_sync(p_limit integer DEFAULT 20)
 RETURNS TABLE (id integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
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
      WHERE c.synced_at IS NULL
        -- Three strikes. A film TMDB has no answer for stops being asked, or
        -- it eventually becomes the only thing the sync ever does.
        AND c.sync_failed < 3
        AND (c.sync_claimed_at IS NULL OR c.sync_claimed_at < now() - interval '10 minutes')
      ORDER BY c.id
      LIMIT v_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING f.id;
END;
$$;

-- Only the service role reads the worklist. `authenticated` must not be able to
-- claim: it would let any member stall the sync by claiming everything.
REVOKE ALL ON FUNCTION public.claim_films_to_sync(integer) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- mark_film_sync_failed — count a strike, atomically
-- ════════════════════════════════════════════════════════════════════════════
-- `sync_failed = sync_failed + 1` cannot be expressed through PostgREST, which
-- only sends values it already knows. Doing it in two steps — read, then write
-- — would lose a strike whenever two workers touched the same retired film, and
-- a film that never quite reaches three strikes is retried for ever.
--
-- Only called for a 404/401/403: TMDB has no answer for this id and never will.
-- A rate limit or a network blip must NOT come through here, or a good film
-- gets retired after three busy afternoons.
CREATE OR REPLACE FUNCTION public.mark_film_sync_failed(p_film_id integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.films
     SET sync_failed = sync_failed + 1,
         sync_claimed_at = NULL
   WHERE id = p_film_id;
$$;

REVOKE ALL ON FUNCTION public.mark_film_sync_failed(integer) FROM PUBLIC, anon, authenticated;

-- ── The writer's privileges, stated rather than inherited ───────────────────
-- Supabase's default privileges would grant these anyway, but a table whose
-- whole point is that members cannot write to it should say out loud who can.
GRANT SELECT, INSERT, UPDATE ON public.films TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_films_to_sync(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_film_sync_failed(integer) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- get_taste_profile — genres, actors and directors over the WHOLE archive
-- ════════════════════════════════════════════════════════════════════════════
-- What the phone was doing sixty films at a time, done once, on the server,
-- over everything. Roughly 2KB back regardless of whether the member has fifty
-- films or fifty thousand.
--
-- ── IT REPORTS ITS OWN COVERAGE, AND THAT IS THE POINT ──────────────────────
-- On the first day this ships, most films are still stubs. Aggregating three
-- known films out of two thousand would produce a confident, beautifully drawn,
-- completely false portrait of somebody's taste — the exact failure this whole
-- pass exists to remove, reintroduced in a new place.
--
-- So it returns `films_total` and `films_known` alongside the answer, and the
-- client is required to show "reading your archive — 412 of 2,481" instead of
-- a fingerprint until coverage is high. Same rule as everywhere else: a thing
-- is stated only when it is knowable.
--
-- DISTINCT film_id, not row count: a member who has watched a film four times
-- has one film in their taste, not four. Counting rows would let a single
-- rewatched favourite dominate a top five.
CREATE OR REPLACE FUNCTION public.get_taste_profile(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  result JSON;
BEGIN
  -- The same gate the other three use, so all four agree on who may see what.
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

    -- Billing order is preserved in the array but ignored here on purpose:
    -- "who do I watch most" is a count, not a weighting. A member's favourite
    -- character actor should not lose to a lead they saw once.
    --
    -- Grouped by ID, not by name — two people share a name more often than you
    -- would think, and merging them would invent someone. The name and face
    -- come along by MAX() purely to have a value; within one id they are the
    -- same person, and taking the most recent non-null profile means a face
    -- survives even if one film's credits happened to lack it.
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

    -- Minutes. The parked "what fits in 90 minutes?" idea needs exactly this,
    -- and it is free here.
    'total_runtime', (SELECT COALESCE(SUM(runtime), 0) FROM known WHERE runtime > 0)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_taste_profile(uuid) TO anon, authenticated;

COMMIT;
