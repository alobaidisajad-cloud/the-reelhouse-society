-- ════════════════════════════════════════════════════════════════════════════
-- a_members_viewings_again_are_found_by_the_month_rehearsal.sql — 20261122_20. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_viewings_again_are_found_by_the_month_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_20
-- alone, in its turn, and this checks it holds: the index is there and whole, a span's keys are read
-- through it, and of a member's three logs (one seen again in March 2025, one seen again in June 2025, one
-- seen once) the span of March finds the first alone, and no other member's log of March.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the films seen again, by month, is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.logs_seen_again_by_month')), 'missing')) AS done \gset rh_

-- Two members: the first with three logs, the second with one seen again in March 2025.
CREATE TEMP TABLE vbm_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n FROM auth.users u JOIN public.profiles p ON p.id = u.id
   ORDER BY u.created_at LIMIT 2;
SELECT pg_temp.rh_need('two members', (SELECT count(*) FROM vbm_members), 2) AS done \gset rh_
INSERT INTO public.logs (user_id, film_id, film_title, watched_date, viewing_history)
SELECT m.id, f.film, 'rh film', date '2025-09-01', f.history
  FROM vbm_members m
  JOIN (VALUES (1, 990001, '[{"date": "2025-03-14"}]'::jsonb),
               (1, 990002, '[{"date": "2025-06-14"}]'::jsonb),
               (1, 990003, '[]'::jsonb),
               (2, 990001, '[{"date": "2025-03-20"}]'::jsonb)) f(n, film, history) ON f.n = m.n;

SET LOCAL enable_seqscan = off;
CREATE FUNCTION pg_temp.vbm_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record; v_id uuid := (SELECT id FROM vbm_members WHERE n = 1);
BEGIN
  FOR r IN EXECUTE format('EXPLAIN SELECT l.id FROM public.logs l WHERE jsonb_typeof(l.viewing_history) = %L AND l.viewing_history <> %L::jsonb AND private.viewing_months(l.user_id, l.viewing_history, l.created_at) && private.viewing_months_between(%L, %L, %L)',
                          'array', '[]', v_id, '2025-03-01', '2025-03-31') LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('a span''s keys are read through it', 'true',
  (position('logs_seen_again_by_month' in (SELECT pg_temp.vbm_plan())) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the span of March finds the member''s log seen again in March, and no other', '990001',
  (SELECT coalesce(string_agg(l.film_id::text, ',' ORDER BY l.film_id), 'none') FROM public.logs l
    WHERE jsonb_typeof(l.viewing_history) = 'array' AND l.viewing_history <> '[]'::jsonb
      AND private.viewing_months(l.user_id, l.viewing_history, l.created_at)
          && private.viewing_months_between((SELECT id FROM vbm_members WHERE n = 1), '2025-03-01', '2025-03-31'))) AS done \gset rh_

-- The member writes their own log as themselves, an earlier viewing in it: the index works out its keys
-- as the member.
GRANT SELECT ON vbm_members TO authenticated;
CREATE FUNCTION pg_temp.vbm_writes_own_log() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM vbm_members WHERE n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE public.logs SET rating = 4 WHERE user_id = (SELECT id FROM vbm_members WHERE n = 1) AND film_id = 990001;
    v := 'written';
  EXCEPTION WHEN OTHERS THEN v := SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.vbm_writes_own_log() TO authenticated;
SELECT pg_temp.rh_case('a member writes their own log seen again, as themselves', 'written', (SELECT pg_temp.vbm_writes_own_log())) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
