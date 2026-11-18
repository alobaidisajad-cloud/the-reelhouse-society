-- ════════════════════════════════════════════════════════════════════════════
-- the_board_and_its_count_are_one_read_rehearsal.sql — 20261119_20. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_board_and_its_count_are_one_read_rehearsal.sql --with-train
--
-- The train applies 20261119_20 here (with_train), 20261119_00 to 20261119_19 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 13).
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
GRANT SELECT ON rehearsal_members TO authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE ha6_got (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON ha6_got TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_20_the_board_and_its_count_are_one_read.sql
\endif

-- ── H-A6 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A6 rehearsal · the board and its unread count in one read (review round 13) ──────────────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). Member 1 holds four notices of
-- the run, two of them unread, and one from member 3, whom member 1 then mutes; member 2 holds one.
-- As member 1: notices_page answers member 1's own newest notices, in the board's order, and the
-- unread count, each exactly as the two reads it replaces answer them as member 1 (the page's ids,
-- its columns, the count); never member 2's notice; a page asked of 2 holds the newest 2; a page is
-- never more than 100. A visitor may not ask it.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
INSERT INTO public.notifications (user_id, type, message, is_read, created_at)
SELECT (SELECT id FROM rehearsal_members WHERE n = 1), 'system', 'rh H-A6 notice ' || g, g <= 2,
       now() + (g || ' seconds')::interval
  FROM generate_series(1, 4) g;
INSERT INTO public.notifications (user_id, type, message, from_user_id, is_read, created_at)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'system', 'rh H-A6 from member 3', (SELECT id FROM rehearsal_members WHERE n = 3), false, now() + interval '5 seconds'),
       ((SELECT id FROM rehearsal_members WHERE n = 2), 'system', 'rh H-A6 notice for member 2', NULL, false, now() + interval '6 seconds');
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3), 'mute');

-- What member 1 is answered, by the one read and by the two it replaces.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ha6_got SELECT 'page', public.notices_page(30)::text;
INSERT INTO ha6_got SELECT 'two', public.notices_page(2)::text;
INSERT INTO ha6_got SELECT 'many', public.notices_page(100000)::text;
INSERT INTO ha6_got SELECT 'old ids', coalesce(string_agg(id::text, ',' ORDER BY created_at DESC, id DESC), '')
  FROM (SELECT id, created_at FROM public.notifications WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
         ORDER BY created_at DESC, id DESC LIMIT 30) o;
INSERT INTO ha6_got SELECT 'old unread', count(*)::text
  FROM public.notifications WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND is_read = false;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE FUNCTION pg_temp.ha6(p_k text) RETURNS jsonb LANGUAGE sql AS $$ SELECT v::jsonb FROM ha6_got WHERE k = p_k $$;
CREATE FUNCTION pg_temp.ha6_ids(p_k text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(e ->> 'id', ',' ORDER BY i), '') FROM jsonb_array_elements(pg_temp.ha6(p_k) -> 'rows') WITH ORDINALITY AS a(e, i)
$$;

SELECT pg_temp.rh_case('the page is the board the old read answered, in its order', (SELECT v FROM ha6_got WHERE k = 'old ids'),
  pg_temp.ha6_ids('page')) AS done \gset rh_
SELECT pg_temp.rh_case('and the count the old count answered', (SELECT v FROM ha6_got WHERE k = 'old unread'),
  pg_temp.ha6('page') ->> 'unread') AS done \gset rh_
SELECT pg_temp.rh_case('the run''s four notices are on it, the newest first', 'rh H-A6 notice 4,rh H-A6 notice 3,rh H-A6 notice 2,rh H-A6 notice 1',
  (SELECT string_agg(e ->> 'message', ',' ORDER BY i) FROM jsonb_array_elements(pg_temp.ha6('page') -> 'rows') WITH ORDINALITY AS a(e, i)
    WHERE e ->> 'message' LIKE 'rh H-A6 notice _')) AS done \gset rh_
SELECT pg_temp.rh_case('never another member''s notice', '0',
  (SELECT count(*)::text FROM jsonb_array_elements(pg_temp.ha6('page') -> 'rows') e
    WHERE e ->> 'user_id' <> (SELECT id::text FROM rehearsal_members WHERE n = 1))) AS done \gset rh_
SELECT pg_temp.rh_case('each row carries the board''s columns', 'created_at,film_id,from_user_id,from_username,group_key,id,is_read,message,metadata,poster_path,related_lounge_id,title,type,user_id',
  (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(pg_temp.ha6('page') -> 'rows' -> 0) k)) AS done \gset rh_
SELECT pg_temp.rh_case('a page of two is the newest two', 'true',
  (pg_temp.ha6_ids('page') LIKE pg_temp.ha6_ids('two') || ',%' OR pg_temp.ha6_ids('page') = pg_temp.ha6_ids('two'))::text) AS done \gset rh_
SELECT pg_temp.rh_case('with the whole unread count', pg_temp.ha6('page') ->> 'unread', pg_temp.ha6('two') ->> 'unread') AS done \gset rh_
SELECT pg_temp.rh_case('a page is never more than 100', 'true',
  (jsonb_array_length(pg_temp.ha6('many') -> 'rows') <= 100)::text) AS done \gset rh_

CREATE FUNCTION pg_temp.ha6_visitor() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_code text := 'ok';
BEGIN
  PERFORM set_config('role', 'anon', true);
  BEGIN
    PERFORM public.notices_page(30);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  RETURN v_code;
END $$;
SELECT pg_temp.rh_case('a visitor may not ask it', '42501', pg_temp.ha6_visitor()) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
