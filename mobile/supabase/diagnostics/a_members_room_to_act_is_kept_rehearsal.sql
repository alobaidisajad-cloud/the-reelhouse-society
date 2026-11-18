-- ════════════════════════════════════════════════════════════════════════════
-- a_members_room_to_act_is_kept_rehearsal.sql — 20261119_00. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_room_to_act_is_kept_rehearsal.sql --with-train
--
-- The train applies 20261119_00 here (with_train); a sealed copy already holds it.
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
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_00_a_members_room_to_act_is_kept.sql
\endif

-- ── H-A2.table ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── H-A2's tables rehearsal · a member reads and writes neither (review round 13) ─────────────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql, with its rehearsal_members.
-- Member 1, as themselves, can neither read nor write either table; the house holds both, empty of
-- any row of theirs a member could have laid.

CREATE FUNCTION pg_temp.ha2t_try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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

SELECT pg_temp.rh_case('a member does not read the room each member has to act', 'refused',
  pg_temp.ha2t_try('SELECT count(*) FROM public.interaction_budget')) AS done \gset rh_
SELECT pg_temp.rh_case('nor give themselves more of it', 'refused',
  pg_temp.ha2t_try(format('INSERT INTO public.interaction_budget (user_id, tokens, refilled_at, day, swept_at) VALUES (%L, 1e9, now(), current_date, now())',
    (SELECT id FROM rehearsal_members WHERE n = 1)))) AS done \gset rh_
SELECT pg_temp.rh_case('a member does not read the acts at one thing', 'refused',
  pg_temp.ha2t_try('SELECT count(*) FROM public.interaction_churn')) AS done \gset rh_
SELECT pg_temp.rh_case('nor wipe their own', 'refused',
  pg_temp.ha2t_try('DELETE FROM public.interaction_churn')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
