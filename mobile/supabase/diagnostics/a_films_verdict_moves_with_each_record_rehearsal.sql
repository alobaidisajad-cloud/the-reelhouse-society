-- ════════════════════════════════════════════════════════════════════════════
-- a_films_verdict_moves_with_each_record_rehearsal.sql — 20261122_67. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_films_verdict_moves_with_each_record_rehearsal.sql --with-train
--
-- The train applies 20261122_67 here (with_train), every car before it already applied; a sealed copy
-- already holds it. Two members then write records of four films neither has logged: written, rated
-- again, moved to another film, withheld and given back, several in one statement, sent again over one
-- already there, taken away. After each, every film touched is read two ways: its verdict as the house
-- keeps it, and its records counted again as the house counted them before this car; the two are the
-- same. And a film's kept sums, set off by a thousand, stay off by a thousand after a record: the verdict
-- moves from what is kept, never from the film's records counted again. Every row here is undone with the
-- transaction. Read each NOTICE as case|expected|got ; the last line is the verdict, and any miss makes
-- psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE fv_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at, u.id) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at, u.id LIMIT 2;
SELECT pg_temp.rh_need('two members in good standing', (SELECT count(*) FROM fv_members), 2) AS done \gset rh_
-- Four films neither member has logged, the house's least logged: every case here reads its films'
-- records counted again, which costs what the film holds, so the cases (and the car's locks they are
-- held under) never grow with the house.
CREATE TEMP TABLE fv_films ON COMMIT DROP AS
  SELECT f.id, row_number() OVER (ORDER BY f.log_count, f.id) AS k
    FROM public.films f
   WHERE NOT EXISTS (SELECT 1 FROM public.logs l WHERE l.user_id IN (SELECT id FROM fv_members) AND l.film_id = f.id)
   ORDER BY f.log_count, f.id LIMIT 4;
SELECT pg_temp.rh_need('films neither member has logged', (SELECT count(*) FROM fv_films), 4) AS done \gset rh_

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_67_a_films_verdict_moves_with_each_record.sql
\endif

-- ── the setting, as the house ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- The two members and four films, picked once.
SELECT (SELECT id FROM fv_members WHERE n = 1) AS m1, (SELECT id FROM fv_members WHERE n = 2) AS m2,
       (SELECT id FROM fv_films WHERE k = 1) AS f1, (SELECT id FROM fv_films WHERE k = 2) AS f2,
       (SELECT id FROM fv_films WHERE k = 3) AS f3, (SELECT id FROM fv_films WHERE k = 4) AS f4 \gset fv_

-- A film's verdict as the house keeps it, and as its records counted again give it (refresh_film_verdict
-- as production held it): the mean of the ratings given, how many rated it, how many logged it.
CREATE FUNCTION pg_temp.fv_kept(p_film integer) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(f.avg_rating::text, 'none') || '|' || f.rating_count || '|' || f.log_count FROM public.films f WHERE f.id = p_film
$$;
CREATE FUNCTION pg_temp.fv_counted(p_film integer) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(ROUND(AVG(l.rating) FILTER (WHERE l.rating > 0), 2)::text, 'none') || '|' || count(*) FILTER (WHERE l.rating > 0) || '|' || count(*)
    FROM public.logs l WHERE l.film_id = p_film AND l.withheld_at IS NULL
$$;
-- 'same' for each film named when the two agree; otherwise both, for the film that differs.
CREATE FUNCTION pg_temp.fv_same(VARIADIC p_films integer[]) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(CASE WHEN pg_temp.fv_kept(f) IS NOT DISTINCT FROM pg_temp.fv_counted(f) THEN 'same'
                         ELSE 'kept ' || coalesce(pg_temp.fv_kept(f), 'none') || ' counted ' || pg_temp.fv_counted(f) END, ',' ORDER BY o)
    FROM unnest(p_films) WITH ORDINALITY AS u(f, o)
$$;

-- One write as a member; 'ok' or the refusal's code and words.
CREATE FUNCTION pg_temp.fv_as_member(p_n integer, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM fv_members WHERE n = p_n), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v_state || ' ' || v_message;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'ok';
END $$;

-- ── a record written, and written again ──
SELECT pg_temp.rh_case('a member''s record of a film, rated 4, lands', 'ok',
  pg_temp.fv_as_member(1, format('INSERT INTO public.logs (user_id, film_id, film_title, rating, watched_date) VALUES (%L, %s, %L, 4, %L)',
    :'fv_m1', :fv_f1, 'rh verdict', '2026-01-01'))) AS done \gset rh_
SELECT pg_temp.rh_case('the film''s verdict is its records counted again', 'same', pg_temp.fv_same(:fv_f1)) AS done \gset rh_
SELECT pg_temp.rh_case('the film''s sums are kept from its first record', 'kept',
  (SELECT CASE WHEN count(*) = 1 THEN 'kept' ELSE 'none' END FROM private.film_tallies WHERE film_id = :fv_f1)) AS done \gset rh_
SELECT pg_temp.rh_case('another member''s record of it, rated 2.5, lands', 'ok',
  pg_temp.fv_as_member(2, format('INSERT INTO public.logs (user_id, film_id, film_title, rating, watched_date) VALUES (%L, %s, %L, 2.5, %L)',
    :'fv_m2', :fv_f1, 'rh verdict', '2026-01-02'))) AS done \gset rh_
SELECT pg_temp.rh_case('the verdict moved with it is its records counted again', 'same', pg_temp.fv_same(:fv_f1)) AS done \gset rh_
SELECT pg_temp.rh_case('a record sent again over one already there lands as no new record', 'ok',
  pg_temp.fv_as_member(2, format('INSERT INTO public.logs (user_id, film_id, film_title, rating, watched_date) VALUES (%L, %s, %L, 5, %L) ON CONFLICT (user_id, film_id) DO NOTHING',
    :'fv_m2', :fv_f1, 'rh again', '2026-01-03'))) AS done \gset rh_
SELECT pg_temp.rh_case('and moves nothing', 'same', pg_temp.fv_same(:fv_f1)) AS done \gset rh_

-- ── a record changed ──
SELECT pg_temp.rh_case('a member rates their record again, 5', 'ok',
  pg_temp.fv_as_member(2, format('UPDATE public.logs SET rating = 5 WHERE user_id = %L AND film_id = %s', :'fv_m2', :fv_f1))) AS done \gset rh_
SELECT pg_temp.rh_case('the verdict moved by the new rating is its records counted again', 'same', pg_temp.fv_same(:fv_f1)) AS done \gset rh_
SELECT pg_temp.rh_case('a member takes their rating away', 'ok',
  pg_temp.fv_as_member(2, format('UPDATE public.logs SET rating = 0 WHERE user_id = %L AND film_id = %s', :'fv_m2', :fv_f1))) AS done \gset rh_
SELECT pg_temp.rh_case('the film counts the record, not its rating', 'same', pg_temp.fv_same(:fv_f1)) AS done \gset rh_
SELECT pg_temp.rh_case('a change of words moves no verdict', 'ok',
  pg_temp.fv_as_member(2, format('UPDATE public.logs SET review = %L WHERE user_id = %L AND film_id = %s', 'rh words', :'fv_m2', :fv_f1))) AS done \gset rh_
SELECT pg_temp.rh_case('the verdict after words is still its records counted again', 'same', pg_temp.fv_same(:fv_f1)) AS done \gset rh_
UPDATE public.logs SET film_id = :fv_f2 WHERE user_id = :'fv_m1' AND film_id = :fv_f1;
SELECT pg_temp.rh_case('a record moved to another film moves both films'' verdicts', 'same,same', pg_temp.fv_same(:fv_f1, :fv_f2)) AS done \gset rh_

-- ── a record withheld, and given back, as the house's withholding does it ──
UPDATE public.logs SET withheld_at = now() WHERE user_id = :'fv_m1' AND film_id = :fv_f2;
SELECT pg_temp.rh_case('a withheld record is in no film''s verdict', 'same', pg_temp.fv_same(:fv_f2)) AS done \gset rh_
SELECT public.refresh_film_verdict(:fv_f2) AS done \gset rh_
SELECT pg_temp.rh_case('the kept verdict written again for the withholding is the same', 'same', pg_temp.fv_same(:fv_f2)) AS done \gset rh_
UPDATE public.logs SET withheld_at = NULL WHERE user_id = :'fv_m1' AND film_id = :fv_f2;
SELECT public.refresh_film_verdict(:fv_f2) AS done \gset rh_
SELECT pg_temp.rh_case('a record given back is in its film''s verdict again', 'same', pg_temp.fv_same(:fv_f2)) AS done \gset rh_

-- ── several records in one statement ──
INSERT INTO public.logs (user_id, film_id, film_title, rating, watched_date)
VALUES (:'fv_m1', :fv_f3, 'rh verdict', 3, '2026-01-04'),
       (:'fv_m2', :fv_f3, 'rh verdict', 4.5, '2026-01-04'),
       (:'fv_m2', :fv_f4, 'rh verdict', 1, '2026-01-04');
SELECT pg_temp.rh_case('two records of a film in one statement are counted once each, from its first move', 'same,same',
  pg_temp.fv_same(:fv_f3, :fv_f4)) AS done \gset rh_
UPDATE public.logs SET rating = rating + 0.5 WHERE user_id IN (SELECT id FROM fv_members) AND film_id IN (:fv_f3, :fv_f4);
SELECT pg_temp.rh_case('three records rated again in one statement move their two films once each', 'same,same',
  pg_temp.fv_same(:fv_f3, :fv_f4)) AS done \gset rh_
DELETE FROM public.logs WHERE user_id IN (SELECT id FROM fv_members) AND film_id IN (:fv_f3, :fv_f4);
SELECT pg_temp.rh_case('three records taken away in one statement', 'same,same', pg_temp.fv_same(:fv_f3, :fv_f4)) AS done \gset rh_

-- ── a record taken away by its member ──
SELECT pg_temp.rh_case('a member takes their record away', 'ok',
  pg_temp.fv_as_member(2, format('DELETE FROM public.logs WHERE user_id = %L AND film_id = %s', :'fv_m2', :fv_f1))) AS done \gset rh_
SELECT pg_temp.rh_case('the film''s verdict without it is its records counted again', 'same', pg_temp.fv_same(:fv_f1)) AS done \gset rh_

-- ── the verdict moves from what is kept ──
-- The film's kept sums set off by a thousand records: a record's move keeps them off by a thousand, so
-- no record of the film was read to move it; then set right and written again.
UPDATE private.film_tallies SET logs = logs + 1000 WHERE film_id = :fv_f2;
SELECT pg_temp.rh_case('a member''s record of a film whose sums are kept lands', 'ok',
  pg_temp.fv_as_member(2, format('INSERT INTO public.logs (user_id, film_id, film_title, rating, watched_date) VALUES (%L, %s, %L, 3, %L)',
    :'fv_m2', :fv_f2, 'rh kept', '2026-01-05'))) AS done \gset rh_
SELECT pg_temp.rh_case('its verdict moved from the kept sums, never from the film''s records counted again', '1000',
  ((SELECT log_count FROM public.films WHERE id = :fv_f2)
   - (SELECT count(*) FROM public.logs WHERE film_id = :fv_f2 AND withheld_at IS NULL))::text) AS done \gset rh_
UPDATE private.film_tallies SET logs = logs - 1000 WHERE film_id = :fv_f2;
SELECT public.refresh_film_verdict(:fv_f2) AS done \gset rh_
SELECT pg_temp.rh_case('set right, the kept verdict is its records counted again', 'same', pg_temp.fv_same(:fv_f2)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
