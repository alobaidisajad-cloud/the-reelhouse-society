-- ════════════════════════════════════════════════════════════════════════════
-- what_goes_takes_its_word_with_it_rehearsal.sql — 20261117_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs what_goes_takes_its_word_with_it_rehearsal.sql --with-train
--
-- The train applies 20261117_02 here (with_train), 20261117_01 already applied; a sealed copy
-- already holds both. Then members in good standing, acting as themselves, find each trigger
-- holding: a critique on a deleted record or stack refused as gone, the owner's rule as before; a
-- certification taken back taking its notice; a deleted stack's card in a salon marked gone.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last
-- line is the verdict, and any miss makes psql exit non-zero.
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

-- The pieces' own tables, made before the train, empty: each piece fills its own as it runs.
CREATE TEMP TABLE rh_a4_members ON COMMIT DROP AS
  SELECT id, n FROM rehearsal_members WHERE n <= 2;
GRANT SELECT ON rh_a4_members TO authenticated;
CREATE TEMP TABLE rh_a4_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_a4_rows TO authenticated;
CREATE TEMP TABLE rh_a4_got (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON rh_a4_got TO authenticated;
CREATE TEMP TABLE b6_own (what text, id uuid) ON COMMIT DROP;
GRANT SELECT ON b6_own TO authenticated;
CREATE TEMP TABLE b6_count (what text, n bigint) ON COMMIT DROP;
CREATE TEMP TABLE rh_f4s_rows (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_f4s_rows TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a
-- sealed copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261117_02_what_goes_takes_its_word_with_it.sql
\endif

-- ── A4 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: a critique on a page gone is told as such (review round 11) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest). Two members in good standing: 1 keeps a record and a stack, 2 critiques
-- them. As themselves, they find:
--   2's critique on 1's record and on 1's stack is filed, as before;
--   once 1 has deleted both, 2's next critique on each is refused as the page gone: P0002 LOG_GONE
--   and P0002 STACK_GONE, never 42501 (the owner's rule);
--   1 critiquing their own stack after deleting it is told STACK_GONE too, never that they limit
--   themselves;
--   a record whose owner lets nobody annotate it still refuses 2 with 42501, the owner's rule, as
--   before.

-- The round's first 2 members in good standing (rehearsal_members, read once before the train).
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rh_a4_members), 2) AS done \gset rh_

-- As the house: nothing stands between the two, and 1's file is open to 2's critiques.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rh_a4_members) AND blocked_id IN (SELECT id FROM rh_a4_members);
UPDATE public.profiles
   SET is_social_private = false,
       preferences = coalesce(preferences, '{}'::jsonb) || '{"privacy_annotations": "everyone"}'::jsonb
 WHERE id = (SELECT id FROM rh_a4_members WHERE n = 1);

-- 1's pieces: a record and a stack to be deleted, and a record kept to show the owner's rule.
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT id FROM rh_a4_members WHERE n = 1), 990001401, 'rh a record to be deleted', current_date) RETURNING id)
INSERT INTO rh_a4_rows SELECT 'log', id FROM r;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT id FROM rh_a4_members WHERE n = 1), 990001402, 'rh a record kept', current_date) RETURNING id)
INSERT INTO rh_a4_rows SELECT 'kept log', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title, is_private)
           VALUES ((SELECT id FROM rh_a4_members WHERE n = 1), 'rh a stack to be deleted', false) RETURNING id)
INSERT INTO rh_a4_rows SELECT 'stack', id FROM r;

-- A critique, named by what came back: 'ok', or the house's refusal as SQLSTATE: message.
CREATE FUNCTION pg_temp.rh_a4_critique(p_on text, p_by integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_by uuid := (SELECT id FROM rh_a4_members WHERE n = p_by);
BEGIN
  IF p_on LIKE '%stack' THEN
    INSERT INTO public.list_comments (list_id, user_id, content)
    VALUES ((SELECT id FROM rh_a4_rows WHERE what = p_on), v_by, 'rh a critique');
  ELSE
    INSERT INTO public.log_comments (log_id, user_id, username, body)
    VALUES ((SELECT id FROM rh_a4_rows WHERE what = p_on), v_by,
            (SELECT username FROM public.profiles WHERE id = v_by), 'rh a critique');
  END IF;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_a4_critique(text, integer) TO authenticated;

-- 2 critiques the record and the stack while they stand.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_a4_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_a4_got VALUES ('record standing', pg_temp.rh_a4_critique('log', 2));
INSERT INTO rh_a4_got VALUES ('stack standing', pg_temp.rh_a4_critique('stack', 2));
-- 1 deletes both, as themselves.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_a4_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.logs WHERE id = (SELECT id FROM rh_a4_rows WHERE what = 'log');
DELETE FROM public.lists WHERE id = (SELECT id FROM rh_a4_rows WHERE what = 'stack');
-- 1 critiques their own stack, gone.
INSERT INTO rh_a4_got VALUES ('own stack gone', pg_temp.rh_a4_critique('stack', 1));
-- 2 presses FILE on each, gone.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_a4_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_a4_got VALUES ('record gone', pg_temp.rh_a4_critique('log', 2));
INSERT INTO rh_a4_got VALUES ('stack gone', pg_temp.rh_a4_critique('stack', 2));
RESET ROLE;

-- As the house: 1 now lets nobody annotate; 2 critiques the record that stands.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.profiles
   SET preferences = coalesce(preferences, '{}'::jsonb) || '{"privacy_annotations": "nobody"}'::jsonb
 WHERE id = (SELECT id FROM rh_a4_members WHERE n = 1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rh_a4_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_a4_got VALUES ('owner limits', pg_temp.rh_a4_critique('kept log', 2));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('a critique on a record that stands is filed, as before', 'ok',
  (SELECT got FROM rh_a4_got WHERE what = 'record standing')) AS done \gset rh_
SELECT pg_temp.rh_case('and on a stack that stands', 'ok',
  (SELECT got FROM rh_a4_got WHERE what = 'stack standing')) AS done \gset rh_
SELECT pg_temp.rh_case('a critique on a record its owner deleted is told the record is gone', 'P0002: LOG_GONE',
  (SELECT got FROM rh_a4_got WHERE what = 'record gone')) AS done \gset rh_
SELECT pg_temp.rh_case('and on a stack its owner deleted, the stack', 'P0002: STACK_GONE',
  (SELECT got FROM rh_a4_got WHERE what = 'stack gone')) AS done \gset rh_
SELECT pg_temp.rh_case('the owner critiquing their own stack, gone, is told the same, never that they limit themselves', 'P0002: STACK_GONE',
  (SELECT got FROM rh_a4_got WHERE what = 'own stack gone')) AS done \gset rh_
SELECT pg_temp.rh_case('a record whose owner lets nobody annotate still refuses as the owner''s rule', '42501',
  split_part((SELECT got FROM rh_a4_got WHERE what = 'owner limits'), ':', 1)) AS done \gset rh_

-- ── B6 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── B6 rehearsal · a certification taken back takes its notice ──────────────────────────────────
--   Run inside the round's rehearsal, after rehearsal_kit.sql and its rehearsal_members (four
--   members in good standing, n = 1..4), the round's migration applied. Member 1 keeps a record and
--   a stack and files a take; member 2 critiques the take. Member 2 certifies the record, takes it
--   back as themselves and certifies it again; member 3 certifies it: member 1 holds one notice from
--   each, never a third. Member 2 takes it back once more: their notice goes, 3's stands. Member 2
--   certifies the stack and takes it back: its notice goes. Member 3 certifies the take and the
--   critique and takes back the critique's: the critic's notice goes, the author's stands.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Nothing stands between the four, so each case is this run's own doing.
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990000611, 'b6 film', current_date) RETURNING id)
INSERT INTO b6_own SELECT 'log', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title) VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'b6 stack') RETURNING id)
INSERT INTO b6_own SELECT 'stack', id FROM r;
WITH r AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, is_published)
  SELECT 'take', m.id, p.username, 'B6 rehearsal: a take', true
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 1
  RETURNING id)
INSERT INTO b6_own SELECT 'take', id FROM r;
WITH r AS (
  INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
  SELECT (SELECT id FROM b6_own WHERE what = 'take'), m.id, p.username, 'B6 rehearsal: a critique'
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n = 2
  RETURNING id)
INSERT INTO b6_own SELECT 'critique', id FROM r;

-- 2 certifies the record (laid by the house, as the certify the app sends), and takes it back as themselves.
INSERT INTO public.interactions (user_id, target_log_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM b6_own WHERE what = 'log'), 'endorse_log');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.interactions
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND type = 'endorse_log'
   AND target_log_id = (SELECT id FROM b6_own WHERE what = 'log');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- 2 certifies it again; 3 certifies it.
INSERT INTO public.interactions (user_id, target_log_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM b6_own WHERE what = 'log'), 'endorse_log'),
       ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM b6_own WHERE what = 'log'), 'endorse_log');
INSERT INTO b6_count SELECT 'log notices', count(*) FROM public.notifications
 WHERE created_at >= now() AND user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND type = 'endorse'
   AND group_key = 'endorse:log:' || (SELECT id FROM b6_own WHERE what = 'log');
INSERT INTO b6_count SELECT 'log members', count(DISTINCT from_user_id) FROM public.notifications
 WHERE created_at >= now() AND user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND type = 'endorse'
   AND group_key = 'endorse:log:' || (SELECT id FROM b6_own WHERE what = 'log');

-- 2 takes the record's back once more, and certifies the stack and takes that back; 3 certifies the
-- take and the critique (laid by the house) and takes back the critique's. Each takes back as themselves.
INSERT INTO public.interactions (user_id, target_list_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM b6_own WHERE what = 'stack'), 'endorse_list');
INSERT INTO public.dispatch_certifications (user_id, post_id)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM b6_own WHERE what = 'take'));
INSERT INTO public.dispatch_certifications (user_id, comment_id)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM b6_own WHERE what = 'critique'));
INSERT INTO b6_count SELECT 'critique notices before', count(*) FROM public.notifications
 WHERE created_at >= now() AND user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND type = 'endorse'
   AND metadata ->> 'comment_id' = (SELECT id::text FROM b6_own WHERE what = 'critique');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.interactions
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND type = 'endorse_log'
   AND target_log_id = (SELECT id FROM b6_own WHERE what = 'log');
DELETE FROM public.interactions
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND type = 'endorse_list'
   AND target_list_id = (SELECT id FROM b6_own WHERE what = 'stack');
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.dispatch_certifications
 WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 3) AND comment_id = (SELECT id FROM b6_own WHERE what = 'critique');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('a certification taken back and given again leaves one notice, never a second', '2',
  (SELECT n::text FROM b6_count WHERE what = 'log notices')) AS done \gset rh_
SELECT pg_temp.rh_case('one from each member who certified', '2',
  (SELECT n::text FROM b6_count WHERE what = 'log members')) AS done \gset rh_
SELECT pg_temp.rh_case('taken back, its notice goes', '0',
  (SELECT count(*)::text FROM public.notifications
    WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = 2)
      AND group_key = 'endorse:log:' || (SELECT id FROM b6_own WHERE what = 'log'))) AS done \gset rh_
SELECT pg_temp.rh_case('another member''s on the same record stands', '1',
  (SELECT count(*)::text FROM public.notifications
    WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = 3)
      AND group_key = 'endorse:log:' || (SELECT id FROM b6_own WHERE what = 'log'))) AS done \gset rh_
SELECT pg_temp.rh_case('a stack''s certification taken back takes its notice', '0',
  (SELECT count(*)::text FROM public.notifications
    WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = 2)
      AND group_key = 'endorse:list:' || (SELECT id FROM b6_own WHERE what = 'stack'))) AS done \gset rh_
SELECT pg_temp.rh_case('a critique''s certification was told to its critic', '1',
  (SELECT n::text FROM b6_count WHERE what = 'critique notices before')) AS done \gset rh_
SELECT pg_temp.rh_case('and taken back, its notice goes', '0',
  (SELECT count(*)::text FROM public.notifications
    WHERE created_at >= now() AND user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND type = 'endorse'
      AND metadata ->> 'comment_id' = (SELECT id::text FROM b6_own WHERE what = 'critique'))) AS done \gset rh_
SELECT pg_temp.rh_case('while the certification of the filing stands, told to its author', '1',
  (SELECT count(*)::text FROM public.notifications
    WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = 3)
      AND type = 'endorse' AND metadata ->> 'dispatch_post_id' = (SELECT id::text FROM b6_own WHERE what = 'take')
      AND NOT (metadata ? 'comment_id'))) AS done \gset rh_

-- ── F4.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── Rehearsal piece: a shared stack whose stack is gone reads as gone (review round 11) ──
-- Run inside the car's rehearsal transaction, after rehearsal_kit.sql, its rehearsal_members (four
-- members in good standing, n = 1..4) and the car. Member 1 keeps two stacks; member 2 hosts a salon
-- and, as the house sets it, shares in it both stacks (each card carrying its headline, as the
-- phone sends it). Then, signed in as themselves, member 1 deletes one stack. The house finds:
--   the deleted stack's card keeps only its id, marked gone;
--   the stack still standing keeps its card whole, and member 2's own words under each card stay.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- As the house: member 1's two stacks, member 2's salon, and member 2's two cards.
WITH r AS (INSERT INTO public.lists (user_id, title, is_private)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh-f4 a stack to go', false) RETURNING id)
INSERT INTO rh_f4s_rows SELECT 'stack to go', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title, is_private)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh-f4 a stack that stays', false) RETURNING id)
INSERT INTO rh_f4s_rows SELECT 'stack that stays', id FROM r;
WITH r AS (INSERT INTO public.lounges (name, creator_id, is_private)
           VALUES ('rh-f4 a salon of stacks', (SELECT id FROM rehearsal_members WHERE n = 2), false) RETURNING id)
INSERT INTO rh_f4s_rows SELECT 'salon', id FROM r;

WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata)
           VALUES ((SELECT id FROM rh_f4s_rows WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 2),
                   'rh-f4 see this stack', 'list_share',
                   jsonb_build_object('listId', (SELECT id FROM rh_f4s_rows WHERE what = 'stack to go')::text,
                                      'title', 'rh-f4 a stack to go', 'filmCount', 3, 'curator', 'rh-f4-author',
                                      'topPosters', jsonb_build_array('/a.jpg'))) RETURNING id)
INSERT INTO rh_f4s_rows SELECT 'gone stack card', id FROM r;
WITH r AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata)
           VALUES ((SELECT id FROM rh_f4s_rows WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 2),
                   'rh-f4 and this one', 'list_share',
                   jsonb_build_object('listId', (SELECT id FROM rh_f4s_rows WHERE what = 'stack that stays')::text,
                                      'title', 'rh-f4 a stack that stays', 'curator', 'rh-f4-author')) RETURNING id)
INSERT INTO rh_f4s_rows SELECT 'standing stack card', id FROM r;
SELECT pg_temp.rh_need('the two cards', (SELECT count(*) FROM rh_f4s_rows WHERE what LIKE '%card'), 2) AS done \gset rh_

-- Member 1, as themselves, deletes one stack, as the app does.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.lists WHERE id = (SELECT id FROM rh_f4s_rows WHERE what = 'stack to go');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('the deleted stack is gone', '0',
  (SELECT count(*)::text FROM public.lists WHERE id = (SELECT id FROM rh_f4s_rows WHERE what = 'stack to go'))) AS done \gset rh_
SELECT pg_temp.rh_case('its card keeps only its id, and reads as gone',
  jsonb_build_object('listId', (SELECT id FROM rh_f4s_rows WHERE what = 'stack to go')::text, 'gone', true)::text,
  (SELECT metadata::text FROM public.lounge_messages WHERE id = (SELECT id FROM rh_f4s_rows WHERE what = 'gone stack card'))) AS done \gset rh_
SELECT pg_temp.rh_case('a stack still standing keeps its card whole', 'rh-f4 a stack that stays|rh-f4-author|',
  (SELECT concat_ws('|', metadata ->> 'title', metadata ->> 'curator', coalesce(metadata ->> 'gone', ''))
     FROM public.lounge_messages WHERE id = (SELECT id FROM rh_f4s_rows WHERE what = 'standing stack card'))) AS done \gset rh_
SELECT pg_temp.rh_case('the sharer''s own words under each card stay', 'rh-f4 and this one|rh-f4 see this stack',
  (SELECT string_agg(content, '|' ORDER BY content) FROM public.lounge_messages
    WHERE id IN (SELECT id FROM rh_f4s_rows WHERE what LIKE '%card'))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
