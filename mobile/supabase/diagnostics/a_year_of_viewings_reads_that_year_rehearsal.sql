-- ════════════════════════════════════════════════════════════════════════════
-- a_year_of_viewings_reads_that_year_rehearsal.sql — 20261122_21. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_year_of_viewings_reads_that_year_rehearsal.sql --with-train
--
-- The train applies 20261122_21 here (with_train), every car before it already applied (20261122_19's keys
-- and 20261122_20's index among them); a sealed copy already holds it. A member is given films seen once
-- on days inside and outside the calendar's reach, films seen again (an earlier viewing written as a day,
-- as a moment, as no day at all, as a day that is not one, two on one day, one in a year long past), a
-- withheld film seen again, and a year of 1,200 viewings. Then as the member, a stranger, a follower and a
-- visitor, the member private and then open, on three clocks (UTC, fourteen hours east, twelve west):
-- the calendar and the Year in Cinema (four years, and the next page of the full one) answer exactly as
-- 20261117_01's reading of them (member_viewings, kept here as it was) answers, row for row; a private
-- member's are a stranger's and a visitor's to see not at all; and the full year answers its first 1,000
-- and then its last 200. And each read keeps to its span: a record's last viewing read through an index of
-- the member's own (never the whole table), and the records seen again in the span alone (private.logs_seen_again_in);
-- and the logs analysed, 20261122_20's index among them.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

\if :{?with_train}
\ir ../../../supabase/migrations/20261122_21_a_year_of_viewings_reads_that_year.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup; the house's clock.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT set_config('TimeZone', 'UTC', true) AS done \gset rh_
CREATE TEMP TABLE yv_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
INSERT INTO yv_who
SELECT what, pg_temp.rh_found('a member to be ' || what, id)
  FROM (SELECT (ARRAY['the member', 'a stranger', 'a follower'])[row_number() OVER (ORDER BY created_at)] AS what, id
          FROM (SELECT id, created_at FROM public.profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 3) p) w;
SELECT pg_temp.rh_need('members to read the year', (SELECT count(*) FROM yv_who), 3) AS done \gset rh_
GRANT SELECT ON yv_who TO anon, authenticated;
CREATE FUNCTION pg_temp.yv_id(p_what text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM yv_who WHERE what = p_what $$;
GRANT EXECUTE ON FUNCTION pg_temp.yv_id(text) TO anon, authenticated;

-- Nothing between the three but the follower's follow, and the member's films only these.
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM yv_who) AND blocked_id IN (SELECT id FROM yv_who);
DELETE FROM public.interactions WHERE user_id IN (SELECT id FROM yv_who) AND target_user_id IN (SELECT id FROM yv_who);
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT pg_temp.yv_id('the member'));
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES ((SELECT pg_temp.yv_id('a follower')), (SELECT pg_temp.yv_id('the member')), 'follow');
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT pg_temp.yv_id('the member'));
DELETE FROM public.logs WHERE user_id = (SELECT pg_temp.yv_id('the member'));

CREATE TEMP TABLE yv_day ON COMMIT DROP AS SELECT (now() AT TIME ZONE 'UTC')::date AS today, extract(year FROM now() AT TIME ZONE 'UTC')::int AS y;
GRANT SELECT ON yv_day TO anon, authenticated;
-- Films seen once, a day each: past each end of the calendar's reach, and inside it.
INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
SELECT (SELECT pg_temp.yv_id('the member')), 920000 + n::integer, 'rh film', d.today - back
  FROM yv_day d, unnest(ARRAY[-2, -1, 0, 0, 10, 364, 365, 366, 400, 2000]) WITH ORDINALITY AS b(back, n);
-- Films seen again: each log's earlier viewings, as a member's phone or an old build wrote them.
INSERT INTO public.logs (user_id, film_id, film_title, watched_date, created_at, viewing_history, withheld_at)
SELECT (SELECT pg_temp.yv_id('the member')), 921000 + f.n, 'rh film seen again', d.today - 5, f.made, f.history, f.withheld
  FROM yv_day d
 CROSS JOIN LATERAL (VALUES
   (1, now(), jsonb_build_array(jsonb_build_object('date', (d.today - 30)::text), jsonb_build_object('date', (d.today - 400)::text, 'rating', 3)), NULL::timestamptz),
   (2, now(), jsonb_build_array(jsonb_build_object('date', (d.today - 200)::text || 'T22:00:00Z')), NULL),
   (3, date_trunc('month', now() - interval '100 days') - interval '30 minutes', '[{}]'::jsonb, NULL),
   (4, now() - interval '50 days', jsonb_build_array(jsonb_build_object('date', (d.y - 1)::text || '-02-30')), NULL),
   (5, now(), jsonb_build_array(jsonb_build_object('date', (d.today - 3)::text, 'rating', 4), jsonb_build_object('date', (d.today - 3)::text)), NULL),
   (6, now(), jsonb_build_array(jsonb_build_object('date', make_date(d.y - 3, 6, 1)::text)), NULL),
   (7, now(), jsonb_build_array(jsonb_build_object('date', (d.today - 20)::text)), now())
 ) f(n, made, history, withheld);
-- A year two years back of 1,200 viewings: 600 films, each seen on a day of it and again on another.
INSERT INTO public.logs (user_id, film_id, film_title, watched_date, viewing_history)
SELECT (SELECT pg_temp.yv_id('the member')), 930000 + g, 'rh film of a full year', make_date(d.y - 2, 1, 1) + (g % 360),
       jsonb_build_array(jsonb_build_object('date', (make_date(d.y - 2, 1, 1) + ((g * 7) % 365))::text))
  FROM yv_day d, generate_series(1, 600) g;

-- 20261117_01's reading of both, as it was: every viewing of the member's whole record, then the span.
CREATE FUNCTION pg_temp.yv_old_calendar(p_user_id uuid) RETURNS TABLE(day date, films integer) LANGUAGE sql STABLE AS $$
  SELECT v.day, count(*)::integer
    FROM public.member_viewings(p_user_id) v
   WHERE v.day BETWEEN (now() AT TIME ZONE 'UTC')::date - 364 AND (now() AT TIME ZONE 'UTC')::date + 1
   GROUP BY v.day
   ORDER BY v.day DESC
$$;
CREATE FUNCTION pg_temp.yv_old_year(p_user_id uuid, p_year integer, p_before_day date DEFAULT NULL, p_before_viewing uuid DEFAULT NULL)
RETURNS TABLE(log_id uuid, viewing_id uuid, film_id integer, film_title text, poster_path text, rating numeric, day date) LANGUAGE sql STABLE AS $$
  SELECT v.log_id, v.viewing_id, v.film_id, l.film_title, l.poster_path, v.rating, v.day
    FROM public.member_viewings(p_user_id) v
    JOIN public.logs l ON l.id = v.log_id
   WHERE v.day >= make_date(p_year, 1, 1) AND v.day < make_date(p_year + 1, 1, 1)
     AND (p_before_day IS NULL OR (v.day, v.viewing_id) < (p_before_day, p_before_viewing))
   ORDER BY v.day DESC, v.viewing_id DESC
   LIMIT 1000
$$;
GRANT EXECUTE ON FUNCTION pg_temp.yv_old_calendar(uuid), pg_temp.yv_old_year(uuid, integer, date, uuid) TO anon, authenticated;

-- One reader (NULL, a visitor) on one clock: each read, the car's and the old reading's, as text, and
-- how many rows each read gave. The full year's next page starts after the old reading's 1,000th.
CREATE TEMP TABLE yv_reads (reader text, clock text, what text, now_read text, old_read text, rows_now integer) ON COMMIT DROP;
GRANT ALL ON yv_reads TO anon, authenticated;
CREATE FUNCTION pg_temp.yv_read_as(p_reader text, p_clock text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_of uuid := pg_temp.yv_id('the member');
  v_who uuid := CASE WHEN p_reader LIKE 'a visitor%' THEN NULL ELSE pg_temp.yv_id(split_part(p_reader, ',', 1)) END;
  v_y integer := (SELECT y FROM yv_day);
  v_now text; v_old text; v_n integer; v_last record; k integer;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN v_who IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', v_who, 'role', 'authenticated')::text END, true);
  PERFORM set_config('role', CASE WHEN v_who IS NULL THEN 'anon' ELSE 'authenticated' END, true);
  PERFORM set_config('TimeZone', p_clock, true);
  SELECT coalesce(string_agg(c.day || '=' || c.films, ',' ORDER BY c.day DESC), ''), count(*) INTO v_now, v_n FROM public.calendar_days(v_of) c;
  SELECT coalesce(string_agg(c.day || '=' || c.films, ',' ORDER BY c.day DESC), '') INTO v_old FROM pg_temp.yv_old_calendar(v_of) c;
  INSERT INTO yv_reads VALUES (p_reader, p_clock, 'calendar', v_now, v_old, v_n);
  -- A visitor is given no Year in Cinema (year_viewings is a member's to ask).
  IF v_who IS NOT NULL THEN
    FOREACH k IN ARRAY ARRAY[0, 1, 2, 3] LOOP
      SELECT coalesce(string_agg(concat_ws('|', r.log_id, r.viewing_id, r.film_id, r.film_title, r.poster_path, r.rating, r.day), ',' ORDER BY r.ordinality), ''), count(*)
        INTO v_now, v_n FROM public.year_viewings(v_of, v_y - k) WITH ORDINALITY r;
      SELECT coalesce(string_agg(concat_ws('|', r.log_id, r.viewing_id, r.film_id, r.film_title, r.poster_path, r.rating, r.day), ',' ORDER BY r.ordinality), '')
        INTO v_old FROM pg_temp.yv_old_year(v_of, v_y - k) WITH ORDINALITY r;
      INSERT INTO yv_reads VALUES (p_reader, p_clock, 'year -' || k, v_now, v_old, v_n);
    END LOOP;
    SELECT o.day, o.viewing_id INTO v_last FROM pg_temp.yv_old_year(v_of, v_y - 2) o ORDER BY o.day, o.viewing_id LIMIT 1;
    IF FOUND THEN
      SELECT coalesce(string_agg(concat_ws('|', r.log_id, r.viewing_id, r.day), ',' ORDER BY r.ordinality), ''), count(*)
        INTO v_now, v_n FROM public.year_viewings(v_of, v_y - 2, v_last.day, v_last.viewing_id) WITH ORDINALITY r;
      SELECT coalesce(string_agg(concat_ws('|', r.log_id, r.viewing_id, r.day), ',' ORDER BY r.ordinality), '')
        INTO v_old FROM pg_temp.yv_old_year(v_of, v_y - 2, v_last.day, v_last.viewing_id) WITH ORDINALITY r;
      INSERT INTO yv_reads VALUES (p_reader, p_clock, 'year -2, next page', v_now, v_old, v_n);
    END IF;
  END IF;
  PERFORM set_config('TimeZone', 'UTC', true);
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

DO $$
DECLARE c text; r text;
BEGIN
  FOREACH c IN ARRAY ARRAY['UTC', 'Pacific/Kiritimati', 'Etc/GMT+12'] LOOP
    FOREACH r IN ARRAY ARRAY['the member', 'a stranger, private', 'a visitor, private', 'a follower, private'] LOOP
      PERFORM pg_temp.yv_read_as(r, c);
    END LOOP;
  END LOOP;
END $$;
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT pg_temp.yv_id('the member'));
DO $$
DECLARE c text; r text;
BEGIN
  FOREACH c IN ARRAY ARRAY['UTC', 'Pacific/Kiritimati', 'Etc/GMT+12'] LOOP
    FOREACH r IN ARRAY ARRAY['a stranger, open', 'a visitor, open'] LOOP
      PERFORM pg_temp.yv_read_as(r, c);
    END LOOP;
  END LOOP;
END $$;

SELECT pg_temp.rh_need('reads replayed', (SELECT count(*) FROM yv_reads), 60) AS done \gset rh_
SELECT pg_temp.rh_case('every calendar and every year answers as the old reading did, for every reader on every clock', 'none',
  coalesce((SELECT string_agg(reader || ' ' || clock || ' ' || what, '; ') FROM yv_reads WHERE now_read IS DISTINCT FROM old_read), 'none')) AS done \gset rh_
SELECT pg_temp.rh_case('the member''s own calendar counts the nights of the year, the earlier viewings and the withheld film among them', 'true',
  (SELECT bool_and(rows_now >= 8) FROM yv_reads WHERE reader = 'the member' AND what = 'calendar')::text) AS done \gset rh_
SELECT pg_temp.rh_case('a private member''s calendar is not a stranger''s nor a visitor''s; the follower''s, all but the withheld film', '0|0|true',
  (SELECT max(rows_now) FROM yv_reads WHERE reader = 'a stranger, private' AND what = 'calendar')::text || '|'
    || (SELECT max(rows_now) FROM yv_reads WHERE reader = 'a visitor, private' AND what = 'calendar')::text || '|'
    || (SELECT bool_and(f.now_read <> m.now_read AND f.rows_now > 0) FROM yv_reads f JOIN yv_reads m ON m.clock = f.clock AND m.what = f.what
         WHERE f.reader = 'a follower, private' AND m.reader = 'the member' AND f.what = 'calendar')::text) AS done \gset rh_
SELECT pg_temp.rh_case('the full year answers its first 1,000, then its last 200', '1000|200',
  (SELECT max(rows_now) FROM yv_reads WHERE reader = 'the member' AND what = 'year -2')::text || '|'
    || (SELECT max(rows_now) FROM yv_reads WHERE reader = 'the member' AND what = 'year -2, next page')::text) AS done \gset rh_
SELECT pg_temp.rh_case('a year long past holds its one earlier viewing', '1',
  (SELECT max(rows_now) FROM yv_reads WHERE reader = 'the member' AND what = 'year -3')::text) AS done \gset rh_

-- Each read keeps to its span: the records seen again in it alone, and a record's last viewing by its day.
-- The records the span asks of its months: each with an earlier viewing in the span, none of a year long
-- past, and of the full year's 600 only those with an earlier viewing on a 29th to a 31st (which may be
-- dated by the day its record was made, this month).
CREATE TEMP TABLE yv_asked ON COMMIT DROP AS
SELECT l.film_id, l.viewing_history FROM public.logs l
 WHERE l.id = ANY (private.logs_seen_again_in((SELECT pg_temp.yv_id('the member')), (SELECT today - 364 FROM yv_day), (SELECT today + 1 FROM yv_day)));
SELECT pg_temp.rh_case('the span asks the records seen again in it, and of a year long past only those its months cannot rule out', '921001,921002,921003,921004,921005,921007|true',
  (SELECT coalesce(string_agg(film_id::text, ',' ORDER BY film_id), 'none') FROM yv_asked WHERE film_id BETWEEN 921001 AND 921007) || '|'
    || ((SELECT count(*) FROM yv_asked WHERE film_id > 930000)
        = (SELECT count(*) FROM public.logs l WHERE l.user_id = (SELECT pg_temp.yv_id('the member')) AND l.film_id > 930000
             AND extract(day FROM (l.viewing_history->0->>'date')::date) >= 29))::text) AS done \gset rh_
SELECT pg_temp.rh_case('the logs are analysed with the index of the films seen again', 'true',
  (EXISTS (SELECT 1 FROM pg_stats WHERE schemaname = 'public' AND tablename = 'logs_seen_again_by_month'))::text) AS done \gset rh_
-- The planner told of the member's 600 films more, as the house's statistics would tell it.
ANALYZE public.logs;
SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;
CREATE FUNCTION pg_temp.yv_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.yv_id('a stranger'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOR r IN EXECUTE format('EXPLAIN SELECT l.id FROM public.logs l WHERE l.user_id = %L AND l.watched_date BETWEEN %L AND %L AND (l.withheld_at IS NULL OR l.user_id = (SELECT auth.uid()))',
                          pg_temp.yv_id('the member'), (SELECT today - 364 FROM yv_day), (SELECT today + 1 FROM yv_day)) LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.yv_plan() TO authenticated;
-- Production's statistics choose among equal per-member indexes; size-independence at 500k is proven by the Load's plan guards.
SELECT pg_temp.rh_case('a record''s last viewing in the span is read by the member''s own index, never the whole table', 'true',
  pg_temp.rh_reads_by((SELECT pg_temp.yv_plan()), 'logs', 'user_id')::text) AS done \gset rh_
SELECT pg_temp.rh_case('the calendar and the year read the span alone (private.viewings_between)', 'true|true',
  (position('private.viewings_between' in pg_get_functiondef('public.calendar_days(uuid)'::regprocedure)) > 0)::text || '|'
    || (position('private.viewings_between' in pg_get_functiondef('public.year_viewings(uuid, integer, date, uuid)'::regprocedure)) > 0)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
