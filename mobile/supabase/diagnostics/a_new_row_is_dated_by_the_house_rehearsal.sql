-- ════════════════════════════════════════════════════════════════════════════
-- a_new_row_is_dated_by_the_house_rehearsal.sql — 20261122_25. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_new_row_is_dated_by_the_house_rehearsal.sql --with-train
--
-- The train applies 20261122_25 here (with_train), every car before it already applied; a sealed copy already holds it.
-- Then a member, acting as themselves, writes rows dated in the past and in the future: the house dates
-- each as it lands, keeps an imported record's past date but never a future one, and paces records
-- by a room no date gets past (stage C, the kinds pass). Every row here is undone with the
-- transaction. Read each NOTICE as case|expected|got ; the last line is the verdict, and any miss
-- makes psql exit non-zero.
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
   ORDER BY u.created_at LIMIT 1;
SELECT pg_temp.rh_need('a member in good standing', (SELECT count(*) FROM rehearsal_members), 1) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;
-- Three films the member has not logged: no record of theirs is touched, so no write here grows with
-- their archive, and the car's locks are held only as long as these few cases.
CREATE TEMP TABLE nrd_films ON COMMIT DROP AS
  SELECT f.id, row_number() OVER (ORDER BY f.id) AS k
    FROM public.films f
   WHERE NOT EXISTS (SELECT 1 FROM public.logs l WHERE l.user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND l.film_id = f.id)
   ORDER BY f.id LIMIT 3;
GRANT SELECT ON nrd_films TO authenticated;
SELECT pg_temp.rh_need('films the member has not logged', (SELECT count(*) FROM nrd_films), 3) AS done \gset rh_

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_25_a_new_row_is_dated_by_the_house.sql
\endif

-- ── the setting, as the house ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- The member's room for records starts full, then one record as the house, dated a year back (kept: the house's word).
DELETE FROM public.write_budget WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1);
INSERT INTO public.logs (id, user_id, film_id, film_title, watched_date, created_at)
VALUES ('00000000-0000-4000-8000-0000000d0001', (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM nrd_films WHERE k = 1), 'rh dated', '2025-01-01', now() - interval '1 year');

-- One write as the member; 'ok' or the refusal's code and detail.
CREATE FUNCTION pg_temp.nrd_as_member(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_detail text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_detail = PG_EXCEPTION_DETAIL;
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v_state || ' ' || coalesce(v_detail, '');
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'ok';
END $$;

-- How a row's date stands to the moment of the rehearsal: 'now' (within the transaction's own moment), 'past', 'future'.
CREATE FUNCTION pg_temp.nrd_when(p_at timestamptz) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_at IS NULL THEN 'none' WHEN p_at = now() THEN 'now' WHEN p_at < now() THEN 'past' ELSE 'future' END;
$$;

-- ── a critique: dated by the house ──
SELECT pg_temp.rh_case('a critique of the member''s own record, written dated 2020, lands', 'ok',
  pg_temp.nrd_as_member(format('INSERT INTO public.log_comments (id, log_id, user_id, username, body, created_at, updated_at) VALUES (%L, %L, %L, %L, %L, %L, %L)',
    '00000000-0000-4000-8000-0000000d0101', '00000000-0000-4000-8000-0000000d0001', (SELECT id FROM rehearsal_members WHERE n = 1), 'x', 'rh dated critique', '2020-01-01', '2020-01-01'))) AS done \gset rh_
SELECT pg_temp.rh_case('the critique written dated 2020 is dated as it landed, and so is its last change', 'now|now',
  (SELECT pg_temp.nrd_when(created_at) || '|' || pg_temp.nrd_when(updated_at) FROM public.log_comments WHERE id = '00000000-0000-4000-8000-0000000d0101')) AS done \gset rh_
SELECT pg_temp.rh_case('a critique written dated 2099 lands', 'ok',
  pg_temp.nrd_as_member(format('INSERT INTO public.log_comments (id, log_id, user_id, username, body, created_at) VALUES (%L, %L, %L, %L, %L, %L)',
    '00000000-0000-4000-8000-0000000d0102', '00000000-0000-4000-8000-0000000d0001', (SELECT id FROM rehearsal_members WHERE n = 1), 'x', 'rh dated critique', '2099-01-01'))) AS done \gset rh_
SELECT pg_temp.rh_case('the critique written dated 2099 is dated as it landed, never ahead of the house', 'now',
  (SELECT pg_temp.nrd_when(created_at) FROM public.log_comments WHERE id = '00000000-0000-4000-8000-0000000d0102')) AS done \gset rh_

-- ── a stack: never dated ahead, an imported one's past kept ──
SELECT pg_temp.rh_case('a stack written dated 2099 lands', 'ok',
  pg_temp.nrd_as_member(format('INSERT INTO public.lists (id, user_id, title, created_at) VALUES (%L, %L, %L, %L)',
    '00000000-0000-4000-8000-0000000d0201', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh dated stack', '2099-01-01'))) AS done \gset rh_
SELECT pg_temp.rh_case('a stack written dated 2099 is dated now', 'now',
  (SELECT pg_temp.nrd_when(created_at) FROM public.lists WHERE id = '00000000-0000-4000-8000-0000000d0201')) AS done \gset rh_
SELECT pg_temp.rh_case('an imported stack written dated 2019 lands', 'ok',
  pg_temp.nrd_as_member(format('INSERT INTO public.lists (id, user_id, title, created_at) VALUES (%L, %L, %L, %L)',
    '00000000-0000-4000-8000-0000000d0202', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh imported stack', '2019-06-01T12:00:00Z'))) AS done \gset rh_
SELECT pg_temp.rh_case('an imported stack keeps its date in the past', '2019-06-01',
  (SELECT (created_at AT TIME ZONE 'UTC')::date::text FROM public.lists WHERE id = '00000000-0000-4000-8000-0000000d0202')) AS done \gset rh_

-- ── records: an imported one keeps its past, none is dated ahead ──
SELECT pg_temp.rh_case('an imported record written dated 2019 lands', 'ok',
  pg_temp.nrd_as_member(format('INSERT INTO public.logs (id, user_id, film_id, film_title, watched_date, created_at) VALUES (%L, %L, %s, %L, %L, %L)',
    '00000000-0000-4000-8000-0000000d0002', (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM nrd_films WHERE k = 2), 'rh imported', '2019-06-01', '2019-06-01T12:00:00Z'))) AS done \gset rh_
SELECT pg_temp.rh_case('an imported record keeps its date in the past', '2019-06-01',
  (SELECT (created_at AT TIME ZONE 'UTC')::date::text FROM public.logs WHERE id = '00000000-0000-4000-8000-0000000d0002')) AS done \gset rh_
SELECT pg_temp.rh_case('a record written dated 2099 lands', 'ok',
  pg_temp.nrd_as_member(format('INSERT INTO public.logs (id, user_id, film_id, film_title, watched_date, created_at) VALUES (%L, %L, %s, %L, %L, %L)',
    '00000000-0000-4000-8000-0000000d0003', (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM nrd_films WHERE k = 3), 'rh ahead', '2026-01-01', '2099-01-01'))) AS done \gset rh_
SELECT pg_temp.rh_case('a record written dated 2099 is dated now', 'now',
  (SELECT pg_temp.nrd_when(created_at) FROM public.logs WHERE id = '00000000-0000-4000-8000-0000000d0003')) AS done \gset rh_
SELECT pg_temp.rh_case('the record the house wrote a year back keeps the house''s date', 'past',
  (SELECT pg_temp.nrd_when(created_at) FROM public.logs WHERE id = '00000000-0000-4000-8000-0000000d0001')) AS done \gset rh_

-- ── the records' pace: a room no date gets past ──
SELECT pg_temp.rh_case('the member''s two new records are counted in their room, the dated one too', '2',
  (SELECT coalesce((SELECT n::text FROM public.write_budget WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND kind = 'record'), 'none'))) AS done \gset rh_
UPDATE public.write_budget SET tokens = 0, refilled_at = now() WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND kind = 'record';
DELETE FROM public.logs WHERE id = '00000000-0000-4000-8000-0000000d0003';
SELECT pg_temp.rh_case('with no room left, a record dated in the past is refused, said as the house''s pace', 'RH429 member',
  pg_temp.nrd_as_member(format('INSERT INTO public.logs (id, user_id, film_id, film_title, watched_date, created_at) VALUES (%L, %L, %s, %L, %L, %L)',
    '00000000-0000-4000-8000-0000000d0004', (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM nrd_films WHERE k = 3), 'rh past', '2019-06-01', '2019-06-01T12:00:00Z'))) AS done \gset rh_
SELECT pg_temp.rh_case('a record sent again over one already there is no new write, and is not refused', 'ok',
  pg_temp.nrd_as_member(format('INSERT INTO public.logs (id, user_id, film_id, film_title, watched_date) VALUES (gen_random_uuid(), %L, %s, %L, %L) ON CONFLICT (user_id, film_id) DO NOTHING',
    (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM nrd_films WHERE k = 2), 'rh again', '2019-06-01'))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
