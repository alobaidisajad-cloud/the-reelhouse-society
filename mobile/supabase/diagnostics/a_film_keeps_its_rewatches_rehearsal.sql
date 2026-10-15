-- ════════════════════════════════════════════════════════════════════════════
-- a_film_keeps_its_rewatches_rehearsal.sql — 20261003_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_film_keeps_its_rewatches_rehearsal.sql
--
-- The newest log of a member in good standing, given a review of the longest
-- length the apps allow, is rewatched twelve times by its member, each with a
-- review as long: the history's ceiling keeps all twelve. Production runs it by
-- hand; db-integration.yml runs it on the sealed copy (e2e/db/rehearsals.mjs).
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

CREATE TEMP TABLE r_log ON COMMIT DROP AS
SELECT l.id, l.user_id FROM public.logs l JOIN public.profiles p ON p.id = l.user_id
 WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
 ORDER BY l.created_at DESC LIMIT 1;
SELECT pg_temp.rh_need('log by a member in good standing', (SELECT count(*) FROM r_log), 1) AS done \gset rh_
UPDATE public.logs SET review = repeat('A long review. ', 333) WHERE id = (SELECT id FROM r_log);

CREATE TEMP TABLE r_kept (n int, ok boolean, why text) ON COMMIT DROP;
GRANT ALL ON r_kept TO authenticated;
GRANT SELECT ON r_log TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM r_log), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
DECLARE i int; log_id uuid := (SELECT id FROM r_log);
BEGIN
  FOR i IN 1..12 LOOP
    BEGIN
      PERFORM public.log_viewing_add(log_id, gen_random_uuid(),
        jsonb_build_object('review', repeat('Seen again, at length. ', 217), 'rating', 4));
      INSERT INTO r_kept VALUES (i, true, NULL);
    EXCEPTION WHEN others THEN
      INSERT INTO r_kept VALUES (i, false, SQLERRM);
    END;
  END LOOP;
END $$;
RESET ROLE;

DO $$ BEGIN
  PERFORM pg_temp.rh_case('twelve rewatches at the longest length are all kept', '12 kept, 0 refused',
    (SELECT format('%s kept, %s refused', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM r_kept)
    || coalesce(' (first refusal: ' || (SELECT why FROM r_kept WHERE NOT ok ORDER BY n LIMIT 1) || ')', ''));
  RAISE NOTICE 'the history is % characters long',
    (SELECT char_length(viewing_history::text) FROM public.logs WHERE id = (SELECT id FROM r_log));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
