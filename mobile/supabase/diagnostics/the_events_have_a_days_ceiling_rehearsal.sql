-- ════════════════════════════════════════════════════════════════════════════
-- the_events_have_a_days_ceiling_rehearsal.sql — 20261120_13. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_events_have_a_days_ceiling_rehearsal.sql
--
-- 20261120_13 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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

-- ── H-A6 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A6 rehearsal · the day's ceiling's function is the house's alone (review round 14) ───────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-A6.up applied;
-- its trigger, and the ceiling it keeps, are H-A6.locks' rehearsal). No client may run the function.
DO $$ BEGIN
  PERFORM pg_temp.rh_case('no client may run the analytics ceiling''s function', 'false|false',
    has_function_privilege('authenticated', 'public.analytics_events_daily_ceiling()', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.analytics_events_daily_ceiling()', 'EXECUTE')::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
