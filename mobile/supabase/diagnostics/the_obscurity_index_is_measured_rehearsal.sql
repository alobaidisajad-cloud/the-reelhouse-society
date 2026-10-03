-- ════════════════════════════════════════════════════════════════════════════
-- the_obscurity_index_is_measured_rehearsal.sql — 20261002_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/the_obscurity_index_is_measured_rehearsal.sql
--
-- Every member's summary is read as that member before and after the
-- migration; then one member's films are given known popularities (as
-- sync-films would write them) and the index is read back. Without with_fix
-- there is no obscurity_index and the cases on it FAIL: the rehearsal can say
-- no. Read each NOTICE as  case | expected | got. The last line counts failures.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE ob_cast ON COMMIT DROP AS
  SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id;
CREATE TEMP TABLE ob_before (id uuid, out jsonb) ON COMMIT DROP;
CREATE TEMP TABLE ob_after  (id uuid, out jsonb) ON COMMIT DROP;
CREATE TEMP TABLE ob_cases (label text, expected text, got text) ON COMMIT DROP;

DO $$
DECLARE m uuid;
BEGIN
  FOR m IN SELECT id FROM ob_cast LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
    INSERT INTO ob_before SELECT m, public.get_public_profile_analytics(m);
  END LOOP;
END $$;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261002_03_the_obscurity_index_is_measured.sql
\endif

DO $$
DECLARE m uuid;
BEGIN
  FOR m IN SELECT id FROM ob_cast LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
    INSERT INTO ob_after SELECT m, public.get_public_profile_analytics(m);
  END LOOP;
END $$;

-- 1. Nothing that was there has moved.
INSERT INTO ob_cases
SELECT 'every old figure unchanged, for every member', '0',
       COUNT(*) FILTER (WHERE
         b.out->'stamps' IS DISTINCT FROM a.out->'stamps'
         OR (b.out->'dna') IS DISTINCT FROM ((a.out->'dna') - 'obscurity_index' - 'obscurity_films')
         OR b.out->'autopsy_math' IS DISTINCT FROM a.out->'autopsy_math')::text
FROM ob_before b JOIN ob_after a USING (id);

-- 2. With no film read for popularity yet, no member has an index.
INSERT INTO ob_cases
SELECT 'no film measured: the index is null, over 0 films', '0',
       COUNT(*) FILTER (WHERE NOT (a.out->'dna' ? 'obscurity_index')
                          OR a.out->'dna'->'obscurity_index' <> 'null'::jsonb
                          OR coalesce(a.out->'dna'->>'obscurity_films', 'x') <> '0')::text
FROM ob_after a WHERE a.out ? 'dna';

-- 3. One member's films, given known popularities, read back as the film page would.
CREATE TEMP TABLE ob_member ON COMMIT DROP AS
  SELECT l.user_id AS id, count(DISTINCT l.film_id) AS films
    FROM public.logs l JOIN public.films f ON f.id = l.film_id
   WHERE l.film_id > 0
   GROUP BY l.user_id ORDER BY count(DISTINCT l.film_id) DESC LIMIT 1;

DO $$
DECLARE
  m uuid := (SELECT id FROM ob_member);
  n integer := (SELECT films FROM ob_member);
  got jsonb;
  pop numeric;
  want text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  FOREACH pop IN ARRAY ARRAY[5000, 1, 0, sqrt(5000::numeric)] LOOP
    UPDATE public.films SET popularity = pop
     WHERE id IN (SELECT film_id FROM public.logs WHERE user_id = m AND film_id > 0);
    got := public.get_public_profile_analytics(m)->'dna';
    want := CASE WHEN pop = 5000 THEN '2' WHEN pop = 1 THEN '99' WHEN pop = 0 THEN '99' ELSE '51' END;
    INSERT INTO ob_cases VALUES (format('every film at popularity %s reads %s', round(pop, 2), want), want, got->>'obscurity_index');
  END LOOP;
  INSERT INTO ob_cases VALUES ('measured over the member''s distinct films', n::text, got->>'obscurity_films');
END $$;

-- 4. The sync takes a film read before popularity was kept — unread films first.
DO $$
DECLARE taken integer[];
BEGIN
  UPDATE public.films SET popularity = NULL, sync_claimed_at = NULL, sync_failed = 0
   WHERE id = (SELECT min(id) FROM public.films WHERE synced_at IS NOT NULL);
  SELECT array_agg(c.id) INTO taken FROM public.claim_films_to_sync(100) c;
  INSERT INTO ob_cases VALUES ('a film read before popularity is read again', 'true',
    ((SELECT min(id) FROM public.films WHERE synced_at IS NOT NULL) = ANY(taken))::text);
  INSERT INTO ob_cases VALUES ('a read film that has its popularity is left alone', '0',
    (SELECT count(*) FROM public.films WHERE id = ANY(taken) AND synced_at IS NOT NULL AND popularity IS NOT NULL)::text);
END $$;

DO $$
DECLARE c record; failed integer := 0;
BEGIN
  FOR c IN SELECT * FROM ob_cases LOOP
    RAISE NOTICE '% | % | %', c.label, c.expected, c.got;
    IF c.got IS DISTINCT FROM c.expected THEN failed := failed + 1; END IF;
  END LOOP;
  RAISE NOTICE 'FAILED: %', failed;
END $$;

ROLLBACK;
