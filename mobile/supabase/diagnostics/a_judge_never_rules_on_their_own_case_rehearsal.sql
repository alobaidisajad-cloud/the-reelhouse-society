-- ════════════════════════════════════════════════════════════════════════════
-- a_judge_never_rules_on_their_own_case_rehearsal.sql — 20261122_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_judge_never_rules_on_their_own_case_rehearsal.sql
--
-- 20261122_03 is applied on production (the train of 2026-11-23); this shows it still holds there, and on every sealed copy.
-- Then two moderators, acting as themselves, find a case about one of them judged only by the other,
-- alone or in a bulk dismissal (stage C, the kinds pass). Every row here is undone with the
-- transaction. Read each NOTICE as  case|expected|got ; the last line is the verdict, and any miss
-- makes psql exit non-zero.
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

-- ── a moderator never rules on a case about themselves ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Members 1 and 2 are the house's moderators; member 3 reports; member 4 is another member.
UPDATE public.profiles SET role = 'admin' WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2));
UPDATE public.profiles SET role = 'free' WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (3, 4)) AND role = 'admin';

-- Four cases, each reported by 3: two about moderator 1, two about member 4.
CREATE TEMP TABLE ojc_cases (k text, id uuid) ON COMMIT DROP;
INSERT INTO ojc_cases VALUES ('own_a', gen_random_uuid()), ('own_b', gen_random_uuid()), ('other_a', gen_random_uuid()), ('other_b', gen_random_uuid());
INSERT INTO public.reports (id, reporter_id, content_type, content_id, reason, status, target_user_id)
SELECT c.id, (SELECT id FROM rehearsal_members WHERE n = 3), 'lounge_message', c.id::text, 'other', 'pending', t.id
  FROM ojc_cases c
  JOIN rehearsal_members t ON t.n = CASE WHEN c.k LIKE 'own%' THEN 1 ELSE 4 END;

-- Runs a call as one moderator, as themselves; says 'ok' or the refusal's code and word.
CREATE FUNCTION pg_temp.ojc_as(p_n bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_n), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v_state || ' ' || v_msg;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'ok';
END $$;
CREATE FUNCTION pg_temp.ojc_resolve(p_k text, p_admin bigint) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.resolve_moderation_report_v2(%L, %L, %L, %L)', (SELECT id FROM ojc_cases WHERE k = p_k), 'dismiss',
                (SELECT id FROM rehearsal_members WHERE n = p_admin), 'rh rehearsal verdict');
$$;
CREATE FUNCTION pg_temp.ojc_status(p_k text) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.reports WHERE id = (SELECT id FROM ojc_cases WHERE k = p_k);
$$;

SELECT pg_temp.rh_case('moderator 1 dismisses a case about themselves: refused, as their own', '42501 OWN_CASE',
  pg_temp.ojc_as(1, pg_temp.ojc_resolve('own_a', 1))) AS done \gset rh_
SELECT pg_temp.rh_case('and the case still waits', 'pending', pg_temp.ojc_status('own_a')) AS done \gset rh_
SELECT pg_temp.rh_case('moderator 1 judges a case about another member', 'ok', pg_temp.ojc_as(1, pg_temp.ojc_resolve('other_a', 1))) AS done \gset rh_
SELECT pg_temp.rh_case('moderator 2 judges the case about moderator 1', 'ok', pg_temp.ojc_as(2, pg_temp.ojc_resolve('own_a', 2))) AS done \gset rh_
SELECT pg_temp.rh_case('and it is closed', 'resolved', pg_temp.ojc_status('own_a')) AS done \gset rh_

-- A bulk dismissal by moderator 1 of a case about themselves and one about another member: the other
-- is closed and counted, their own left pending for moderator 2.
CREATE TEMP TABLE ojc_counted (n int) ON COMMIT DROP;
GRANT INSERT ON ojc_counted TO authenticated;
SELECT pg_temp.rh_case('moderator 1 dismisses both at once: the call stands', 'ok',
  pg_temp.ojc_as(1, format('INSERT INTO ojc_counted SELECT public.bulk_dismiss_reports(ARRAY[%L, %L]::uuid[], %L)',
    (SELECT id FROM ojc_cases WHERE k = 'own_b'), (SELECT id FROM ojc_cases WHERE k = 'other_b'), (SELECT id FROM rehearsal_members WHERE n = 1)))) AS done \gset rh_
SELECT pg_temp.rh_case('it counts the one it closed', '1', (SELECT n::text FROM ojc_counted)) AS done \gset rh_
SELECT pg_temp.rh_case('the case about another member is closed', 'resolved', pg_temp.ojc_status('other_b')) AS done \gset rh_
SELECT pg_temp.rh_case('the case about moderator 1 still waits, for another moderator', 'pending', pg_temp.ojc_status('own_b')) AS done \gset rh_
SELECT pg_temp.rh_case('no verdict is recorded for it', '0',
  (SELECT count(*)::text FROM public.mod_actions WHERE report_id = (SELECT id FROM ojc_cases WHERE k = 'own_b'))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
