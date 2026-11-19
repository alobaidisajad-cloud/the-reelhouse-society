-- ════════════════════════════════════════════════════════════════════════════
-- a_withheld_piece_is_read_by_its_author_alone_rehearsal.sql — 20261120_31. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_withheld_piece_is_read_by_its_author_alone_rehearsal.sql --with-train
--
-- The train applies 20261120_31 here (with_train), 20261120_00 to 20261120_30 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 14).
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
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE hb10l_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON hb10l_ids TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_31_a_withheld_piece_is_read_by_its_author_alone.sql
\endif

-- ── H-B10.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B10's columns and rules rehearsal · a withheld piece is read by its author alone (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and H-B10.locks (H-B3.column before
-- it), with its rehearsal_members (n = 1..4); every row is undone with the transaction. Member 2 keeps a
-- log with member 3's critique, a stack with a film and member 3's critique, and a filing with member 3's
-- critique; member 3 shares 2's log in a salon where 1, 2 and 3 sit. The house withholds each of 2's
-- pieces, and 3's critique of a log of 1's. Then, each as themselves:
--   1 reads none of them: not the log, its critique, the stack, its film or its critique, the filing or
--   its critique, nor 3's card of the log; 3 reads none of them either, nor their own withheld critique's
--   log page... but reads their own critique;
--   2 reads every piece of theirs; 2 cannot clear the withholding of their own log;
--   no reading rule asks a salon card (the house turns a withheld piece's cards itself, H-B10);
--   no one certifies a withheld critique; no member or visitor reads the old Dispatch's tables;
--   2 deletes their old pictures, but not one the Tribunal holds as evidence or keeps to put back;
--   what the house has not withheld is read as before.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET tier = 'auteur', is_banned = false, suspended_until = NULL, is_social_private = false,
       preferences = coalesce(preferences, '{}'::jsonb) - 'privacy_annotations'
 WHERE id IN (SELECT id FROM rehearsal_members);

WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 990001001, 'rh film of 2', '2026-01-01', 'rh review of 2') RETURNING id)
INSERT INTO hb10l_ids SELECT 'log', id FROM made;
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date, review)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990001002, 'rh film of 1', '2026-01-01', 'rh review of 1') RETURNING id)
INSERT INTO hb10l_ids SELECT 'log of 1', id FROM made;
WITH made AS (INSERT INTO public.log_comments (log_id, user_id, body)
              VALUES ((SELECT id FROM hb10l_ids WHERE what = 'log'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh critique of 3 on 2') RETURNING id)
INSERT INTO hb10l_ids SELECT 'critique on log', id FROM made;
WITH made AS (INSERT INTO public.log_comments (log_id, user_id, body)
              VALUES ((SELECT id FROM hb10l_ids WHERE what = 'log of 1'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh critique of 3 on 1') RETURNING id)
INSERT INTO hb10l_ids SELECT 'critique on 1', id FROM made;
WITH made AS (INSERT INTO public.lists (user_id, title, is_private) VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'rh stack of 2', false) RETURNING id)
INSERT INTO hb10l_ids SELECT 'stack', id FROM made;
INSERT INTO public.list_items (list_id, film_id, film_title) VALUES ((SELECT id FROM hb10l_ids WHERE what = 'stack'), 990001003, 'rh film in the stack');
WITH made AS (INSERT INTO public.list_comments (list_id, user_id, content)
              VALUES ((SELECT id FROM hb10l_ids WHERE what = 'stack'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh critique of 3 on the stack') RETURNING id)
INSERT INTO hb10l_ids SELECT 'critique on stack', id FROM made;
WITH made AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, is_published)
              VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 2), 'rh', 'rh filing of 2', 'rh words of 2', true) RETURNING id)
INSERT INTO hb10l_ids SELECT 'filing', id FROM made;
WITH made AS (INSERT INTO public.dispatch_comments (post_id, user_id, body)
              VALUES ((SELECT id FROM hb10l_ids WHERE what = 'filing'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh critique of 3 on the filing') RETURNING id)
INSERT INTO hb10l_ids SELECT 'critique on filing', id FROM made;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private) VALUES ('rh The Withheld Room', (SELECT id FROM rehearsal_members WHERE n = 3), false) RETURNING id)
INSERT INTO hb10l_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM hb10l_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM hb10l_ids WHERE what = 'salon'), id, 'approved' FROM rehearsal_members WHERE n IN (1, 2, 3);
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata)
              VALUES ((SELECT id FROM hb10l_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 3), '', 'log_share',
                      jsonb_build_object('log_id', (SELECT id FROM hb10l_ids WHERE what = 'log'))) RETURNING id)
INSERT INTO hb10l_ids SELECT 'card', id FROM made;
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
              VALUES ((SELECT id FROM hb10l_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh a plain word of 3') RETURNING id)
INSERT INTO hb10l_ids SELECT 'plain', id FROM made;

-- What a member reads of a row, as themselves: 'read', 'unread', or the refusal.
CREATE FUNCTION pg_temp.hb10l_reads(p_member bigint, p_table text, p_what text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got bigint; v_out text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = (SELECT id FROM hb10l_ids WHERE what = %L)', p_table, p_what) INTO v_got;
    v_out := CASE WHEN v_got > 0 THEN 'read' ELSE 'unread' END;
  EXCEPTION WHEN OTHERS THEN
    v_out := 'refused: ' || SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb10l_reads(bigint, text, text) TO authenticated;
CREATE FUNCTION pg_temp.hb10l_items(p_member bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_got FROM public.list_items WHERE list_id = (SELECT id FROM hb10l_ids WHERE what = 'stack');
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_got::text;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb10l_items(bigint) TO authenticated;

-- Before anything is withheld, everything reads.
SELECT pg_temp.rh_case('before: 1 reads 2''s log', 'read', pg_temp.hb10l_reads(1, 'logs', 'log'));
SELECT pg_temp.rh_case('before: 1 reads 3''s card of it', 'read', pg_temp.hb10l_reads(1, 'lounge_messages', 'card'));
SELECT pg_temp.rh_case('before: 1 reads the critique of the filing', 'read', pg_temp.hb10l_reads(1, 'dispatch_comments', 'critique on filing'));

-- The house withholds.
UPDATE public.logs SET withheld_at = now() WHERE id = (SELECT id FROM hb10l_ids WHERE what = 'log');
UPDATE public.lists SET withheld_at = now() WHERE id = (SELECT id FROM hb10l_ids WHERE what = 'stack');
UPDATE public.dispatch_posts SET withheld_at = now() WHERE id = (SELECT id FROM hb10l_ids WHERE what = 'filing');
UPDATE public.log_comments SET withheld_at = now() WHERE id = (SELECT id FROM hb10l_ids WHERE what = 'critique on 1');

SELECT pg_temp.rh_case('1 reads no withheld log', 'unread', pg_temp.hb10l_reads(1, 'logs', 'log'));
SELECT pg_temp.rh_case('1 reads none of its critiques', 'unread', pg_temp.hb10l_reads(1, 'log_comments', 'critique on log'));
SELECT pg_temp.rh_case('1 reads no withheld stack', 'unread', pg_temp.hb10l_reads(1, 'lists', 'stack'));
SELECT pg_temp.rh_case('1 reads none of its films', '0', pg_temp.hb10l_items(1));
SELECT pg_temp.rh_case('1 reads none of its critiques', 'unread', pg_temp.hb10l_reads(1, 'list_comments', 'critique on stack'));
SELECT pg_temp.rh_case('1 reads no withheld filing', 'unread', pg_temp.hb10l_reads(1, 'dispatch_posts', 'filing'));
SELECT pg_temp.rh_case('1 reads none of its critiques', 'unread', pg_temp.hb10l_reads(1, 'dispatch_comments', 'critique on filing'));
SELECT pg_temp.rh_case('no reading rule asks a card: the house turns a withheld piece''s cards as it withholds it (H-B10)', 'read|read',
  pg_temp.hb10l_reads(1, 'lounge_messages', 'card') || '|' || pg_temp.hb10l_reads(3, 'lounge_messages', 'card'));
SELECT pg_temp.rh_case('1 reads no withheld critique on their own log', 'unread', pg_temp.hb10l_reads(1, 'log_comments', 'critique on 1'));
SELECT pg_temp.rh_case('3 reads their own withheld critique', 'read', pg_temp.hb10l_reads(3, 'log_comments', 'critique on 1'));
SELECT pg_temp.rh_case('2 reads their withheld log', 'read', pg_temp.hb10l_reads(2, 'logs', 'log'));
SELECT pg_temp.rh_case('2 reads its critiques', 'read', pg_temp.hb10l_reads(2, 'log_comments', 'critique on log'));
SELECT pg_temp.rh_case('2 reads their withheld stack and its films', 'read|1', pg_temp.hb10l_reads(2, 'lists', 'stack') || '|' || pg_temp.hb10l_items(2));
SELECT pg_temp.rh_case('2 reads their withheld filing', 'read', pg_temp.hb10l_reads(2, 'dispatch_posts', 'filing'));
SELECT pg_temp.rh_case('1 still reads the plain word beside it', 'read', pg_temp.hb10l_reads(1, 'lounge_messages', 'plain'));
SELECT pg_temp.rh_case('1 still reads their own log', 'read', pg_temp.hb10l_reads(1, 'logs', 'log of 1'));

-- A withheld critique takes no certification; one that stands takes one, as before.
WITH made AS (INSERT INTO public.dispatch_posts (kind, user_id, author_username, title, body, is_published)
              VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh', 'rh filing of 1', 'rh words of 1', true) RETURNING id)
INSERT INTO hb10l_ids SELECT 'filing of 1', id FROM made;
WITH made AS (INSERT INTO public.dispatch_comments (post_id, user_id, body)
              SELECT (SELECT id FROM hb10l_ids WHERE what = 'filing of 1'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh critique ' || g || ' of 3 on 1''s filing'
                FROM generate_series(1, 2) g RETURNING id, body)
INSERT INTO hb10l_ids SELECT CASE WHEN body LIKE 'rh critique 1 %' THEN 'withheld critique on 1''s filing' ELSE 'critique on 1''s filing' END, id FROM made;
UPDATE public.dispatch_comments SET withheld_at = now() WHERE id = (SELECT id FROM hb10l_ids WHERE what = 'withheld critique on 1''s filing');
CREATE FUNCTION pg_temp.hb10l_certify(p_member bigint, p_what text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_out text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO public.dispatch_certifications (user_id, comment_id)
    VALUES ((SELECT id FROM rehearsal_members WHERE n = p_member), (SELECT id FROM hb10l_ids WHERE what = p_what));
    v_out := 'certified';
  EXCEPTION WHEN OTHERS THEN
    v_out := 'refused: ' || SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb10l_certify(bigint, text) TO authenticated;
SELECT pg_temp.rh_case('2 certifies no withheld critique, and certifies one that stands', 'refused: 42501|certified',
  pg_temp.hb10l_certify(2, 'withheld critique on 1''s filing') || '|' || pg_temp.hb10l_certify(2, 'critique on 1''s filing'));

-- The old Dispatch's tables: no member, no visitor reads them; the house still does.
SELECT pg_temp.rh_case('no member or visitor reads the old Dispatch''s tables', 'false|false|false|false|false|false',
  has_table_privilege('anon', 'public.dispatch_dossiers_legacy', 'SELECT')::text || '|' || has_table_privilege('authenticated', 'public.dispatch_dossiers_legacy', 'SELECT')::text || '|'
  || has_table_privilege('anon', 'public.dossier_comments_legacy', 'SELECT')::text || '|' || has_table_privilege('authenticated', 'public.dossier_comments_legacy', 'SELECT')::text || '|'
  || has_table_privilege('anon', 'public.dossier_certifications_legacy', 'SELECT')::text || '|' || has_table_privilege('authenticated', 'public.dossier_certifications_legacy', 'SELECT')::text);
SELECT pg_temp.rh_case('the Dispatch''s views still read, as every client reads them', 'read|read',
  pg_temp.hb10l_reads(1, 'dossier_comments', 'critique on 1''s filing') || '|' || pg_temp.hb10l_reads(1, 'dispatch_posts', 'filing of 1'));

-- 2's pictures: the rule stands wherever the role that applied the car rules storage (production's
-- postgres does; CI's stand-in storage is another's, with no row security on it). Its cases run in
-- H-B10.locks.storage.sql, on a copy where the runner rules storage as production's postgres does.
-- The car's own record says which: made, with no note on its function; or not made, with a note naming
-- the role that applied it, a role that does not rule storage. True whichever role applied and whichever
-- rehearses (CI applies as postgres and rehearses as Supabase's stand-in).
SELECT pg_temp.rh_case('the pictures'' rule stands exactly where the role that applied the car rules storage', 'true',
  (CASE WHEN (SELECT count(*) = 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_held_as_evidence')
        THEN obj_description('private.a_picture_is_held(text, text)'::regprocedure, 'pg_proc') IS NULL
        ELSE EXISTS (SELECT 1 FROM pg_roles r
                      WHERE obj_description('private.a_picture_is_held(text, text)'::regprocedure, 'pg_proc')
                            = format('avatars_held_as_evidence is not made: storage.objects is not %s''s to rule', r.rolname)
                        AND NOT pg_has_role(r.oid, (SELECT c.relowner FROM pg_class c WHERE c.oid = 'storage.objects'::regclass), 'USAGE'))
   END)::text);
SELECT pg_temp.rh_case('the rule''s question is the house''s alone: no member asks it', 'false',
  has_function_privilege('anon', 'private.a_picture_is_held(text, text)', 'EXECUTE')::text);

-- 2 clears the withholding of their own log by hand: it stays withheld.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
SET LOCAL role authenticated;
UPDATE public.logs SET withheld_at = NULL, review = 'rh review of 2, amended' WHERE id = (SELECT id FROM hb10l_ids WHERE what = 'log');
RESET role;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('2 amends the log, and it stays withheld', 'rh review of 2, amended|withheld',
  (SELECT review || '|' || CASE WHEN withheld_at IS NULL THEN 'given back' ELSE 'withheld' END FROM public.logs WHERE id = (SELECT id FROM hb10l_ids WHERE what = 'log')));

SELECT pg_temp.rh_verdict();
ROLLBACK;
