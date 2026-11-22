-- ════════════════════════════════════════════════════════════════════════════
-- a_bulk_dismissal_tells_each_reporter_rehearsal.sql — 20261120_29. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_bulk_dismissal_tells_each_reporter_rehearsal.sql
--
-- 20261120_29 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE hb9_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON hb9_ids TO authenticated;

-- ── H-B9 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B9 rehearsal · a bulk dismissal tells each reporter (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and H-B9, with its
-- rehearsal_members (n = 1..4); every row is undone with the transaction. Member 4 is the house's
-- moderator. Members 1 and 3 each report one of member 2's logs, and member 1 a third that another
-- moderator's single dismissal has already closed. Member 4 dismisses all three at once: two are closed
-- and counted; members 1 and 3 are each told their report was reviewed, as a single dismissal tells
-- them; the case closed before tells no one twice; the reported member is told nothing.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET is_banned = false, suspended_until = NULL WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
UPDATE public.profiles SET role = 'free' WHERE id IN (SELECT id FROM rehearsal_members WHERE n < 4) AND role = 'admin';
DELETE FROM public.reports WHERE reporter_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.notifications WHERE user_id IN (SELECT id FROM rehearsal_members) AND type = 'moderation';

WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              SELECT (SELECT id FROM rehearsal_members WHERE n = 2), 990000900 + g, 'rh film ' || g, '2026-01-01', 'rh review ' || g
                FROM generate_series(1, 3) g RETURNING id, film_id)
INSERT INTO hb9_ids SELECT 'log ' || (film_id - 990000900), id FROM made;

CREATE FUNCTION pg_temp.hb9_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v_got, 'none');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb9_as(bigint, text) TO authenticated;
CREATE FUNCTION pg_temp.hb9_report(p_member bigint, p_piece text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_id text;
BEGIN
  v_id := pg_temp.hb9_as(p_member, format('SELECT public.submit_report(%L, %L, %L, %L)::text',
    (SELECT id FROM rehearsal_members WHERE n = p_member), (SELECT id FROM hb9_ids WHERE what = p_piece), 'log', 'spam'));
  IF v_id !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: the report of % was refused: %', p_piece, v_id; END IF;
  INSERT INTO hb9_ids VALUES ('case ' || p_piece, v_id::uuid);
END $$;
-- What a member reads of their notices from the house about a report.
CREATE FUNCTION pg_temp.hb9_told(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb9_as(p_member, 'SELECT coalesce(string_agg(title || '':'' || (metadata ->> ''action''), '','' ORDER BY created_at), '''') FROM public.notifications WHERE user_id = auth.uid() AND type = ''moderation''');
$$;

SELECT pg_temp.hb9_report(1, 'log 1') AS done \gset rh_
SELECT pg_temp.hb9_report(3, 'log 2') AS done \gset rh_
SELECT pg_temp.hb9_report(1, 'log 3') AS done \gset rh_
SELECT pg_temp.rh_case('the third case dismissed alone first', 'done',
  pg_temp.hb9_as(4, format('SELECT ''done'' FROM public.resolve_moderation_report_v2(%L, ''dismiss'', %L, ''rh alone'', NULL, true)',
    (SELECT id FROM hb9_ids WHERE what = 'case log 3'), (SELECT id FROM rehearsal_members WHERE n = 4))));
SELECT pg_temp.rh_case('member 1 told once, for the case dismissed alone', 'Your Report Was Reviewed:dismiss', pg_temp.hb9_told(1));

SELECT pg_temp.rh_case('the three dismissed at once: two closed', '2',
  pg_temp.hb9_as(4, format('SELECT public.bulk_dismiss_reports(ARRAY[%L, %L, %L]::uuid[], %L, ''rh at once'')::text',
    (SELECT id FROM hb9_ids WHERE what = 'case log 1'), (SELECT id FROM hb9_ids WHERE what = 'case log 2'), (SELECT id FROM hb9_ids WHERE what = 'case log 3'),
    (SELECT id FROM rehearsal_members WHERE n = 4))));
SELECT pg_temp.rh_case('member 1 told for the case closed at once too, never twice for the other', 'Your Report Was Reviewed:dismiss,Your Report Was Reviewed:dismiss',
  pg_temp.hb9_told(1));
SELECT pg_temp.rh_case('member 1''s notice names its report', '1',
  pg_temp.hb9_as(1, format('SELECT count(*)::text FROM public.notifications WHERE user_id = auth.uid() AND metadata ->> ''report_id'' = %L', (SELECT id FROM hb9_ids WHERE what = 'case log 1'))));
SELECT pg_temp.rh_case('member 3 told', 'Your Report Was Reviewed:dismiss', pg_temp.hb9_told(3));
SELECT pg_temp.rh_case('the reported member told nothing', '', pg_temp.hb9_told(2));
SELECT pg_temp.rh_case('each closed case recorded once', '1|1|1',
  (SELECT string_agg(c::text, '|' ORDER BY w) FROM (SELECT h.what w, (SELECT count(*) FROM public.mod_actions m WHERE m.report_id = h.id) c FROM hb9_ids h WHERE h.what LIKE 'case %') x));

SELECT pg_temp.rh_verdict();
ROLLBACK;
