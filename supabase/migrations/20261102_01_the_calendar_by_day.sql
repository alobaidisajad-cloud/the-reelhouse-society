-- ════════════════════════════════════════════════════════════════════════════
-- 20261102_01 — the calendar, one row a day.
-- ════════════════════════════════════════════════════════════════════════════
--   The Viewing Calendar draws how many films a member saw on each day of the
--   last 52 weeks. It read every log of that year, newest first, and the house
--   answers no read with more than 1,000 rows: past 1,000 films in a year, the
--   oldest days were drawn empty (WORKLIST P4.9). calendar_days answers one row
--   a day, the day and its films, for the days the grid can draw in any zone:
--   never more than 366 rows, so no answer is cut. It runs with the caller's
--   own rights, so the logs' read rules decide what is counted exactly as they
--   decide what is read.
-- Undo: mobile/supabase/migrations-down/20261102_01_the_calendar_by_day.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.calendar_days(p_user_id uuid) RETURNS TABLE(day date, films integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- The grid's 364 days end on the member's today: the house's yesterday, today or tomorrow.
  SELECT l.watched_date, count(*)::integer
    FROM public.logs l
   WHERE l.user_id = p_user_id
     AND l.watched_date BETWEEN (now() AT TIME ZONE 'UTC')::date - 364 AND (now() AT TIME ZONE 'UTC')::date + 1
   GROUP BY l.watched_date
   ORDER BY l.watched_date DESC;
$$;

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.calendar_days(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_days(uuid) TO anon;
GRANT ALL ON FUNCTION public.calendar_days(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_days(uuid) TO service_role;
