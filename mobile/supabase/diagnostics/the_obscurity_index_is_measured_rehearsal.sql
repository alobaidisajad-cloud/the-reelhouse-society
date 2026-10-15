-- ════════════════════════════════════════════════════════════════════════════
-- the_obscurity_index_is_measured_rehearsal.sql — 20261002_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/the_obscurity_index_is_measured_rehearsal.sql
--
-- One member's films are given no popularity, then known popularities (as
-- sync-films would write them), and the index is read back as the film page
-- would; the sync takes a film read before popularity was kept, and leaves a
-- measured one alone. Production runs it by hand; db-integration.yml runs it
-- on the sealed copy (e2e/db/rehearsals.mjs). Read each NOTICE as
-- case|expected|got ; the last line is the verdict, and any miss makes psql
-- exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- 1. One member's films, given known popularities, read back as the film page would.
CREATE TEMP TABLE ob_member ON COMMIT DROP AS
  SELECT l.user_id AS id, count(DISTINCT l.film_id) AS films
    FROM public.logs l JOIN public.films f ON f.id = l.film_id
   WHERE l.film_id > 0
   GROUP BY l.user_id ORDER BY count(DISTINCT l.film_id) DESC, l.user_id LIMIT 1;
SELECT pg_temp.rh_need('member whose logs name a known film', (SELECT count(*) FROM ob_member), 1) AS done \gset rh_

DO $$
DECLARE
  m uuid := (SELECT id FROM ob_member);
  n integer := (SELECT films FROM ob_member);
  got jsonb;
  pop numeric;
  want text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  UPDATE public.films SET popularity = NULL WHERE id IN (SELECT film_id FROM public.logs WHERE user_id = m AND film_id > 0);
  got := public.get_public_profile_analytics(m)->'dna';
  PERFORM pg_temp.rh_case('no film measured: the index is null, over 0 films', 'null/0',
    CASE WHEN got ? 'obscurity_index' THEN (got->'obscurity_index')::text ELSE 'absent' END || '/' || coalesce(got->>'obscurity_films', 'absent'));
  FOREACH pop IN ARRAY ARRAY[5000, 1, 0, sqrt(5000::numeric)] LOOP
    UPDATE public.films SET popularity = pop
     WHERE id IN (SELECT film_id FROM public.logs WHERE user_id = m AND film_id > 0);
    got := public.get_public_profile_analytics(m)->'dna';
    want := CASE WHEN pop = 5000 THEN '2' WHEN pop = 1 THEN '99' WHEN pop = 0 THEN '99' ELSE '51' END;
    PERFORM pg_temp.rh_case(format('every film at popularity %s reads %s', round(pop, 2), want), want, got->>'obscurity_index');
  END LOOP;
  PERFORM pg_temp.rh_case('measured over the member''s distinct films', n::text, got->>'obscurity_films');
END $$;

-- 2. The sync takes a film read before popularity was kept — unread films first.
SELECT pg_temp.rh_need('film the sync has read', (SELECT count(*) FROM public.films WHERE synced_at IS NOT NULL), 1) AS done \gset rh_
DO $$
DECLARE taken integer[];
BEGIN
  UPDATE public.films SET popularity = NULL, sync_claimed_at = NULL, sync_failed = 0
   WHERE id = (SELECT min(id) FROM public.films WHERE synced_at IS NOT NULL);
  SELECT array_agg(c.id) INTO taken FROM public.claim_films_to_sync(100) c;
  PERFORM pg_temp.rh_case('a film read before popularity is read again', 'true',
    ((SELECT min(id) FROM public.films WHERE synced_at IS NOT NULL) = ANY(taken))::text);
  PERFORM pg_temp.rh_case('a read film that has its popularity is left alone', '0',
    (SELECT count(*) FROM public.films WHERE id = ANY(taken) AND synced_at IS NOT NULL AND popularity IS NOT NULL)::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
