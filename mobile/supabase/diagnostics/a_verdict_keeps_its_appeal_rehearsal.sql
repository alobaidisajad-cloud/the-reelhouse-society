-- ════════════════════════════════════════════════════════════════════════════
-- a_verdict_keeps_its_appeal_rehearsal.sql — 20261120_21. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_verdict_keeps_its_appeal_rehearsal.sql
--
-- 20261120_21 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE hb6l_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON hb6l_ids TO authenticated;

-- ── H-B6.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B6's columns rehearsal · a verdict keeps its one appeal, and no member writes it (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and H-B6.locks, with its
-- rehearsal_members (n = 1..4). A warning is laid on member 2 by member 4. Then:
--   member 2, as themselves, reads their verdict and its (empty) appeal, and cannot write an appeal or a
--   lifting onto it by hand (no rule lets a member update a verdict);
--   member 1 reads nothing of 2's verdict;
--   the rules hold for the house's own writes: an appeal over 1,000 characters, an appeal without its
--   moment or its status, and a status outside pending, upheld, overturned are refused; a removal's copy
--   of a long essay (over the old 30,000) is taken.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET role = 'free' WHERE id IN (SELECT id FROM rehearsal_members WHERE n < 4) AND role = 'admin';
WITH made AS (INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 4), 'warn', 'rh a warning') RETURNING id)
INSERT INTO hb6l_ids SELECT 'verdict', id FROM made;

CREATE FUNCTION pg_temp.hb6l_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v_got, 'none');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb6l_as(bigint, text) TO authenticated;
-- The house's own write, its refusal's code or 'taken'.
CREATE FUNCTION pg_temp.hb6l_house(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'taken';
EXCEPTION WHEN OTHERS THEN
  RETURN 'refused: ' || SQLSTATE;
END $$;

SELECT pg_temp.rh_case('the member reads their verdict and its empty appeal', 'rh a warning|none',
  pg_temp.hb6l_as(2, 'SELECT reason || ''|'' || coalesce(appeal_status, ''none'') FROM public.mod_actions WHERE id = (SELECT id FROM hb6l_ids WHERE what = ''verdict'')'));
SELECT pg_temp.rh_case('the member writes an appeal by hand: nothing changes', '0',
  pg_temp.hb6l_as(2, 'WITH u AS (UPDATE public.mod_actions SET appeal = ''rh by hand'', appeal_filed_at = now(), appeal_status = ''overturned'' WHERE id = (SELECT id FROM hb6l_ids WHERE what = ''verdict'') RETURNING 1) SELECT count(*)::text FROM u'));
SELECT pg_temp.rh_case('the member lifts their verdict by hand: nothing changes', '0',
  pg_temp.hb6l_as(2, 'WITH u AS (UPDATE public.mod_actions SET lifted_at = now() WHERE id = (SELECT id FROM hb6l_ids WHERE what = ''verdict'') RETURNING 1) SELECT count(*)::text FROM u'));
SELECT pg_temp.rh_case('the verdict stands unappealed', 'none',
  (SELECT coalesce(appeal_status, 'none') || coalesce(lifted_at::text, '') FROM public.mod_actions WHERE id = (SELECT id FROM hb6l_ids WHERE what = 'verdict')));
SELECT pg_temp.rh_case('another member reads nothing of it', '0',
  pg_temp.hb6l_as(1, 'SELECT count(*)::text FROM public.mod_actions WHERE id = (SELECT id FROM hb6l_ids WHERE what = ''verdict'')'));

SELECT pg_temp.rh_case('an appeal over 1,000 characters', 'refused: 23514',
  pg_temp.hb6l_house(format('UPDATE public.mod_actions SET appeal = %L, appeal_filed_at = now(), appeal_status = ''pending'' WHERE id = %L', repeat('x', 1001), (SELECT id FROM hb6l_ids WHERE what = 'verdict'))));
SELECT pg_temp.rh_case('an appeal without its moment', 'refused: 23514',
  pg_temp.hb6l_house(format('UPDATE public.mod_actions SET appeal = ''rh'', appeal_status = ''pending'' WHERE id = %L', (SELECT id FROM hb6l_ids WHERE what = 'verdict'))));
SELECT pg_temp.rh_case('a status outside the three', 'refused: 23514',
  pg_temp.hb6l_house(format('UPDATE public.mod_actions SET appeal = ''rh'', appeal_filed_at = now(), appeal_status = ''granted'' WHERE id = %L', (SELECT id FROM hb6l_ids WHERE what = 'verdict'))));
SELECT pg_temp.rh_case('a whole appeal is taken', 'taken',
  pg_temp.hb6l_house(format('UPDATE public.mod_actions SET appeal = ''rh'', appeal_filed_at = now(), appeal_status = ''pending'' WHERE id = %L', (SELECT id FROM hb6l_ids WHERE what = 'verdict'))));
SELECT pg_temp.rh_case('the copy of a long essay removed is taken', 'taken',
  pg_temp.hb6l_house(format('INSERT INTO public.mod_actions (target_user_id, admin_id, action, reason, content_snapshot) VALUES (%L, %L, ''delete_content'', ''rh'', %L)',
    (SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 4), jsonb_build_object('found', true, 'body', repeat('"', 25000)))));

SELECT pg_temp.rh_verdict();
ROLLBACK;
