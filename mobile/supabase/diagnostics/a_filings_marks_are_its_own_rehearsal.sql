-- ════════════════════════════════════════════════════════════════════════════
-- a_filings_marks_are_its_own_rehearsal.sql — 20261126_10. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_filings_marks_are_its_own_rehearsal.sql --with-train
--
-- The train applies 20261126_10 here (with_train), every car before it already applied; a sealed copy already holds it.
-- Three members of its own, a seeking, a take and a ballot of its own: the asker takes their seeking's
-- critique and gives it back, and may not take another filing's; a vote is one of its ballot's options;
-- a member out of standing keeps no filing and still lets one go. Every row here is undone with the transaction.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

\if :{?with_train}
\ir ../../../supabase/migrations/20261126_10_a_filings_marks_are_its_own.sql
\endif

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- The rehearsal's own members: 1 asks and holds the ballot, 2 answers and votes, 3 files a take.
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT ('c25e0000-0000-4000-8000-00000000000' || g)::uuid, 'authenticated', 'authenticated', 'qzc25m' || g || '@rehearsal.test',
       jsonb_build_object('username', 'qzc25m' || g), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM generate_series(1, 3) g;
CREATE TEMP TABLE fm_member ON COMMIT DROP AS
  SELECT g AS n, ('c25e0000-0000-4000-8000-00000000000' || g)::uuid AS id FROM generate_series(1, 3) g;
GRANT SELECT ON fm_member TO anon, authenticated;
SELECT pg_temp.rh_need('of its own members made', (SELECT count(*) FROM public.profiles WHERE id IN (SELECT id FROM fm_member)), 3) AS done \gset rh_

INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, body) VALUES
  ('c25e0000-0000-4000-8000-0000000000a1', 'seeking', (SELECT id FROM fm_member WHERE n = 1), 'qzc25m1', 'Which film first?'),
  ('c25e0000-0000-4000-8000-0000000000a2', 'take', (SELECT id FROM fm_member WHERE n = 3), 'qzc25m3', 'A take of its own.');
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, body, options, closes_at) VALUES
  ('c25e0000-0000-4000-8000-0000000000b1', 'ballot', (SELECT id FROM fm_member WHERE n = 1), 'qzc25m1', 'Which of two?',
   '[{"id": 11, "title": "One"}, {"id": 12, "title": "Two"}]'::jsonb, now() + interval '1 day');
INSERT INTO public.dispatch_comments (id, post_id, user_id, body) VALUES
  ('c25e0000-0000-4000-8000-0000000000c1', 'c25e0000-0000-4000-8000-0000000000a1', (SELECT id FROM fm_member WHERE n = 2), 'This one.'),
  ('c25e0000-0000-4000-8000-0000000000c3', 'c25e0000-0000-4000-8000-0000000000a2', (SELECT id FROM fm_member WHERE n = 3), 'Beneath a take.');

-- One statement as member n, as themselves: 'ok', or the refusal's code.
CREATE FUNCTION pg_temp.fm_as(p_n integer, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM fm_member WHERE n = p_n), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'refused ' || v_state;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'ok';
END $$;

-- ── the answer ──
SELECT pg_temp.rh_case('the asker takes a critique of their own seeking as its answer', 'ok',
  pg_temp.fm_as(1, $q$UPDATE public.dispatch_posts SET answer_id = 'c25e0000-0000-4000-8000-0000000000c1' WHERE id = 'c25e0000-0000-4000-8000-0000000000a1'$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('and its critic is told', '1',
  (SELECT count(*)::text FROM public.notifications WHERE user_id = (SELECT id FROM fm_member WHERE n = 2) AND metadata ->> 'comment_id' = 'c25e0000-0000-4000-8000-0000000000c1')) AS done \gset rh_
SELECT pg_temp.rh_case('and gives it back', 'ok',
  pg_temp.fm_as(1, $q$UPDATE public.dispatch_posts SET answer_id = NULL WHERE id = 'c25e0000-0000-4000-8000-0000000000a1'$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('the asker may not take a critique of another member''s filing', 'refused 42501',
  pg_temp.fm_as(1, $q$UPDATE public.dispatch_posts SET answer_id = 'c25e0000-0000-4000-8000-0000000000c3' WHERE id = 'c25e0000-0000-4000-8000-0000000000a1'$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('so that critic is told nothing', '0',
  (SELECT count(*)::text FROM public.notifications WHERE user_id = (SELECT id FROM fm_member WHERE n = 3) AND metadata ->> 'comment_id' = 'c25e0000-0000-4000-8000-0000000000c3')) AS done \gset rh_
SELECT pg_temp.rh_case('a take takes no answer, its own critique neither', 'refused 42501',
  pg_temp.fm_as(3, $q$UPDATE public.dispatch_posts SET answer_id = 'c25e0000-0000-4000-8000-0000000000c3' WHERE id = 'c25e0000-0000-4000-8000-0000000000a2'$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('nor turned a seeking in the same breath', 'refused 42501',
  pg_temp.fm_as(3, $q$UPDATE public.dispatch_posts SET kind = 'seeking', answer_id = 'c25e0000-0000-4000-8000-0000000000c3' WHERE id = 'c25e0000-0000-4000-8000-0000000000a2'$q$)) AS done \gset rh_

-- ── the votes ──
SELECT pg_temp.rh_case('a vote for the ballot''s first film', 'ok',
  pg_temp.fm_as(2, $q$INSERT INTO public.dispatch_votes (post_id, user_id, option_index) VALUES ('c25e0000-0000-4000-8000-0000000000b1', auth.uid(), 0)$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('and for its second', 'ok',
  pg_temp.fm_as(3, $q$INSERT INTO public.dispatch_votes (post_id, user_id, option_index) VALUES ('c25e0000-0000-4000-8000-0000000000b1', auth.uid(), 1)$q$)) AS done \gset rh_
DELETE FROM public.dispatch_votes WHERE user_id = (SELECT id FROM fm_member WHERE n = 3);
SELECT pg_temp.rh_case('a vote past its two films is refused', 'refused 23514',
  pg_temp.fm_as(3, $q$INSERT INTO public.dispatch_votes (post_id, user_id, option_index) VALUES ('c25e0000-0000-4000-8000-0000000000b1', auth.uid(), 2)$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('the ballot counts the two cast alone', '1',
  (SELECT count(*)::text FROM public.dispatch_votes WHERE post_id = 'c25e0000-0000-4000-8000-0000000000b1')) AS done \gset rh_
CREATE FUNCTION pg_temp.fm_house(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text;
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  RETURN 'refused ' || v_state;
END $$;
SELECT pg_temp.rh_case('the house itself casts no vote past the films either', 'refused 23514',
  pg_temp.fm_house($q$INSERT INTO public.dispatch_votes (post_id, user_id, option_index) VALUES ('c25e0000-0000-4000-8000-0000000000b1', 'c25e0000-0000-4000-8000-000000000001', 5)$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('nor on a filing that is no ballot', 'refused 23514',
  pg_temp.fm_house($q$INSERT INTO public.dispatch_votes (post_id, user_id, option_index) VALUES ('c25e0000-0000-4000-8000-0000000000a1', 'c25e0000-0000-4000-8000-000000000001', 0)$q$)) AS done \gset rh_

-- ── a keep ──
SELECT pg_temp.rh_case('a member in good standing keeps a filing', 'ok',
  pg_temp.fm_as(2, $q$INSERT INTO public.dispatch_saves (user_id, post_id) VALUES (auth.uid(), 'c25e0000-0000-4000-8000-0000000000a2')$q$)) AS done \gset rh_
UPDATE public.profiles SET suspended_until = now() + interval '1 day' WHERE id = (SELECT id FROM fm_member WHERE n = 2);
SELECT pg_temp.rh_case('suspended, they keep no other', 'refused 42501',
  pg_temp.fm_as(2, $q$INSERT INTO public.dispatch_saves (user_id, post_id) VALUES (auth.uid(), 'c25e0000-0000-4000-8000-0000000000b1')$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('and still let go the one they kept', 'ok',
  pg_temp.fm_as(2, $q$DELETE FROM public.dispatch_saves WHERE user_id = auth.uid() AND post_id = 'c25e0000-0000-4000-8000-0000000000a2'$q$)) AS done \gset rh_
SELECT pg_temp.rh_case('so they keep none', '0',
  (SELECT count(*)::text FROM public.dispatch_saves WHERE user_id = (SELECT id FROM fm_member WHERE n = 2))) AS done \gset rh_
UPDATE public.profiles SET suspended_until = NULL, is_banned = true WHERE id = (SELECT id FROM fm_member WHERE n = 2);
SELECT pg_temp.rh_case('banned, they keep none', 'refused 42501',
  pg_temp.fm_as(2, $q$INSERT INTO public.dispatch_saves (user_id, post_id) VALUES (auth.uid(), 'c25e0000-0000-4000-8000-0000000000a2')$q$)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
