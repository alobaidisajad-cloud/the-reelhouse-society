-- ════════════════════════════════════════════════════════════════════════════
-- two_more_kinds_of_notice_rehearsal.sql — 20261118_00. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs two_more_kinds_of_notice_rehearsal.sql --with-train
--
-- The train applies 20261118_00 here (with_train); a sealed copy already holds it. Then the house writes a
-- notice of each new kind and finds it kept, and one of a kind it never writes refused, as before.
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

-- The pieces' own tables, made before the train, empty: each piece fills its own as it runs.

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261118_00 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── G-B6.kinds ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── G-B6 kinds rehearsal · the notices have room for a salon's and a ballot's (review round 12) ──
-- Run inside the car's rehearsal transaction, after rehearsal_kit.sql and the car, with its
-- rehearsal_members (n = 1..4). The house writes member 1 a notice of each new kind and one of the
-- house's own, as the writers of 20261118_01 will: each is kept. A kind the house never writes is
-- refused, as before. The rule is there, and checks each notice written from here on.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- A notice of a kind, written as the house: 'ok', or the refusal's SQLSTATE.
CREATE FUNCTION pg_temp.gk_write(p_kind text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, message)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), p_kind, 'the kinds rehearsal: a notice of the kind ' || p_kind);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;

SELECT pg_temp.rh_case('a salon''s notice is written as its own kind', 'ok', pg_temp.gk_write('salon')) AS done \gset rh_
SELECT pg_temp.rh_case('a ballot''s close is written as its own kind', 'ok', pg_temp.gk_write('ballot')) AS done \gset rh_
SELECT pg_temp.rh_case('the house''s own word is written as before', 'ok', pg_temp.gk_write('system')) AS done \gset rh_
SELECT pg_temp.rh_case('a kind the house never writes is refused, as before', '23514', pg_temp.gk_write('rh-no-such-kind')) AS done \gset rh_
SELECT pg_temp.rh_case('the kinds'' rule is the notices'' own', '1',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_type_check' AND contype = 'c')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
