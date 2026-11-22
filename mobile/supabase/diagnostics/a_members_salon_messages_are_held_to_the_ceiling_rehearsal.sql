-- ════════════════════════════════════════════════════════════════════════════
-- a_members_salon_messages_are_held_to_the_ceiling_rehearsal.sql — 20261120_17. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_salon_messages_are_held_to_the_ceiling_rehearsal.sql
--
-- 20261120_17 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE ha8_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
CREATE TEMP TABLE ha8_hint (k text PRIMARY KEY, hint text) ON COMMIT DROP;
GRANT SELECT ON ha8_ids TO authenticated;
GRANT ALL ON ha8_hint TO authenticated;

-- ── H-A8.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A8's trigger rehearsal · a member's salon messages are held to 1,000 a day (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-A8.table, H-A8.up
-- and H-A8.locks applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Members 1 and 2 hold the Archivist's rank for the run and sit in a salon of 1's. 1, as themselves,
-- sends a word: it lands and is counted. Laid at 999 for the day, 1's next word lands (the thousandth)
-- and the one after is refused (RH429 'day', the seconds to the house's midnight), costing nothing; the
-- thousandth sent again by its own id (its answer lost) lands and is not counted. 2's count is their
-- own. The next day, the count starts again. The house's own message is not counted.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2));
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);

WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('The H-A8 Rehearsal Room', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO ha8_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM ha8_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM ha8_ids WHERE what = 'salon'), id, 'approved' FROM rehearsal_members WHERE n IN (1, 2);
INSERT INTO ha8_ids VALUES ('the thousandth', gen_random_uuid());

-- A member sends a word as the phone does (an upsert by its own id), as themselves: 'ok', or
-- code|message|detail (hint under p_k).
CREATE FUNCTION pg_temp.ha8_send(p_member bigint, p_id uuid DEFAULT NULL, p_k text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_code text; v_msg text; v_detail text; v_hint text; v_out text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO public.lounge_messages (id, lounge_id, user_id, content)
    VALUES (coalesce(p_id, gen_random_uuid()), (SELECT id FROM ha8_ids WHERE what = 'salon'),
            (SELECT id FROM rehearsal_members WHERE n = p_member), 'rh H-A8 a word')
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    v_out := v_code || '|' || v_msg || '|' || coalesce(v_detail, '');
    IF p_k IS NOT NULL THEN INSERT INTO ha8_hint VALUES (p_k, v_hint); END IF;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $$;
CREATE FUNCTION pg_temp.ha8_count(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT n::text FROM public.salon_budget WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = p_member);
$$;
CREATE FUNCTION pg_temp.ha8_sent(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.lounge_messages
   WHERE lounge_id = (SELECT id FROM ha8_ids WHERE what = 'salon') AND user_id = (SELECT id FROM rehearsal_members WHERE n = p_member);
$$;

SELECT pg_temp.rh_case('a member sends a word: it lands, and is counted', 'ok|1|1',
  pg_temp.ha8_send(1) || '|' || pg_temp.ha8_sent(1) || '|' || pg_temp.ha8_count(1)) AS done \gset rh_
UPDATE public.salon_budget SET n = 999 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1);
SELECT pg_temp.rh_case('at 999 for the day, the thousandth lands', 'ok|1000',
  pg_temp.ha8_send(1, (SELECT id FROM ha8_ids WHERE what = 'the thousandth')) || '|' || pg_temp.ha8_count(1)) AS done \gset rh_
SELECT pg_temp.rh_case('the 1,001st is refused, as the day''s ceiling', 'RH429|RATE_LIMITED|day',
  pg_temp.ha8_send(1, NULL, 'ceiling')) AS done \gset rh_
SELECT pg_temp.rh_case('until the house''s midnight', ceil(extract(epoch FROM (((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC') - now()))::integer::text,
  (SELECT hint FROM ha8_hint WHERE k = 'ceiling')) AS done \gset rh_
SELECT pg_temp.rh_case('and the refusal sent nothing and cost nothing', '2|1000',
  pg_temp.ha8_sent(1) || '|' || pg_temp.ha8_count(1)) AS done \gset rh_
SELECT pg_temp.rh_case('the thousandth sent again by its own id lands and is not counted', 'ok|2|1000',
  pg_temp.ha8_send(1, (SELECT id FROM ha8_ids WHERE what = 'the thousandth')) || '|' || pg_temp.ha8_sent(1) || '|' || pg_temp.ha8_count(1)) AS done \gset rh_
SELECT pg_temp.rh_case('another member''s count is their own', 'ok|1', pg_temp.ha8_send(2) || '|' || pg_temp.ha8_count(2)) AS done \gset rh_
UPDATE public.salon_budget SET day = day - 1 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1);
SELECT pg_temp.rh_case('the next day, the count starts again', 'ok|1', pg_temp.ha8_send(1) || '|' || pg_temp.ha8_count(1)) AS done \gset rh_
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO public.lounge_messages (lounge_id, user_id, content)
VALUES ((SELECT id FROM ha8_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 1), 'rh H-A8 the house''s own');
SELECT pg_temp.rh_case('the house''s own message is sent and not counted', '4|1',
  pg_temp.ha8_sent(1) || '|' || pg_temp.ha8_count(1)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
