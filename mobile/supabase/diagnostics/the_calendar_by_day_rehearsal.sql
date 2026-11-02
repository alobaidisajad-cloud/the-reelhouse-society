-- ════════════════════════════════════════════════════════════════════════════
-- the_calendar_by_day_rehearsal.sql — 20261102_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_calendar_by_day_rehearsal.sql --with-train
--
-- With with_train set, 20261102_01 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). A member's films, by day: their own
-- calendar counts each day the grid can draw and none outside it; a private
-- member's days are a stranger's and a visitor's to see only as their films
-- are, so not at all, and a follower's in full; open, a stranger's too; and a
-- member with 1,500 films in the year is counted whole, in one row a day.
-- A day is read as the house's days before today (-1 is tomorrow).
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261102_01_the_calendar_by_day.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
INSERT INTO rh_who
SELECT what, pg_temp.rh_found('a member to be ' || what, id)
  FROM (SELECT (ARRAY['the member', 'a stranger', 'a follower'])[row_number() OVER (ORDER BY created_at)] AS what, id
          FROM (SELECT id, created_at FROM public.profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 3) p) w;
SELECT pg_temp.rh_need('members to read the calendar', (SELECT count(*) FROM rh_who), 3);
CREATE FUNCTION pg_temp.rh_id(p_what text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_who WHERE what = p_what $$;

-- Nothing between the three but the follower's follow, and the member's films only these.
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rh_who) AND blocked_id IN (SELECT id FROM rh_who);
DELETE FROM public.interactions WHERE user_id IN (SELECT id FROM rh_who) AND target_user_id IN (SELECT id FROM rh_who);
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT pg_temp.rh_id('the member'));
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES (pg_temp.rh_id('a follower'), pg_temp.rh_id('the member'), 'follow');
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT pg_temp.rh_id('the member'));
DELETE FROM public.logs WHERE user_id = (SELECT pg_temp.rh_id('the member'));
-- Two days past each end of the grid's reach, the rest inside it.
INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
SELECT pg_temp.rh_id('the member'), 603, 'rh film', (now() AT TIME ZONE 'UTC')::date - back
  FROM unnest(ARRAY[-2, -1, 0, 0, 10, 364, 365]) AS back;

-- The calendar as one reader sees it (NULL, a visitor): each day's distance back and its films.
-- Whose it is, read as the house before the reader's role is taken.
CREATE FUNCTION pg_temp.rh_calendar_as(p_who uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; v_of uuid := pg_temp.rh_id('the member');
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_who IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_who, 'role', 'authenticated')::text END, true);
  PERFORM set_config('role', CASE WHEN p_who IS NULL THEN 'anon' ELSE 'authenticated' END, true);
  SELECT coalesce(string_agg(((now() AT TIME ZONE 'UTC')::date - c.day)::text || ':' || c.films, ',' ORDER BY c.day DESC), 'none')
    INTO v FROM public.calendar_days(v_of) c;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, got text) ON COMMIT DROP;
INSERT INTO rh_rows VALUES ('own', pg_temp.rh_calendar_as(pg_temp.rh_id('the member')));
INSERT INTO rh_rows VALUES ('stranger, private', pg_temp.rh_calendar_as(pg_temp.rh_id('a stranger')));
INSERT INTO rh_rows VALUES ('visitor, private', pg_temp.rh_calendar_as(NULL));
INSERT INTO rh_rows VALUES ('follower, private', pg_temp.rh_calendar_as(pg_temp.rh_id('a follower')));
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT pg_temp.rh_id('the member'));
INSERT INTO rh_rows VALUES ('stranger, open', pg_temp.rh_calendar_as(pg_temp.rh_id('a stranger')));

-- A year of 1,500 films more, five a day for 300 days: past the 1,000 rows the house answers.
INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
SELECT pg_temp.rh_id('the member'), 603, 'rh film', (now() AT TIME ZONE 'UTC')::date - (g % 300)
  FROM generate_series(1, 1500) AS g;
DO $$
DECLARE v text; v_member uuid := pg_temp.rh_id('the member');
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*)::text || '|' || sum(c.films)::text INTO v FROM public.calendar_days(v_member) c;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO rh_rows VALUES ('a year of films', v);
END $$;

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('a member''s own calendar: each day the grid can draw, none past it', '-1:1,0:2,10:1,364:1',
    (SELECT got FROM rh_rows WHERE what = 'own'));
  PERFORM pg_temp.rh_case('a private member''s days are not a stranger''s', 'none',
    (SELECT got FROM rh_rows WHERE what = 'stranger, private'));
  PERFORM pg_temp.rh_case('nor a visitor''s', 'none',
    (SELECT got FROM rh_rows WHERE what = 'visitor, private'));
  PERFORM pg_temp.rh_case('a follower sees them all', '-1:1,0:2,10:1,364:1',
    (SELECT got FROM rh_rows WHERE what = 'follower, private'));
  PERFORM pg_temp.rh_case('an open member''s days are everyone''s', '-1:1,0:2,10:1,364:1',
    (SELECT got FROM rh_rows WHERE what = 'stranger, open'));
  PERFORM pg_temp.rh_case('1,505 films in the year, every one counted, in 302 rows', '302|1505',
    (SELECT got FROM rh_rows WHERE what = 'a year of films'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
