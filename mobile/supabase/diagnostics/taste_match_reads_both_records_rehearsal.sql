-- ════════════════════════════════════════════════════════════════════════════
-- taste_match_reads_both_records_rehearsal.sql — 20261002_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/taste_match_reads_both_records_rehearsal.sql
--
-- Without with_fix there is no get_taste_match and the rehearsal stops on it:
-- it can say no. Read each NOTICE as  case | expected | got. The last line
-- counts failures.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261002_04_taste_match_reads_both_records.sql
\endif

-- The member with the longest record, and the longest public one besides.
SELECT set_config('rehearsal.a', (SELECT user_id::text FROM public.logs GROUP BY user_id ORDER BY count(*) DESC LIMIT 1), true) AS done \gset rh_
SELECT set_config('rehearsal.b', (SELECT l.user_id::text FROM public.logs l JOIN public.profiles p ON p.id = l.user_id
  WHERE l.user_id::text <> current_setting('rehearsal.a') AND NOT coalesce(p.is_social_private, false)
  GROUP BY l.user_id ORDER BY count(*) DESC LIMIT 1), true) AS done \gset rh_

-- What the whole records hold, counted here as postgres.
CREATE TEMP TABLE tm_want ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.logs WHERE user_id = current_setting('rehearsal.a')::uuid) AS logs_a,
  (SELECT count(*) FROM public.logs WHERE user_id = current_setting('rehearsal.b')::uuid) AS logs_b,
  (SELECT count(*) FROM public.logs WHERE user_id = current_setting('rehearsal.a')::uuid AND round(rating) BETWEEN 1 AND 5) AS rated_a,
  (SELECT count(*) FROM public.logs WHERE user_id = current_setting('rehearsal.b')::uuid AND round(rating) BETWEEN 1 AND 5) AS rated_b,
  (SELECT count(*) FROM public.logs WHERE user_id = current_setting('rehearsal.b')::uuid
      AND year::text ~ '^\d{1,4}$' AND (year::text::int / 10) * 10 > 0) AS dated_b;
CREATE TEMP TABLE tm_got (who text, out jsonb) ON COMMIT DROP;
GRANT ALL ON tm_got TO authenticated, anon;

-- Member A asks about member B.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.a'), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO tm_got SELECT 'member', public.get_taste_match(current_setting('rehearsal.b')::uuid);
RESET ROLE;

-- A visitor asks.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) AS done \gset rh_
DO $$
BEGIN
  INSERT INTO tm_got SELECT 'visitor', public.get_taste_match(current_setting('rehearsal.b')::uuid);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO tm_got VALUES ('visitor', '{"error": "refused"}'::jsonb);
END $$;
RESET ROLE;

CREATE TEMP TABLE tm_cases ON COMMIT DROP AS
WITH g AS (SELECT out FROM tm_got WHERE who = 'member'), w AS (SELECT * FROM tm_want)
SELECT * FROM (VALUES
  ('mine is the viewer''s whole record', (SELECT logs_a::text FROM w), (SELECT out->'mine'->>'logs' FROM g)),
  ('theirs is the other member''s whole record', (SELECT logs_b::text FROM w), (SELECT out->'theirs'->>'logs' FROM g)),
  ('five reels, each rated film once (mine)', (SELECT '5|' || rated_a FROM w),
     (SELECT jsonb_array_length(out->'mine'->'ratings') || '|' || (SELECT sum(v::int) FROM jsonb_array_elements_text(out->'mine'->'ratings') v) FROM g)),
  ('five reels, each rated film once (theirs)', (SELECT '5|' || rated_b FROM w),
     (SELECT jsonb_array_length(out->'theirs'->'ratings') || '|' || (SELECT sum(v::int) FROM jsonb_array_elements_text(out->'theirs'->'ratings') v) FROM g)),
  ('decades from real years only (theirs)', (SELECT dated_b::text FROM w),
     (SELECT coalesce(sum(v::int), 0)::text FROM g, jsonb_each_text(g.out->'theirs'->'decades') x(k, v))),
  ('a half rounds up, as the app counted (3.5 is a 4)', '4', round(3.5::numeric)::text),
  ('a visitor is refused', 'refused',
     (SELECT CASE WHEN out->>'error' IN ('forbidden', 'refused') THEN 'refused' ELSE 'answered' END FROM tm_got WHERE who = 'visitor')),
  ('a member cannot read a shape directly', 'false',
     CASE WHEN to_regprocedure('public.taste_shape(uuid)') IS NULL THEN 'no function'
          ELSE has_function_privilege('authenticated', 'public.taste_shape(uuid)', 'EXECUTE')::text END)
) AS c(label, expected, got);

DO $$
DECLARE c record; failed integer := 0;
BEGIN
  FOR c IN SELECT * FROM tm_cases LOOP
    RAISE NOTICE '% | % | %', c.label, c.expected, c.got;
    IF c.got IS DISTINCT FROM c.expected THEN failed := failed + 1; END IF;
  END LOOP;
  RAISE NOTICE 'FAILED: %', failed;
END $$;

ROLLBACK;
