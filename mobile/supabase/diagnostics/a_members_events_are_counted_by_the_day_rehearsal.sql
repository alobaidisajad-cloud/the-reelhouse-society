-- ════════════════════════════════════════════════════════════════════════════
-- a_members_events_are_counted_by_the_day_rehearsal.sql — 20261120_12. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_members_events_are_counted_by_the_day_rehearsal.sql
--
-- 20261120_12 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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

-- ── H-A6.table ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A6's table rehearsal · a member neither reads nor writes their day's count (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql, with its rehearsal_members.
-- Member 1, as themselves, can neither read the table nor clear their own count in it.

CREATE FUNCTION pg_temp.ha6t_try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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

SELECT pg_temp.rh_case('a member does not read the day''s count of analytics events', 'refused',
  pg_temp.ha6t_try('SELECT count(*) FROM public.analytics_budget')) AS done \gset rh_
SELECT pg_temp.rh_case('nor write their own', 'refused',
  pg_temp.ha6t_try(format('INSERT INTO public.analytics_budget (user_id, day, n) VALUES (%L, current_date, -1000000)',
    (SELECT id FROM rehearsal_members WHERE n = 1)))) AS done \gset rh_
SELECT pg_temp.rh_case('nor clear it', 'refused',
  pg_temp.ha6t_try('DELETE FROM public.analytics_budget')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
