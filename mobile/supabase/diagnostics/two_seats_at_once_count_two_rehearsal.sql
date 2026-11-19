-- ════════════════════════════════════════════════════════════════════════════
-- two_seats_at_once_count_two_rehearsal.sql — 20261119_11. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs two_seats_at_once_count_two_rehearsal.sql --with-train
--
-- The train applies 20261119_11 here (with_train), 20261119_00 to 20261119_10 already applied; a sealed copy already holds it.
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

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261119_11 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── H-A4 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A4 rehearsal · a salon's member count is its approved seats at every step (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). 1 keeps an open salon (one seat,
-- theirs); 2, 3 and 4, ranked for the run, take a seat, each as themselves: the count is 4. 2 takes a
-- seat again (the same seat, nothing changes): still 4. 1 mutes 3 and bans 4, as the host: 2. 2 steps
-- out, as themselves: 1. 1 lets 3 speak again: 2. At every step the count equals the approved seats.
-- And the one-time repair has left no salon in the house whose count differs from its approved seats.
-- (Two seats committed at the same moment, the defect itself, need two sessions: each now counts
-- after it holds the salon's row, so the order cannot matter; proved on the local PostgreSQL with two
-- sessions, the old function leaving 1 of 2 and this one 2 of 2.)

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
SELECT count(*) AS done FROM rehearsal_members m, public.grant_entitlement(m.id, 'archivist', 'manual') g
 WHERE m.n IN (2, 3, 4) \gset rh_

CREATE TEMP TABLE ha4_salon ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private, member_count)
  VALUES ('The H-A4 Corner', (SELECT id FROM rehearsal_members WHERE n = 1), false, 0)
  RETURNING id)
SELECT id FROM made;
GRANT SELECT ON ha4_salon TO authenticated;
DELETE FROM public.lounge_sanctions
 WHERE lounge_id = (SELECT id FROM ha4_salon) AND user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM ha4_salon);
-- The host's own seat, as create_lounge lays it.
INSERT INTO public.lounge_members (lounge_id, user_id, status)
VALUES ((SELECT id FROM ha4_salon), (SELECT id FROM rehearsal_members WHERE n = 1), 'approved');

-- A member acts as themselves.
CREATE FUNCTION pg_temp.ha4_as(p_member bigint, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
-- The count against the approved seats, as "count|seats".
CREATE FUNCTION pg_temp.ha4_count() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT member_count FROM public.lounges WHERE id = (SELECT id FROM ha4_salon))::text || '|'
      || (SELECT count(*) FROM public.lounge_members
           WHERE lounge_id = (SELECT id FROM ha4_salon) AND status = 'approved')::text;
$$;

SELECT pg_temp.rh_case('a salon with its host''s seat counts one', '1|1', pg_temp.ha4_count()) AS done \gset rh_
SELECT count(pg_temp.ha4_as(n, format('SELECT public.join_public_lounge(%L)', (SELECT id FROM ha4_salon)))) AS done
  FROM (SELECT n FROM rehearsal_members WHERE n IN (2, 3, 4) ORDER BY n) m \gset rh_
SELECT pg_temp.rh_case('three members take a seat, each as themselves: four', '4|4', pg_temp.ha4_count()) AS done \gset rh_
SELECT pg_temp.ha4_as(2, format('SELECT public.join_public_lounge(%L)', (SELECT id FROM ha4_salon))) AS done \gset rh_
SELECT pg_temp.rh_case('a seat taken again changes nothing', '4|4', pg_temp.ha4_count()) AS done \gset rh_
SELECT pg_temp.ha4_as(1, format('SELECT public.set_lounge_member_status(%L, %L, %L)',
  (SELECT id FROM ha4_salon), (SELECT id FROM rehearsal_members WHERE n = 3), 'muted')) AS done \gset rh_
SELECT pg_temp.ha4_as(1, format('SELECT public.set_lounge_member_status(%L, %L, %L)',
  (SELECT id FROM ha4_salon), (SELECT id FROM rehearsal_members WHERE n = 4), 'banned')) AS done \gset rh_
SELECT pg_temp.rh_case('the host mutes one and bans one: two', '2|2', pg_temp.ha4_count()) AS done \gset rh_
SELECT pg_temp.ha4_as(2, format('DELETE FROM public.lounge_members WHERE lounge_id = %L AND user_id = %L',
  (SELECT id FROM ha4_salon), (SELECT id FROM rehearsal_members WHERE n = 2))) AS done \gset rh_
SELECT pg_temp.rh_case('a member steps out, as themselves: one', '1|1', pg_temp.ha4_count()) AS done \gset rh_
SELECT pg_temp.ha4_as(1, format('SELECT public.set_lounge_member_status(%L, %L, %L)',
  (SELECT id FROM ha4_salon), (SELECT id FROM rehearsal_members WHERE n = 3), 'approved')) AS done \gset rh_
SELECT pg_temp.rh_case('the host lets the muted member speak again: two', '2|2', pg_temp.ha4_count()) AS done \gset rh_
-- A count made wrong by hand (a salon's row laid with any count) is set right at the next seat.
UPDATE public.lounges SET member_count = 999 WHERE id = (SELECT id FROM ha4_salon);
SELECT pg_temp.ha4_as(2, format('SELECT public.join_public_lounge(%L)', (SELECT id FROM ha4_salon))) AS done \gset rh_
SELECT pg_temp.rh_case('a wrong count is set right by the next seat taken: three', '3|3', pg_temp.ha4_count()) AS done \gset rh_

-- Two seats at once, each after its own foreign-key check holds the salon FOR KEY SHARE, must not
-- deadlock: the count holds the salon FOR NO KEY UPDATE, which that share allows, never FOR UPDATE,
-- which waits on it (proved with two sessions on the local PostgreSQL, both orders). One
-- transaction cannot hold two sessions, so the lock the function takes is read from it.
SELECT pg_temp.rh_case('the count holds the salon as an update of its row does, never against a key share', 'true|false',
  (SELECT (position('FOR NO KEY UPDATE' in d) > 0)::text || '|' || (d ~ 'v_lounge\s+FOR\s+UPDATE')::text
     FROM (SELECT pg_get_functiondef('public.recount_lounge_members()'::regprocedure) AS d) f)) AS done \gset rh_
SELECT pg_temp.rh_case('no salon in the house counts other than its approved seats (the one-time repair)', '0',
  (SELECT count(*)::text
     FROM public.lounges l
    WHERE l.created_at < now()   -- made before this run: a salon made by hand in it counts at its first seat
      AND l.member_count IS DISTINCT FROM
          (SELECT count(*) FROM public.lounge_members m WHERE m.lounge_id = l.id AND m.status = 'approved'))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
