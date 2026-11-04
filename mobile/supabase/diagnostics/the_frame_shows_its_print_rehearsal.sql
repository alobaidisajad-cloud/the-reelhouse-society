-- ════════════════════════════════════════════════════════════════════════════
-- the_frame_shows_its_print_rehearsal.sql — 20261104_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_frame_shows_its_print_rehearsal.sql --with-train
--
-- With with_train set, 20261104_01 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up).
-- Both feeds give each log the poster its member chose and the format they saw
-- it on: the house feed to a member and to a visitor, the following feed to a
-- follower; a log with neither gives neither. And what each reader is given is
-- unchanged: a private member's log is not in a stranger's house feed, and is
-- in their follower's following feed.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261104_01_the_frame_shows_its_print.sql
\endif

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
INSERT INTO rh_who
SELECT what, pg_temp.rh_found('a member to be ' || what, id)
  FROM (SELECT (ARRAY['the member', 'a stranger', 'a follower'])[row_number() OVER (ORDER BY created_at)] AS what, id
          FROM (SELECT id, created_at FROM public.profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 3) p) w;
SELECT pg_temp.rh_need('members to read the feeds', (SELECT count(*) FROM rh_who), 3);
CREATE FUNCTION pg_temp.rh_id(p_what text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_who WHERE what = p_what $$;

-- Nothing between the three but the follower's follow; the member open, for now.
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rh_who) AND blocked_id IN (SELECT id FROM rh_who);
DELETE FROM public.interactions WHERE user_id IN (SELECT id FROM rh_who) AND target_user_id IN (SELECT id FROM rh_who);
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES (pg_temp.rh_id('a follower'), pg_temp.rh_id('the member'), 'follow');
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT pg_temp.rh_id('the member'));

-- Two reviewed logs, the newest in the house: one with its print, one plain.
CREATE TEMP TABLE rh_log (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
WITH made AS (
  INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review, alt_poster, physical_media)
  VALUES (pg_temp.rh_id('the member'), 990001, 'rh film', (now() AT TIME ZONE 'UTC')::date, 'rh words, with a print', '/rh-chosen.jpg', '35MM PRINT'),
         (pg_temp.rh_id('the member'), 990002, 'rh film', (now() AT TIME ZONE 'UTC')::date, 'rh words, plain', NULL, NULL)
  RETURNING id, film_id)
INSERT INTO rh_log SELECT CASE film_id WHEN 990001 THEN 'printed' ELSE 'plain' END, id FROM made;
SELECT pg_temp.rh_need('logs to read', (SELECT count(*) FROM rh_log), 2);

-- One log as one reader (NULL, a visitor) finds it in one feed: its poster|format, or 'absent'.
CREATE FUNCTION pg_temp.rh_print_as(p_who uuid, p_feed text, p_log text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; v_log uuid := (SELECT id FROM rh_log WHERE what = p_log);
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_who IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_who, 'role', 'authenticated')::text END, true);
  PERFORM set_config('role', CASE WHEN p_who IS NULL THEN 'anon' ELSE 'authenticated' END, true);
  IF p_feed = 'house' THEN
    SELECT coalesce(f.alt_poster, 'null') || '|' || coalesce(f.physical_media, 'null') INTO v
      FROM public.get_community_feed_auth_cursor(200, NULL, NULL) f WHERE f.id = v_log;
  ELSE
    SELECT coalesce(f.alt_poster, 'null') || '|' || coalesce(f.physical_media, 'null') INTO v
      FROM public.get_following_feed_auth_cursor(200, NULL, NULL) f WHERE f.id = v_log;
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(v, 'absent');
END $$;

CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, got text) ON COMMIT DROP;
INSERT INTO rh_rows VALUES ('house, the member', pg_temp.rh_print_as(pg_temp.rh_id('the member'), 'house', 'printed'));
INSERT INTO rh_rows VALUES ('house, a visitor', pg_temp.rh_print_as(NULL, 'house', 'printed'));
INSERT INTO rh_rows VALUES ('house, plain', pg_temp.rh_print_as(pg_temp.rh_id('a stranger'), 'house', 'plain'));
INSERT INTO rh_rows VALUES ('following, a follower', pg_temp.rh_print_as(pg_temp.rh_id('a follower'), 'following', 'printed'));
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT pg_temp.rh_id('the member'));
INSERT INTO rh_rows VALUES ('house, a stranger, private', pg_temp.rh_print_as(pg_temp.rh_id('a stranger'), 'house', 'printed'));
INSERT INTO rh_rows VALUES ('following, a follower, private', pg_temp.rh_print_as(pg_temp.rh_id('a follower'), 'following', 'printed'));

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('the house feed gives a member the poster chosen and the format', '/rh-chosen.jpg|35MM PRINT',
    (SELECT got FROM rh_rows WHERE what = 'house, the member'));
  PERFORM pg_temp.rh_case('and a visitor', '/rh-chosen.jpg|35MM PRINT',
    (SELECT got FROM rh_rows WHERE what = 'house, a visitor'));
  PERFORM pg_temp.rh_case('a log with neither gives neither', 'null|null',
    (SELECT got FROM rh_rows WHERE what = 'house, plain'));
  PERFORM pg_temp.rh_case('the following feed gives them to a follower', '/rh-chosen.jpg|35MM PRINT',
    (SELECT got FROM rh_rows WHERE what = 'following, a follower'));
  PERFORM pg_temp.rh_case('a private member''s log is still not in a stranger''s house feed', 'absent',
    (SELECT got FROM rh_rows WHERE what = 'house, a stranger, private'));
  PERFORM pg_temp.rh_case('and still in their follower''s following feed, whole', '/rh-chosen.jpg|35MM PRINT',
    (SELECT got FROM rh_rows WHERE what = 'following, a follower, private'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
