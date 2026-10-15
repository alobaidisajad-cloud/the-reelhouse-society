-- ════════════════════════════════════════════════════════════════════════════
-- taste_match_reads_both_records_rehearsal.sql — 20261002_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/taste_match_reads_both_records_rehearsal.sql
--
-- The member with the longest record asks how their taste matches the longest
-- public record besides: each side is that member's whole record, every rated
-- film counted once, decades from real years only; a visitor is refused, and
-- no member reads a shape directly. Production runs it by hand;
-- db-integration.yml runs it on the sealed copy (e2e/db/rehearsals.mjs).
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- The member with the longest record, and the longest public one besides.
SELECT set_config('rehearsal.a', pg_temp.rh_found('a member with a log',
  (SELECT user_id FROM public.logs GROUP BY user_id ORDER BY count(*) DESC, user_id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.b', pg_temp.rh_found('a second, public member with a log',
  (SELECT l.user_id FROM public.logs l JOIN public.profiles p ON p.id = l.user_id
    WHERE l.user_id::text <> current_setting('rehearsal.a') AND NOT coalesce(p.is_social_private, false)
    GROUP BY l.user_id ORDER BY count(*) DESC, l.user_id LIMIT 1))::text, true) AS done \gset rh_

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

DO $$
DECLARE g jsonb := (SELECT out FROM tm_got WHERE who = 'member'); w record;
BEGIN
  SELECT * INTO w FROM tm_want;
  PERFORM pg_temp.rh_case('mine is the viewer''s whole record', w.logs_a::text, g->'mine'->>'logs');
  PERFORM pg_temp.rh_case('theirs is the other member''s whole record', w.logs_b::text, g->'theirs'->>'logs');
  PERFORM pg_temp.rh_case('five reels, each rated film once (mine)', '5|' || w.rated_a,
    jsonb_array_length(g->'mine'->'ratings') || '|' || (SELECT sum(v::int) FROM jsonb_array_elements_text(g->'mine'->'ratings') v));
  PERFORM pg_temp.rh_case('five reels, each rated film once (theirs)', '5|' || w.rated_b,
    jsonb_array_length(g->'theirs'->'ratings') || '|' || (SELECT sum(v::int) FROM jsonb_array_elements_text(g->'theirs'->'ratings') v));
  PERFORM pg_temp.rh_case('decades from real years only (theirs)', w.dated_b::text,
    (SELECT coalesce(sum(v::int), 0)::text FROM jsonb_each_text(g->'theirs'->'decades') x(k, v)));
  PERFORM pg_temp.rh_case('a half rounds up, as the app counted (3.5 is a 4)', '4', round(3.5::numeric)::text);
  PERFORM pg_temp.rh_case('a visitor is refused', 'refused',
    (SELECT CASE WHEN out->>'error' IN ('forbidden', 'refused') THEN 'refused' ELSE 'answered' END FROM tm_got WHERE who = 'visitor'));
  PERFORM pg_temp.rh_case('a member cannot read a shape directly', 'false',
    CASE WHEN to_regprocedure('public.taste_shape(uuid)') IS NULL THEN 'no function'
         ELSE has_function_privilege('authenticated', 'public.taste_shape(uuid)', 'EXECUTE')::text END);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
