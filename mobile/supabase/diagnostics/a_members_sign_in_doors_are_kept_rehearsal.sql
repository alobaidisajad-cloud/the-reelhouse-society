-- ════════════════════════════════════════════════════════════════════════════
-- a_members_sign_in_doors_are_kept_rehearsal.sql — 20261120_00. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_sign_in_doors_are_kept_rehearsal.sql
--
-- 20261120_00 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
-- Then the house find what it fixes holding (review round 14).
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

-- ── H-A1.table ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A1's tables rehearsal · made, closed to members and visitors (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train. The cases that
-- write the tables are H-A1's (its functions are the tables' only writers).
CREATE FUNCTION pg_temp.ha1t_read(p_role text, p_table text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE format('SELECT count(*)::text FROM public.%I', p_table) INTO v;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v = RETURNED_SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  RETURN v;
END $$;
SELECT pg_temp.rh_case('the three tables stand, row security on', '3',
  (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('sign_in_doors', 'sign_in_handles', 'sign_in_devices') AND c.relrowsecurity)) AS done \gset rh_
SELECT pg_temp.rh_case('no member reads them', '42501,42501,42501',
  pg_temp.ha1t_read('authenticated', 'sign_in_doors') || ',' || pg_temp.ha1t_read('authenticated', 'sign_in_handles') || ',' || pg_temp.ha1t_read('authenticated', 'sign_in_devices')) AS done \gset rh_
SELECT pg_temp.rh_case('no visitor reads them', '42501,42501,42501',
  pg_temp.ha1t_read('anon', 'sign_in_doors') || ',' || pg_temp.ha1t_read('anon', 'sign_in_handles') || ',' || pg_temp.ha1t_read('anon', 'sign_in_devices')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
