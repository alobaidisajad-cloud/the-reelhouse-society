-- ════════════════════════════════════════════════════════════════════════════
-- a_members_room_to_critique_is_kept_rehearsal.sql — 20261120_06. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_room_to_critique_is_kept_rehearsal.sql --with-train
--
-- The train applies 20261120_06 here (with_train), 20261120_00 to 20261120_05 already applied; a sealed copy already holds it.
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

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_06_a_members_room_to_critique_is_kept.sql
\endif

-- ── H-A3.table ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A3's table rehearsal · a member neither reads nor writes the room to critique (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql, with its rehearsal_members.
-- Member 1, as themselves, can neither read the table nor give themselves more room in it.

CREATE FUNCTION pg_temp.ha3t_try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'refused';
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'allowed';
END $$;

SELECT pg_temp.rh_case('a member does not read the room each member has to critique', 'refused',
  pg_temp.ha3t_try('SELECT count(*) FROM public.critique_budget')) AS done \gset rh_
SELECT pg_temp.rh_case('nor give themselves more of it', 'refused',
  pg_temp.ha3t_try(format('INSERT INTO public.critique_budget (user_id, tokens, refilled_at, day, swept_at) VALUES (%L, 1e9, now(), current_date, now())',
    (SELECT id FROM rehearsal_members WHERE n = 1)))) AS done \gset rh_
SELECT pg_temp.rh_case('nor wipe it', 'refused',
  pg_temp.ha3t_try('DELETE FROM public.critique_budget')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
