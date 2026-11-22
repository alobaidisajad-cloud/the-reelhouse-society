-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_21 — the calendar and the Year in Cinema read the span they show, never the whole record.
-- ════════════════════════════════════════════════════════════════════════════
--   calendar_days (the profile's grid of a year's nights) and year_viewings (the Year in Cinema)
--   read a member's viewings through member_viewings, which reads every one of the member's records
--   and only then keeps the span: the whale's calendar read 40,000 rows at 100,000 members for one
--   year of its 10,000 films. Both now read their span alone (private.viewings_between): each
--   record's last viewing by its day (idx_logs_user_watched_id), and the records seen again in the
--   span by the months of their earlier viewings (20261122_20's index, through
--   private.logs_seen_again_in). The same viewings, counted and ordered as before, by the caller's
--   own rights as before. Then the logs are analysed, so the planner knows 20261122_20's index.
--   Applied after 20261122_19 and _20; if the train stops before this car, both read as
--   20261117_01 left them, answering as before.
-- Undo: mobile/supabase/migrations-down/20261122_21_a_year_of_viewings_reads_that_year.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- The records of a member seen again on a day of a span: the logs whose earlier viewings hold a key of
-- the span's months (20261122_20's index). Ids alone, of any record; the read that asks keeps those its
-- caller may read. With the house's rights, as the index is read only by a read the logs' read rules do
-- not stand in front of (a member's own rules are asked of every row before a test the planner cannot
-- prove harmless, and the index's test is one).
-- add-only (1): no shipped client uses it: a function this car makes for the reads of a span, in private, which the API never serves: TestFlight build 41 and the website cannot call it
CREATE OR REPLACE FUNCTION private.logs_seen_again_in(p_user_id uuid, p_first date, p_last date) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce(array_agg(l.id), '{}'::uuid[])
    FROM public.logs l
   WHERE jsonb_typeof(l.viewing_history) = 'array' AND l.viewing_history <> '[]'::jsonb
     AND private.viewing_months(l.user_id, l.viewing_history, l.created_at) && private.viewing_months_between(p_user_id, p_first, p_last);
$$;

-- A member's viewings from the first day to the last, as member_viewings names them (each record's
-- viewing on its own day, every earlier viewing in its history on the day it was made, a history day
-- that cannot be read as a date falling back to the day the record was made; a withheld record its
-- author's alone), with each record's film: read by the span, as many rows as it holds. Its rights are
-- the caller's: a record the caller may not read gives no viewing.
-- add-only (1): no shipped client uses it: a function this car makes for the calendar and the year, in private, which the API never serves: TestFlight build 41 and the website cannot call it
CREATE OR REPLACE FUNCTION private.viewings_between(p_user_id uuid, p_first date, p_last date)
RETURNS TABLE(log_id uuid, viewing_id uuid, film_id integer, film_title text, poster_path text, rating numeric, day date)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT l.id, l.viewing_id, l.film_id, l.film_title, l.poster_path, l.rating, l.watched_date
    FROM public.logs l
   WHERE l.user_id = p_user_id
     AND l.watched_date BETWEEN p_first AND p_last
     AND (l.withheld_at IS NULL OR l.user_id = (SELECT auth.uid()))  -- withheld: its author's alone (H-B10)
  UNION ALL
  SELECT l.id, h.viewing_id, l.film_id, l.film_title, l.poster_path, h.rating, h.day
    FROM public.logs l
   CROSS JOIN LATERAL (
     SELECT CASE WHEN pg_input_is_valid(e->>'viewingId', 'uuid') THEN (e->>'viewingId')::uuid END AS viewing_id,
            COALESCE(CASE WHEN e->>'date' ~ '^\d{4}-\d{2}-\d{2}' AND pg_input_is_valid(left(e->>'date', 10), 'date')
                          THEN left(e->>'date', 10)::date END,
                     l.created_at::date) AS day,
            CASE WHEN pg_input_is_valid(e->>'rating', 'numeric') THEN (e->>'rating')::numeric END AS rating
       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.viewing_history) = 'array' THEN l.viewing_history ELSE '[]'::jsonb END) e
      WHERE jsonb_typeof(e) = 'object'
   ) h
   WHERE l.id = ANY ((SELECT private.logs_seen_again_in(p_user_id, p_first, p_last))::uuid[])
     AND l.user_id = p_user_id
     AND (l.withheld_at IS NULL OR l.user_id = (SELECT auth.uid()))  -- withheld: its author's alone (H-B10)
     AND h.day BETWEEN p_first AND p_last;
$$;

-- add-only (1): no shipped client uses it: two functions this car makes, read inside the members' own reads (as the member), in private, which the API never serves: TestFlight build 41 and the website cannot call them
REVOKE ALL ON FUNCTION private.logs_seen_again_in(uuid, date, date), private.viewings_between(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.logs_seen_again_in(uuid, date, date), private.viewings_between(uuid, date, date) TO anon, authenticated, service_role;

-- As 20261117_01 left it, but the grid's year is read alone.
-- add-only (3): it only fixes: the same days and counts for every reader (the rehearsal replays each calendar as the members themselves and compares it with the old reading); TestFlight build 41 and the website read it as before
CREATE OR REPLACE FUNCTION public.calendar_days(p_user_id uuid) RETURNS TABLE(day date, films integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- The grid's 364 days end on the member's today: the house's yesterday, today or tomorrow.
  -- Each viewing on its own day: a rewatch adds a night, it never moves the one before it.
  SELECT v.day, count(*)::integer
    FROM private.viewings_between(p_user_id, (now() AT TIME ZONE 'UTC')::date - 364, (now() AT TIME ZONE 'UTC')::date + 1) v
   GROUP BY v.day
   ORDER BY v.day DESC;
$$;

-- As 20261117_01 left it, but the year is read alone, and a later page only up to its cursor's day.
-- add-only (3): it only fixes: the same viewings in the same order, page by page (the rehearsal replays each year and each next page as the members themselves and compares it with the old reading); TestFlight build 41 and the website read it as before
CREATE OR REPLACE FUNCTION public.year_viewings(p_user_id uuid, p_year integer, p_before_day date DEFAULT NULL::date, p_before_viewing uuid DEFAULT NULL::uuid) RETURNS TABLE(log_id uuid, viewing_id uuid, film_id integer, film_title text, poster_path text, rating numeric, day date)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT v.log_id, v.viewing_id, v.film_id, v.film_title, v.poster_path, v.rating, v.day
    FROM private.viewings_between(p_user_id, make_date(p_year, 1, 1),
                                  CASE WHEN p_before_day IS NULL THEN make_date(p_year, 12, 31)
                                       ELSE LEAST(make_date(p_year, 12, 31), p_before_day) END) v
   WHERE (p_before_day IS NULL OR (v.day, v.viewing_id) < (p_before_day, p_before_viewing))
   ORDER BY v.day DESC, v.viewing_id DESC
   LIMIT 1000;
$$;

-- 20261122_20's index known to the planner.
-- add-only (1): no shipped client uses it: statistics, read by the planner alone
ANALYZE public.logs;
