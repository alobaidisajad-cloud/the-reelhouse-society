-- Undo of 20261122_21: calendar_days and year_viewings as 20261117_01 left them, and the reads of a span
-- dropped. Undo this before 20261122_20 drops the index the span's records seen again are found by.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: as 20261117_01 left it
CREATE OR REPLACE FUNCTION public.calendar_days(p_user_id uuid) RETURNS TABLE(day date, films integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- The grid's 364 days end on the member's today: the house's yesterday, today or tomorrow.
  -- Each viewing on its own day: a rewatch adds a night, it never moves the one before it.
  SELECT v.day, count(*)::integer
    FROM public.member_viewings(p_user_id) v
   WHERE v.day BETWEEN (now() AT TIME ZONE 'UTC')::date - 364 AND (now() AT TIME ZONE 'UTC')::date + 1
   GROUP BY v.day
   ORDER BY v.day DESC;
$$;

-- add-only (3): it only fixes: as 20261117_01 left it
CREATE OR REPLACE FUNCTION public.year_viewings(p_user_id uuid, p_year integer, p_before_day date DEFAULT NULL::date, p_before_viewing uuid DEFAULT NULL::uuid) RETURNS TABLE(log_id uuid, viewing_id uuid, film_id integer, film_title text, poster_path text, rating numeric, day date)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT v.log_id, v.viewing_id, v.film_id, l.film_title, l.poster_path, v.rating, v.day
    FROM public.member_viewings(p_user_id) v
    JOIN public.logs l ON l.id = v.log_id
   WHERE v.day >= make_date(p_year, 1, 1) AND v.day < make_date(p_year + 1, 1, 1)
     AND (p_before_day IS NULL OR (v.day, v.viewing_id) < (p_before_day, p_before_viewing))
   ORDER BY v.day DESC, v.viewing_id DESC
   LIMIT 1000;
$$;

-- add-only (1): no shipped client uses it: a function this car made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.viewings_between(uuid, date, date);
-- add-only (1): no shipped client uses it: a function this car made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.logs_seen_again_in(uuid, date, date);
