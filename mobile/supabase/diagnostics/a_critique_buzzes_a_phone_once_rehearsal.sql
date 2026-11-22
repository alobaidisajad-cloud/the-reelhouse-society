-- ════════════════════════════════════════════════════════════════════════════
-- a_critique_buzzes_a_phone_once_rehearsal.sql — 20261120_07. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_critique_buzzes_a_phone_once_rehearsal.sql
--
-- 20261120_07 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE ha3p_queued (n serial, what text, queued bigint) ON COMMIT DROP;

-- ── H-A3 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A3 rehearsal · a member's critiques to another buzz that phone once an hour, every other push as before (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-A3.up applied;
-- its triggers, and the pace they ask, are H-A3.locks' rehearsal), with its rehearsal_members (n = 1..4).
-- The critique notices are written as the house's own critique triggers write them. 3's critique of 2's
-- record: told and pushed; 3's second critique of it, and 3's critiques of 2's stack and of thirty more
-- of 2's records: each told, none pushed (one push an hour from one member to another, whatever the
-- piece); 4's critique of 2's record: pushed (another critic); 3's critique of 4's record: pushed
-- (another member); an hour on, 3's next critique to 2: pushed. A critique taken as the answer is pushed
-- once as before. No client may run the pace's function.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) - 'notif_comments'
 WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.house_settings SET pushes_sent = true;
DELETE FROM public.certifications_pushed
 WHERE from_user_id = ANY (ARRAY(SELECT id FROM rehearsal_members)) AND (thing LIKE 'critique_to:%' OR thing LIKE 'answer:%');

CREATE FUNCTION pg_temp.ha3p_mark(p_what text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO ha3p_queued (what, queued) SELECT p_what, count(*) FROM net.http_request_queue;
$$;
CREATE FUNCTION pg_temp.ha3p_pushed(p_what text) RETURNS text LANGUAGE sql AS $$
  SELECT (q.queued - (SELECT b.queued FROM ha3p_queued b WHERE b.n < q.n ORDER BY b.n DESC LIMIT 1))::text
    FROM ha3p_queued q WHERE q.what = p_what;
$$;
-- A critique's notice from one member to another, as notify_on_log_comment and its like write it.
CREATE FUNCTION pg_temp.ha3p_told(p_from bigint, p_to bigint, p_group text, p_meta jsonb DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.notifications (user_id, type, from_user_id, message, group_key, metadata)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = p_to), 'comment', (SELECT id FROM rehearsal_members WHERE n = p_from),
          'left a critique on your rehearsal piece.', p_group, p_meta);
$$;
CREATE FUNCTION pg_temp.ha3p_count(p_from bigint, p_to bigint) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.notifications
   WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = p_to) AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = p_from)
     AND type = 'comment' AND message = 'left a critique on your rehearsal piece.';
$$;

SELECT pg_temp.ha3p_mark('before') AS done \gset rh_
SELECT pg_temp.ha3p_told(3, 2, 'endorse:log:00000000-0000-4000-8000-0000000a3001') AS done \gset rh_
SELECT pg_temp.ha3p_mark('3 on the record') AS done \gset rh_
SELECT pg_temp.ha3p_told(3, 2, 'endorse:log:00000000-0000-4000-8000-0000000a3001') AS done \gset rh_
SELECT pg_temp.ha3p_mark('3 again on the record') AS done \gset rh_
SELECT pg_temp.ha3p_told(3, 2, 'endorse:list:00000000-0000-4000-8000-0000000a3002') AS done \gset rh_
SELECT pg_temp.ha3p_mark('3 on the stack') AS done \gset rh_
SELECT pg_temp.ha3p_told(3, 2, 'endorse:log:00000000-0000-4000-8000-00000a3' || lpad(g::text, 5, '0')) FROM generate_series(1, 30) g;
SELECT pg_temp.ha3p_mark('3 on thirty more records') AS done \gset rh_
SELECT pg_temp.ha3p_told(4, 2, 'endorse:log:00000000-0000-4000-8000-0000000a3001') AS done \gset rh_
SELECT pg_temp.ha3p_mark('4 on the record') AS done \gset rh_
SELECT pg_temp.ha3p_told(3, 4, 'endorse:log:00000000-0000-4000-8000-0000000a3005') AS done \gset rh_
SELECT pg_temp.ha3p_mark('3 on 4''s record') AS done \gset rh_
UPDATE public.certifications_pushed SET pushed_at = now() - interval '61 minutes'
 WHERE from_user_id = (SELECT id FROM rehearsal_members WHERE n = 3)
   AND thing = 'critique_to:' || (SELECT id FROM rehearsal_members WHERE n = 2);
SELECT pg_temp.ha3p_told(3, 2, 'endorse:log:00000000-0000-4000-8000-0000000a3001') AS done \gset rh_
SELECT pg_temp.ha3p_mark('3 an hour on') AS done \gset rh_
SELECT pg_temp.ha3p_told(2, 3, 'endorse:post:00000000-0000-4000-8000-0000000a3003',
  '{"answer": true, "comment_id": "00000000-0000-4000-8000-0000000a3004"}') AS done \gset rh_
SELECT pg_temp.ha3p_mark('an answer') AS done \gset rh_
SELECT pg_temp.ha3p_told(2, 3, 'endorse:post:00000000-0000-4000-8000-0000000a3003',
  '{"answer": true, "comment_id": "00000000-0000-4000-8000-0000000a3004"}') AS done \gset rh_
SELECT pg_temp.ha3p_mark('the answer again') AS done \gset rh_

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a critique is pushed', '1', pg_temp.ha3p_pushed('3 on the record'));
  PERFORM pg_temp.rh_case('a second critique of the same piece within the hour is not', '0', pg_temp.ha3p_pushed('3 again on the record'));
  PERFORM pg_temp.rh_case('nor one of another of the same member''s pieces', '0', pg_temp.ha3p_pushed('3 on the stack'));
  PERFORM pg_temp.rh_case('nor thirty more at once', '0', pg_temp.ha3p_pushed('3 on thirty more records'));
  PERFORM pg_temp.rh_case('every one of the critique''s notices is written, the pushed and the unpushed', '34', pg_temp.ha3p_count(3, 2));
  PERFORM pg_temp.rh_case('another critic on the same piece is pushed', '1', pg_temp.ha3p_pushed('4 on the record'));
  PERFORM pg_temp.rh_case('the same critic to another member is pushed', '1', pg_temp.ha3p_pushed('3 on 4''s record'));
  PERFORM pg_temp.rh_case('an hour on, the critic''s next critique to the member is pushed again', '1', pg_temp.ha3p_pushed('3 an hour on'));
  PERFORM pg_temp.rh_case('a critique taken as the answer is pushed', '1', pg_temp.ha3p_pushed('an answer'));
  PERFORM pg_temp.rh_case('once, as before', '0', pg_temp.ha3p_pushed('the answer again'));
  PERFORM pg_temp.rh_case('no client may run the pace''s function', 'false|false',
    has_function_privilege('authenticated', 'public.check_critique_pace()', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.check_critique_pace()', 'EXECUTE')::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
