-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_13 — a member's analytics events are held to a day's ceiling.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A script signed in could write analytics events without limit until the disk was full:
--      analytics_events_daily_ceiling refuses a member's 1,001st event of the house's day (RH429, the
--      seconds to midnight) (review round 14).
--   A new trigger function only; no table is locked. Its count is 20261120_12's, its trigger the car
--   20261120_14, alone.
-- Undo: mobile/supabase/migrations-down/20261120_13_the_events_have_a_days_ceiling.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A6 · a member's analytics events are held to a day's ceiling (review round 14) ─────────────
--   Any member could write analytics_events rows without limit (4 KB each, many to a request), while
--   error_logs beside it is held to 200 a day: a script signed in posting arrays of events in a loop
--   had every row accepted, and since no client reads the table, it grew in silence until the disk
--   was full (the house's failure of 2026-11-04).
--   Now analytics_events_daily_ceiling, before each event is filed, counts it in the member's one row
--   of analytics_budget (the house's UTC day, read and written in one statement, never by reading the
--   events back) and refuses the 1,001st of a day: SQLSTATE RH429, message RATE_LIMITED, DETAIL
--   'day', HINT the seconds to the house's midnight, as the marks' pace says it. A batch that
--   crosses the ceiling is refused whole and costs nothing (its counts roll back with it). The house's
--   own writes (no member signed in) are not counted. Only the website files events (the app files
--   none); it keeps a refused batch and tries it later, quietly, as it does any failure. The trigger is
--   H-A6.locks'; the table H-A6.table's.

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first so it is made new (no grant it did not ask for), called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.analytics_events_daily_ceiling();
CREATE FUNCTION public.analytics_events_daily_ceiling() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_n   integer;
BEGIN
  -- The house's own writes are not counted: a member's request always carries the member.
  IF v_me IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.analytics_budget AS b (user_id, day, n)
  VALUES (v_me, v_day, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    day = v_day,
    n   = (CASE WHEN b.day = v_day THEN b.n ELSE 0 END) + 1
  RETURNING n INTO v_n;
  IF v_n > 1000 THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429', DETAIL = 'day',
      HINT = GREATEST(1, ceil(extract(epoch FROM ((v_day + 1)::timestamp AT TIME ZONE 'UTC') - now())))::integer::text;
  END IF;
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.analytics_events_daily_ceiling() FROM PUBLIC, anon, authenticated;
