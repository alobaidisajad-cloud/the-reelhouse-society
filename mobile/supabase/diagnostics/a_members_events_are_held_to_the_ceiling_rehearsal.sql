-- ════════════════════════════════════════════════════════════════════════════
-- a_members_events_are_held_to_the_ceiling_rehearsal.sql — 20261120_14. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_events_are_held_to_the_ceiling_rehearsal.sql --with-train
--
-- The train applies 20261120_14 here (with_train), 20261120_00 to 20261120_13 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 14).
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 4;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 4) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE ha6_hint (k text PRIMARY KEY, hint text) ON COMMIT DROP;
GRANT ALL ON ha6_hint TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_14_a_members_events_are_held_to_the_ceiling.sql
\endif

-- ── H-A6.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A6's trigger rehearsal · a member's analytics events are held to 1,000 a day (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-A6.table, H-A6.up
-- and H-A6.locks applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Member 1, as themselves, files a batch of 50 events as the website does: every one lands and is
-- counted. Laid at 990 for the day, 1's batch of 20 is refused whole (RH429 'day', the seconds to the
-- house's midnight) and costs nothing; a batch of 10 then lands, and the 1,001st is refused. Member 2's
-- count is their own. The next day, the count starts again. The house's own event is not counted.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);

-- A member files n events in one statement, as themselves: 'ok', or code|message|detail (hint under p_k).
CREATE FUNCTION pg_temp.ha6_file(p_member bigint, p_n integer, p_k text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_code text; v_msg text; v_detail text; v_hint text; v_out text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO public.analytics_events (user_id, event_name, properties, created_at)
    SELECT (SELECT id FROM rehearsal_members WHERE n = p_member), 'rh_h_a6', jsonb_build_object('i', g), now()
      FROM generate_series(1, p_n) g;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    v_out := v_code || '|' || v_msg || '|' || coalesce(v_detail, '');
    IF p_k IS NOT NULL THEN INSERT INTO ha6_hint VALUES (p_k, v_hint); END IF;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $$;
CREATE FUNCTION pg_temp.ha6_filed(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.analytics_events
   WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = p_member) AND event_name = 'rh_h_a6';
$$;
CREATE FUNCTION pg_temp.ha6_count(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT n::text FROM public.analytics_budget WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = p_member);
$$;

SELECT pg_temp.rh_case('a member files a batch of fifty events: each lands, and is counted', 'ok|50|50',
  pg_temp.ha6_file(1, 50) || '|' || pg_temp.ha6_filed(1) || '|' || pg_temp.ha6_count(1)) AS done \gset rh_
UPDATE public.analytics_budget SET n = 990 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1);
SELECT pg_temp.rh_case('at 990 for the day, a batch of twenty is refused whole, as the day''s ceiling', 'RH429|RATE_LIMITED|day',
  pg_temp.ha6_file(1, 20, 'ceiling')) AS done \gset rh_
SELECT pg_temp.rh_case('until the house''s midnight', ceil(extract(epoch FROM (((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC') - now()))::integer::text,
  (SELECT hint FROM ha6_hint WHERE k = 'ceiling')) AS done \gset rh_
SELECT pg_temp.rh_case('and the refusal filed nothing and cost nothing', '50|990',
  pg_temp.ha6_filed(1) || '|' || pg_temp.ha6_count(1)) AS done \gset rh_
SELECT pg_temp.rh_case('ten more land, to the day''s thousand', 'ok|1000', pg_temp.ha6_file(1, 10) || '|' || pg_temp.ha6_count(1)) AS done \gset rh_
SELECT pg_temp.rh_case('the 1,001st is refused', 'RH429|RATE_LIMITED|day', pg_temp.ha6_file(1, 1)) AS done \gset rh_
SELECT pg_temp.rh_case('another member''s count is their own', 'ok|1', pg_temp.ha6_file(2, 1) || '|' || pg_temp.ha6_count(2)) AS done \gset rh_
UPDATE public.analytics_budget SET day = day - 1 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1);
SELECT pg_temp.rh_case('the next day, the count starts again', 'ok|1', pg_temp.ha6_file(1, 1) || '|' || pg_temp.ha6_count(1)) AS done \gset rh_
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO public.analytics_events (user_id, event_name) VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh_h_a6_house');
SELECT pg_temp.rh_case('the house''s own event is filed and not counted', '1|1',
  (SELECT count(*)::text FROM public.analytics_events WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND event_name = 'rh_h_a6_house')
  || '|' || pg_temp.ha6_count(1)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
