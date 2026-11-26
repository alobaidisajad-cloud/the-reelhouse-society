-- ════════════════════════════════════════════════════════════════════════════
-- a_members_call_to_the_store_is_paced_rehearsal.sql — 20261125_10. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_call_to_the_store_is_paced_rehearsal.sql
--
-- 20261125_10 is applied on production (the train of 2026-11-26); this shows it still holds there, and on every sealed copy.
-- Then the house, as sync-entitlement asks it (service_role), paces a member's calls to the store, and a
-- member's own write is still paced through the same room. Every row here is undone with the transaction.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
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
   ORDER BY u.created_at LIMIT 2;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 2) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated, service_role;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- The two members' rooms start empty here, whatever they held: each case below sets what it reads.
DELETE FROM public.write_budget WHERE user_id IN (SELECT id FROM rehearsal_members);

-- One statement as a role (service_role: the edge function; authenticated: a member as themselves, with
-- their claims). Says 'ok', 'refused' for a permission the role lacks, or the refusal's code, message and detail.
CREATE FUNCTION pg_temp.sp_try(p_sql text, p_role text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_msg text; v_detail text;
BEGIN
  IF p_role = 'authenticated' THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  END IF;
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN CASE WHEN v_state = '42501' THEN 'refused' ELSE v_state || ' ' || v_msg || ' ' || coalesce(v_detail, '') END;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'ok';
END $$;

-- The hint of a refusal (the seconds to wait), as the edge function reads it.
CREATE FUNCTION pg_temp.sp_hint(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_hint text;
BEGIN
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  PERFORM set_config('role', 'none', true);
  RETURN v_hint;
END $$;

-- Sets member 1's room of a kind: p_tokens left, refilled p_ago seconds back, p_n counted today.
CREATE FUNCTION pg_temp.sp_room(p_kind text, p_tokens real, p_ago integer, p_n integer) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.write_budget (user_id, kind, tokens, refilled_at, day, n)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), p_kind, p_tokens, now() - make_interval(secs => p_ago), (now() AT TIME ZONE 'UTC')::date, p_n)
  ON CONFLICT (user_id, kind) DO UPDATE SET tokens = EXCLUDED.tokens, refilled_at = EXCLUDED.refilled_at, day = EXCLUDED.day, n = EXCLUDED.n;
$$;

-- Member 1's room of a kind as  n|tokens  (none: no row).
CREATE FUNCTION pg_temp.sp_kept(p_kind text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT n || '|' || round(tokens)::text FROM public.write_budget
                    WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND kind = p_kind), 'none');
$$;

CREATE TEMP TABLE sp_call ON COMMIT DROP AS
  SELECT format('SELECT public.a_members_call_is_paced(%L, %L)', (SELECT id FROM rehearsal_members WHERE n = 1), 'store_read') AS sql;
GRANT SELECT ON sp_call TO anon, authenticated, service_role;

-- ── the store's door: a member's call is paced ──
SELECT pg_temp.rh_case('the house asks for a member''s call to the store, with room left', 'ok',
  pg_temp.sp_try((SELECT sql FROM sp_call), 'service_role')) AS done \gset rh_
SELECT pg_temp.rh_case('and counts it in the member''s room: ten, less this one', '1|9', pg_temp.sp_kept('store_read')) AS done \gset rh_

SELECT pg_temp.sp_room('store_read', 0, 0, 1) AS done \gset rh_
SELECT pg_temp.rh_case('a member with no room left is refused for the member', 'RH429 RATE_LIMITED member',
  pg_temp.sp_try((SELECT sql FROM sp_call), 'service_role')) AS done \gset rh_
SELECT pg_temp.rh_case('with the seconds a call takes to come back', '30', pg_temp.sp_hint((SELECT sql FROM sp_call))) AS done \gset rh_
SELECT pg_temp.rh_case('and the refusal spends nothing: the room is as it was', '1|0', pg_temp.sp_kept('store_read')) AS done \gset rh_

SELECT pg_temp.sp_room('store_read', 0, 30, 1) AS done \gset rh_
SELECT pg_temp.rh_case('thirty seconds on, the room has one more', 'ok',
  pg_temp.sp_try((SELECT sql FROM sp_call), 'service_role')) AS done \gset rh_

SELECT pg_temp.sp_room('store_read', 10, 0, 200) AS done \gset rh_
SELECT pg_temp.rh_case('the day''s 200 met is refused for the day', 'RH429 RATE_LIMITED day',
  pg_temp.sp_try((SELECT sql FROM sp_call), 'service_role')) AS done \gset rh_
SELECT pg_temp.rh_case('with the seconds to the house''s midnight', 'true',
  (pg_temp.sp_hint((SELECT sql FROM sp_call))::integer BETWEEN 1 AND 86400)::text) AS done \gset rh_

UPDATE public.write_budget SET day = day - 1 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND kind = 'store_read';
SELECT pg_temp.rh_case('a new day counts afresh', 'ok', pg_temp.sp_try((SELECT sql FROM sp_call), 'service_role')) AS done \gset rh_
SELECT pg_temp.rh_case('from one', '1|9', pg_temp.sp_kept('store_read')) AS done \gset rh_

SELECT pg_temp.rh_case('member 2 has no room counted for member 1''s calls', '0',
  (SELECT count(*)::text FROM public.write_budget WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2))) AS done \gset rh_
SELECT pg_temp.rh_case('a kind the house does not know is refused', '22023 a_members_call_is_paced: no such kind rh-no-kind',
  pg_temp.sp_try(format('SELECT public.a_members_call_is_paced(%L, %L)', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh-no-kind'), 'service_role')) AS done \gset rh_
SELECT pg_temp.rh_case('and a call that names no member', '22004 a_members_call_is_paced: no member ',
  pg_temp.sp_try('SELECT public.a_members_call_is_paced(NULL, ''store_read'')', 'service_role')) AS done \gset rh_

-- ── the house's alone ──
SELECT pg_temp.rh_case('a member may not ask it for themselves', 'refused', pg_temp.sp_try((SELECT sql FROM sp_call), 'authenticated')) AS done \gset rh_
SELECT pg_temp.rh_case('nor a visitor', 'refused', pg_temp.sp_try((SELECT sql FROM sp_call), 'anon')) AS done \gset rh_
SELECT pg_temp.rh_case('nor may a member spend or give themselves a room', 'refused',
  pg_temp.sp_try(format('SELECT private.a_members_room_is_spent(%L, %L, 1e9, 1)', (SELECT id FROM rehearsal_members WHERE n = 1), 'store_read'), 'authenticated')) AS done \gset rh_

-- ── a member's own write is paced through the same room, as before ──
DELETE FROM public.write_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
SELECT pg_temp.rh_case('a member makes a stack, as themselves, with room left', 'ok',
  pg_temp.sp_try(format('INSERT INTO public.lists (id, user_id, title) VALUES (gen_random_uuid(), %L, %L)', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh store pace stack'), 'authenticated')) AS done \gset rh_
SELECT pg_temp.rh_case('counted in their stack room', '1|499', pg_temp.sp_kept('stack')) AS done \gset rh_
SELECT pg_temp.sp_room('stack', 0, 0, 1) AS done \gset rh_
SELECT pg_temp.rh_case('and refused with no room left', 'RH429 RATE_LIMITED member',
  pg_temp.sp_try(format('INSERT INTO public.lists (id, user_id, title) VALUES (gen_random_uuid(), %L, %L)', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh store pace stack'), 'authenticated')) AS done \gset rh_
SELECT pg_temp.rh_case('a call to the store, room left for it', 'ok', pg_temp.sp_try((SELECT sql FROM sp_call), 'service_role')) AS done \gset rh_
SELECT pg_temp.rh_case('spends no stack room', '1|0', pg_temp.sp_kept('stack')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
