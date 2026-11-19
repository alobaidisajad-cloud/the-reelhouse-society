-- ════════════════════════════════════════════════════════════════════════════
-- the_tribunal_reads_the_words_as_reported_rehearsal.sql — 20261120_23. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_tribunal_reads_the_words_as_reported_rehearsal.sql --with-train
--
-- The train applies 20261120_23 here (with_train), 20261120_00 to 20261120_22 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE hb5_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON hb5_ids TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_23_the_tribunal_reads_the_words_as_reported.sql
\endif

-- ── H-B5 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B5 rehearsal · the words a member reported are kept when the report is filed (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-B5.table and
-- H-B5 applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Member 4 is the house's moderator. Member 2 keeps two logs and a critique on one. Then, each as
-- themselves:
--   member 1 reports 2's first log, and 2 edits its review into something harmless: the moderator reads
--     the harmless words now, the reported words beside them, and that they changed;
--   member 3 reports 2's critique, and 2 deletes it: the moderator reads it destroyed, the reported
--     words beside it;
--   member 3 reports 2's second log, untouched: the moderator reads it as reported, unchanged;
--   a report filed before the house kept words reads exactly as before (no words beside it);
--   the reporter cannot read the words back; a member who is no moderator cannot read the evidence.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles SET is_banned = false, suspended_until = NULL WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
UPDATE public.profiles SET role = 'free' WHERE id IN (SELECT id FROM rehearsal_members WHERE n < 4) AND role = 'admin';
DELETE FROM public.reports WHERE reporter_id IN (SELECT id FROM rehearsal_members);

WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990000501, 'rh film one of 2', '2026-01-01', 'rh the hateful words of 2') RETURNING id)
INSERT INTO hb5_ids SELECT 'log', id FROM made;
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990000502, 'rh film two of 2', '2026-01-02', 'rh the second words of 2') RETURNING id)
INSERT INTO hb5_ids SELECT 'log two', id FROM made;
WITH made AS (INSERT INTO public.log_comments (log_id, user_id, body)
              VALUES ((SELECT id FROM hb5_ids WHERE what = 'log two'), (SELECT id FROM rehearsal_members WHERE n = 2), 'rh the critique of 2') RETURNING id)
INSERT INTO hb5_ids SELECT 'critique', id FROM made;

-- One act as a member, as themselves: what it answers, or the refusal's code.
CREATE FUNCTION pg_temp.hb5_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
GRANT EXECUTE ON FUNCTION pg_temp.hb5_as(bigint, text) TO authenticated;
-- A report filed by a member, kept under a name for the cases below.
CREATE FUNCTION pg_temp.hb5_report(p_what text, p_member bigint, p_piece text, p_type text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_id text;
BEGIN
  v_id := pg_temp.hb5_as(p_member, format('SELECT public.submit_report(%L, %L, %L, %L)::text',
    (SELECT id FROM rehearsal_members WHERE n = p_member), (SELECT id FROM hb5_ids WHERE what = p_piece), p_type, 'harassment'));
  IF v_id !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: % was refused: %', p_what, v_id; END IF;
  INSERT INTO hb5_ids VALUES (p_what, v_id::uuid);
  RETURN v_id;
END $$;
-- The evidence of a report, as the moderator (member 4) reads it.
CREATE FUNCTION pg_temp.hb5_evidence(p_what text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  v := pg_temp.hb5_as(4, format('SELECT public.get_report_evidence(%L)::text', (SELECT id FROM hb5_ids WHERE what = p_what)));
  IF v LIKE 'refused:%' THEN RAISE EXCEPTION 'REHEARSAL CANNOT RUN: the evidence of % was refused: %', p_what, v; END IF;
  RETURN v::jsonb;
END $$;

-- Member 1 reports the first log; its author edits it into something harmless.
SELECT pg_temp.hb5_report('report of log', 1, 'log', 'log') AS done \gset rh_
SELECT pg_temp.rh_case('the author edits what was reported', 'done',
  pg_temp.hb5_as(2, format('UPDATE public.logs SET review = %L WHERE id = %L RETURNING ''done''', 'rh nothing to see', (SELECT id FROM hb5_ids WHERE what = 'log'))));
SELECT pg_temp.rh_case('edited: the moderator reads the words now', 'rh nothing to see', pg_temp.hb5_evidence('report of log') ->> 'body');
SELECT pg_temp.rh_case('edited: and the words as reported beside them', 'rh the hateful words of 2', pg_temp.hb5_evidence('report of log') -> 'reported' ->> 'body');
SELECT pg_temp.rh_case('edited: and that they changed', 'true', pg_temp.hb5_evidence('report of log') ->> 'changed');
SELECT pg_temp.rh_case('edited: the piece still stands', 'true', pg_temp.hb5_evidence('report of log') ->> 'found');

-- Member 3 reports the critique; its author deletes it.
SELECT pg_temp.hb5_report('report of critique', 3, 'critique', 'log_comment') AS done \gset rh_
SELECT pg_temp.rh_case('the author deletes what was reported', 'done',
  pg_temp.hb5_as(2, format('DELETE FROM public.log_comments WHERE id = %L RETURNING ''done''', (SELECT id FROM hb5_ids WHERE what = 'critique'))));
SELECT pg_temp.rh_case('deleted: the evidence reads as destroyed', 'false', pg_temp.hb5_evidence('report of critique') ->> 'found');
SELECT pg_temp.rh_case('deleted: with the words as reported beside it', 'rh the critique of 2', pg_temp.hb5_evidence('report of critique') -> 'reported' ->> 'body');
SELECT pg_temp.rh_case('deleted: never told as changed', 'false', pg_temp.hb5_evidence('report of critique') ->> 'changed');

-- Member 3 reports the second log, which nobody touches.
SELECT pg_temp.hb5_report('report of log two', 3, 'log two', 'log') AS done \gset rh_
SELECT pg_temp.rh_case('untouched: read as it stands', 'rh the second words of 2', pg_temp.hb5_evidence('report of log two') ->> 'body');
SELECT pg_temp.rh_case('untouched: the same words as reported', 'rh the second words of 2', pg_temp.hb5_evidence('report of log two') -> 'reported' ->> 'body');
SELECT pg_temp.rh_case('untouched: not changed', 'false', pg_temp.hb5_evidence('report of log two') ->> 'changed');
SELECT pg_temp.rh_case('untouched: its film named as the title', 'rh film two of 2', pg_temp.hb5_evidence('report of log two') -> 'reported' ->> 'title');

-- A report filed before the house kept words: exactly the evidence it always had.
DELETE FROM public.reported_words WHERE report_id = (SELECT id FROM hb5_ids WHERE what = 'report of log two');
SELECT pg_temp.rh_case('a report from before: no words beside it', 'found,route,title,body',
  (SELECT string_agg(k, ',' ORDER BY array_position(ARRAY['found','route','title','body'], k)) FROM jsonb_object_keys(pg_temp.hb5_evidence('report of log two')) k));

-- The reporter reads their own report, never its words; a member who is no moderator reads no evidence.
SELECT pg_temp.rh_case('the reporter reads their own report', 'pending',
  pg_temp.hb5_as(1, format('SELECT status FROM public.reports WHERE id = %L', (SELECT id FROM hb5_ids WHERE what = 'report of log'))));
SELECT pg_temp.rh_case('the reporter cannot read the words kept', 'refused: 42501',
  left(pg_temp.hb5_as(1, 'SELECT count(*)::text FROM public.reported_words'), 14));
SELECT pg_temp.rh_case('a member who is no moderator reads no evidence', 'refused: P0001 Not authorized',
  pg_temp.hb5_as(1, format('SELECT public.get_report_evidence(%L)::text', (SELECT id FROM hb5_ids WHERE what = 'report of log'))));

SELECT pg_temp.rh_verdict();
ROLLBACK;
