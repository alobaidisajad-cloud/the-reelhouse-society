-- ════════════════════════════════════════════════════════════════════════════
-- acts_are_paced_as_a_script_is_rehearsal.sql — 20261119_07. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs acts_are_paced_as_a_script_is_rehearsal.sql --with-train
--
-- The train applies 20261119_07 here (with_train), 20261119_00 to 20261119_06 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 13).
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
GRANT SELECT ON rehearsal_members TO authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE ha2_hint (k text PRIMARY KEY, hint text) ON COMMIT DROP;
GRANT ALL ON ha2_hint TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_07_acts_are_paced_as_a_script_is.sql
\endif

-- ── H-A2 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A2 rehearsal · a member's acts a moment apart land; a script's pace is held (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). Everything here happens at one
-- moment (now() stands still in a transaction), so each case is the rule itself, not a second waited.
-- 2 keeps a stack. Member 1, as themselves: follows 2, 3 and 4 and certifies 2's stack, all at once:
-- each lands (the old rule refused the second). 1 unfollows and follows 3 again until the fourth follow
-- of the hour is refused, RH429 'target', with the hour's wait; withdraws and certifies the stack again
-- until the sixth is refused the same way. 4 at the end of their room (laid by the house) is refused
-- RH429 'member' with two seconds to wait, and the refusal costs nothing; 4 at the day's 400 follows is
-- refused until the house's midnight, while a certification still lands. The house's own write is not
-- paced. Every refusal names itself: RATE_LIMITED, its DETAIL, its HINT in whole seconds.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
-- No follow between the four, and nobody private, so each follow is a follow; nothing counted yet today.
DELETE FROM public.interactions
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = false,
       preferences = coalesce(preferences, '{}'::jsonb) || '{"privacy_endorsements": "everyone"}'::jsonb
 WHERE id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);

CREATE TEMP TABLE ha2_stack ON COMMIT DROP AS
WITH made AS (INSERT INTO public.lists (user_id, title) VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'rh H-A2 stack') RETURNING id)
SELECT id FROM made;
GRANT SELECT ON ha2_stack TO authenticated;

-- A member acts as themselves: 'ok', or the refusal as code|message|detail, and its hint.
CREATE FUNCTION pg_temp.ha2_as(p_member bigint, p_sql text, p_k text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_code text; v_msg text; v_detail text; v_hint text; v_out text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    v_out := v_code || '|' || v_msg || '|' || coalesce(v_detail, '');
    IF p_k IS NOT NULL THEN INSERT INTO ha2_hint VALUES (p_k, v_hint); END IF;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $$;
CREATE FUNCTION pg_temp.ha2_follow(p_member bigint, p_target bigint) RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.interactions (user_id, target_user_id, type) VALUES (%L, %L, %L)',
    (SELECT id FROM rehearsal_members WHERE n = p_member), (SELECT id FROM rehearsal_members WHERE n = p_target), 'follow');
$$;
CREATE FUNCTION pg_temp.ha2_unfollow(p_member bigint, p_target bigint) RETURNS text LANGUAGE sql AS $$
  SELECT format('DELETE FROM public.interactions WHERE user_id = %L AND target_user_id = %L AND type IN (''follow'', ''follow_request'')',
    (SELECT id FROM rehearsal_members WHERE n = p_member), (SELECT id FROM rehearsal_members WHERE n = p_target));
$$;
CREATE FUNCTION pg_temp.ha2_certify(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.interactions (user_id, target_list_id, type) VALUES (%L, %L, %L)',
    (SELECT id FROM rehearsal_members WHERE n = p_member), (SELECT id FROM ha2_stack), 'endorse_list');
$$;
CREATE FUNCTION pg_temp.ha2_withdraw(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT format('DELETE FROM public.interactions WHERE user_id = %L AND target_list_id = %L AND type = ''endorse_list''',
    (SELECT id FROM rehearsal_members WHERE n = p_member), (SELECT id FROM ha2_stack));
$$;
CREATE FUNCTION pg_temp.ha2_budget(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT tokens::text || '|' || follows::text || '|' || certs::text FROM public.interaction_budget
   WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = p_member);
$$;

-- ── four acts at one moment, each as the member ──
SELECT pg_temp.rh_case('a member follows three members and certifies a stack at one moment: each lands', 'ok|ok|ok|ok',
  pg_temp.ha2_as(1, pg_temp.ha2_follow(1, 2)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_follow(1, 3)) || '|'
  || pg_temp.ha2_as(1, pg_temp.ha2_follow(1, 4)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_certify(1))) AS done \gset rh_
SELECT pg_temp.rh_case('the four are held', '4',
  (SELECT count(*)::text FROM public.interactions WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
     AND (target_user_id IN (SELECT id FROM rehearsal_members) OR target_list_id = (SELECT id FROM ha2_stack)))) AS done \gset rh_
SELECT pg_temp.rh_case('and counted in one row: 116 left of 120, three follows and one certification today', '116|3|1',
  pg_temp.ha2_budget(1)) AS done \gset rh_

-- ── one member followed again and again within the hour ──
SELECT pg_temp.rh_case('unfollowed and followed again twice, the third follow of the hour lands', 'ok|ok|ok|ok',
  pg_temp.ha2_as(1, pg_temp.ha2_unfollow(1, 3)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_follow(1, 3)) || '|'
  || pg_temp.ha2_as(1, pg_temp.ha2_unfollow(1, 3)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_follow(1, 3))) AS done \gset rh_
SELECT pg_temp.rh_case('the fourth follow of one member in an hour is refused, as that one thing', 'ok|RH429|RATE_LIMITED|target',
  pg_temp.ha2_as(1, pg_temp.ha2_unfollow(1, 3)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_follow(1, 3), 'churn-follow')) AS done \gset rh_
SELECT pg_temp.rh_case('with the hour to wait', '3600', (SELECT hint FROM ha2_hint WHERE k = 'churn-follow')) AS done \gset rh_
SELECT pg_temp.rh_case('while another member is unfollowed and followed again at once', 'ok|ok',
  pg_temp.ha2_as(1, pg_temp.ha2_unfollow(1, 4)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_follow(1, 4))) AS done \gset rh_

-- ── one stack certified again and again within the hour ──
SELECT pg_temp.rh_case('withdrawn and certified again four times, the fifth certification of the hour lands', 'ok|ok|ok|ok|ok|ok|ok|ok',
  pg_temp.ha2_as(1, pg_temp.ha2_withdraw(1)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_certify(1)) || '|'
  || pg_temp.ha2_as(1, pg_temp.ha2_withdraw(1)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_certify(1)) || '|'
  || pg_temp.ha2_as(1, pg_temp.ha2_withdraw(1)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_certify(1)) || '|'
  || pg_temp.ha2_as(1, pg_temp.ha2_withdraw(1)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_certify(1))) AS done \gset rh_
SELECT pg_temp.rh_case('the sixth is refused, as that one thing', 'ok|RH429|RATE_LIMITED|target',
  pg_temp.ha2_as(1, pg_temp.ha2_withdraw(1)) || '|' || pg_temp.ha2_as(1, pg_temp.ha2_certify(1), 'churn-cert')) AS done \gset rh_
SELECT pg_temp.rh_case('with the hour to wait', '3600', (SELECT hint FROM ha2_hint WHERE k = 'churn-cert')) AS done \gset rh_

-- ── a member at the end of their room ──
INSERT INTO public.interaction_budget (user_id, tokens, refilled_at, day, follows, certs, swept_at)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 4), 0.25, now(), (now() AT TIME ZONE 'UTC')::date, 0, 0, now());
SELECT pg_temp.rh_case('a member with no room left is refused, as the member''s own pace', 'RH429|RATE_LIMITED|member',
  pg_temp.ha2_as(4, pg_temp.ha2_follow(4, 2), 'room')) AS done \gset rh_
SELECT pg_temp.rh_case('with two seconds to wait (three quarters of an act, at two seconds each, rounded up)', '2',
  (SELECT hint FROM ha2_hint WHERE k = 'room')) AS done \gset rh_
SELECT pg_temp.rh_case('and the refusal cost nothing', '0.25|0|0', pg_temp.ha2_budget(4)) AS done \gset rh_
SELECT pg_temp.rh_case('nor was the follow made', '0',
  (SELECT count(*)::text FROM public.interactions WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 4)
     AND target_user_id = (SELECT id FROM rehearsal_members WHERE n = 2))) AS done \gset rh_
-- Refilled as time passes: the room was last filled a minute ago, so 30 more acts came back.
UPDATE public.interaction_budget SET refilled_at = now() - interval '1 minute'
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
SELECT pg_temp.rh_case('a minute later the room has come back, and the follow lands', 'ok',
  pg_temp.ha2_as(4, pg_temp.ha2_follow(4, 2))) AS done \gset rh_
SELECT pg_temp.rh_case('thirty acts came back, one spent', '29.25|1|0', pg_temp.ha2_budget(4)) AS done \gset rh_

-- ── a member at the day's ceiling ──
UPDATE public.interaction_budget SET tokens = 120, follows = 400
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
SELECT pg_temp.rh_case('the day''s 401st follow is refused, as the member''s own pace', 'RH429|RATE_LIMITED|member',
  pg_temp.ha2_as(4, pg_temp.ha2_follow(4, 3), 'day')) AS done \gset rh_
SELECT pg_temp.rh_case('until the house''s midnight', 'true',
  (SELECT (hint::integer BETWEEN 1 AND 86400)
       AND abs(hint::integer - extract(epoch FROM ((((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC') - now()))) <= 1
     FROM ha2_hint WHERE k = 'day')::text) AS done \gset rh_
SELECT pg_temp.rh_case('while a certification still lands', 'ok', pg_temp.ha2_as(4, pg_temp.ha2_certify(4))) AS done \gset rh_
-- A day later the count begins again.
UPDATE public.interaction_budget SET day = day - 1 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
SELECT pg_temp.rh_case('the next day the follow lands', 'ok', pg_temp.ha2_as(4, pg_temp.ha2_follow(4, 3))) AS done \gset rh_

-- ── the house is not paced, and a member's old acts are let go ──
UPDATE public.interaction_budget SET tokens = 0 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 3);
INSERT INTO public.interaction_budget (user_id, tokens, refilled_at, day, follows, certs, swept_at)
SELECT id, 0, now(), (now() AT TIME ZONE 'UTC')::date, 0, 0, now() FROM rehearsal_members WHERE n = 3
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 2), 'follow');
SELECT pg_temp.rh_case('the house''s own write is not paced, nor counted', '0|0|0', pg_temp.ha2_budget(3)) AS done \gset rh_
-- Member 2's churn row from over an hour ago, and their sweep due: their next act lets it go.
INSERT INTO public.interaction_churn (user_id, target, since, n)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'member:' || (SELECT id FROM rehearsal_members WHERE n = 1), now() - interval '2 hours', 3);
INSERT INTO public.interaction_budget (user_id, tokens, refilled_at, day, follows, certs, swept_at)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 120, now(), (now() AT TIME ZONE 'UTC')::date, 0, 0, now() - interval '2 hours');
SELECT pg_temp.rh_case('a member''s act an hour on lands', 'ok', pg_temp.ha2_as(2, pg_temp.ha2_follow(2, 4))) AS done \gset rh_
SELECT pg_temp.rh_case('and lets their old acts go, keeping only its own', '0|1',
  (SELECT count(*) FILTER (WHERE since < now())::text || '|' || count(*) FILTER (WHERE since = now())::text
     FROM public.interaction_churn WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
