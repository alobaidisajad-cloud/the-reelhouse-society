-- ════════════════════════════════════════════════════════════════════════════
-- a_film_keeps_its_rewatches_rehearsal.sql — run against PRODUCTION, rolled back.
--   node rehearse.cjs supabase/diagnostics/a_film_keeps_its_rewatches_rehearsal.sql            (as it is)
--   node rehearse.cjs supabase/diagnostics/a_film_keeps_its_rewatches_rehearsal.sql with_fix   (with 20261003_04)
-- A member's log, given a review of the longest length the apps allow, is
-- rewatched twelve times by its member, each with a review as long. Without the
-- fix the history's ceiling refuses one of them; with it, all twelve are kept.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261003_04_a_film_keeps_its_rewatches.sql
\endif

CREATE TEMP TABLE r_log AS
SELECT l.id, l.user_id FROM public.logs l ORDER BY l.created_at DESC LIMIT 1;
UPDATE public.logs SET review = repeat('A long review. ', 333) WHERE id = (SELECT id FROM r_log);

CREATE TEMP TABLE r_kept (n int, ok boolean, why text);
GRANT ALL ON r_kept TO authenticated;
GRANT SELECT ON r_log TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM r_log), 'role', 'authenticated')::text, true);
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

SELECT 'rewatches kept' AS what, count(*) FILTER (WHERE ok) AS kept, count(*) FILTER (WHERE NOT ok) AS refused FROM r_kept;
SELECT n, why FROM r_kept WHERE NOT ok ORDER BY n LIMIT 1;
SELECT 'history length' AS what, char_length(viewing_history::text) FROM public.logs WHERE id = (SELECT id FROM r_log);

ROLLBACK;
