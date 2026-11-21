-- ════════════════════════════════════════════════════════════════════════════
-- a_follow_is_not_read_across_a_block_rehearsal.sql — 20261120_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_follow_is_not_read_across_a_block_rehearsal.sql --with-train
--
-- The train applies 20261120_04 here (with_train), 20261120_00 to 20261120_03 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE ha2l_got (who text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON ha2l_got TO anon, authenticated;
CREATE TEMP TABLE ha2n_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ha2n_ids TO anon, authenticated;
CREATE TEMP TABLE ha2n_got (who text, k text, v text, PRIMARY KEY (who, k)) ON COMMIT DROP;
GRANT ALL ON ha2n_got TO anon, authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261120_04_a_follow_is_not_read_across_a_block.sql
\endif

-- ── H-A2.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A2 (the rule) rehearsal · a member's follows are not read across a block (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4), the car before this one applied.
-- Member 1 follows member 3, member 3 follows member 1 and member 4; member 4 then turns private, and
-- member 1 blocks member 2.
-- As member 2: none of member 1's follows, either way, though member 3's file is open; member 3's
-- follow of member 4 as before. As member 4 (no block): both follows between members 1 and 3, as
-- before. As member 1: every one of them. A visitor: every follow with an open end, as before.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interactions
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = false WHERE id IN (SELECT id FROM rehearsal_members);
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3), 'follow'),
       ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 1), 'follow'),
       ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 4), 'follow');
-- Member 4 turns private after member 3 followed them (a follow asked of a private member is a request).
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'block');

-- The follows among the run's members a reader is shown, as from>to, in one order.
CREATE FUNCTION pg_temp.ha2l_seen() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(f.n || '>' || t.n, ',' ORDER BY f.n, t.n), '')
    FROM public.interactions i
    JOIN rehearsal_members f ON f.id = i.user_id
    JOIN rehearsal_members t ON t.id = i.target_user_id
   WHERE i.type = 'follow'
$$;
GRANT EXECUTE ON FUNCTION pg_temp.ha2l_seen() TO anon, authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ha2l_got VALUES ('blocked', pg_temp.ha2l_seen());
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ha2l_got VALUES ('bystander', pg_temp.ha2l_seen());
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ha2l_got VALUES ('blocker', pg_temp.ha2l_seen());
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) AS done \gset rh_
INSERT INTO ha2l_got VALUES ('visitor', pg_temp.ha2l_seen());
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('across a block, none of the blocker''s follows either way; another''s as before',
  '3>4', (SELECT v FROM ha2l_got WHERE who = 'blocked')) AS done \gset rh_
SELECT pg_temp.rh_case('a member with no block reads every follow with an open end, as before',
  '1>3,3>1,3>4', (SELECT v FROM ha2l_got WHERE who = 'bystander')) AS done \gset rh_
SELECT pg_temp.rh_case('the blocker reads their own follows and the rest, as before',
  '1>3,3>1,3>4', (SELECT v FROM ha2l_got WHERE who = 'blocker')) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor reads every follow with an open end, as before',
  '1>3,3>1,3>4', (SELECT v FROM ha2l_got WHERE who = 'visitor')) AS done \gset rh_

-- ── The blocker is no one to the member they blocked ──
-- Member 1 (who blocked member 2) hosts a salon, sits in member 3's, reacts there to member 3's word,
-- has a logged film and an old dossier with a certification. Member 2 asks every read of
-- member 1, and of an id and a handle no member holds: each answer is the same, row for row and key
-- for key (the figures are the car before this one's: its rehearsal compares them). Member 1 reads their own file and member 2's row as they read them once the block is gone
-- (their search leaves member 2 out, as round 12 made it: Settings lists those they hid);
-- an admin member 1 also blocked, and a visitor, read member 1's row.
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 3));
INSERT INTO ha2n_ids VALUES ('no one', gen_random_uuid());
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh H-A2 the blocker''s salon', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO ha2n_ids SELECT 'salon of 1', id FROM made;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh H-A2 a third salon', (SELECT id FROM rehearsal_members WHERE n = 3), false) RETURNING id)
INSERT INTO ha2n_ids SELECT 'salon of 3', id FROM made;
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM ha2n_ids WHERE what = 'salon of 3'), id, 'approved' FROM rehearsal_members WHERE n IN (1, 2)
ON CONFLICT DO NOTHING;
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
              VALUES ((SELECT id FROM ha2n_ids WHERE what = 'salon of 3'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh H-A2 a word') RETURNING id)
INSERT INTO ha2n_ids SELECT 'word', id FROM made;
INSERT INTO public.lounge_message_reactions (message_id, lounge_id, user_id, reaction)
VALUES ((SELECT id FROM ha2n_ids WHERE what = 'word'), (SELECT id FROM ha2n_ids WHERE what = 'salon of 3'), (SELECT id FROM rehearsal_members WHERE n = 1), 'bravo');
WITH made AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990693, 'rh H-A2 wall film', '2026-01-03') RETURNING id)
INSERT INTO ha2n_ids SELECT 'log', id FROM made;
WITH made AS (INSERT INTO public.dispatch_dossiers_legacy (user_id, author_username, title, is_published)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh', 'rh H-A2 old dossier', true) RETURNING id)
INSERT INTO ha2n_ids SELECT 'dossier', id FROM made;
INSERT INTO public.dossier_certifications_legacy (user_id, dossier_id)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM ha2n_ids WHERE what = 'dossier'));
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 4), 'block');
CREATE TEMP TABLE ha2n_who ON COMMIT DROP AS
  SELECT m.n, p.username FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id;
GRANT SELECT ON ha2n_who TO anon, authenticated;

-- An old Dispatch table's rows of a member, as the caller reads them: 'refused' where the caller may not
-- read the table at all (H-B10.locks takes it from members and visitors), so the reads hold before that car
-- and after it. Asked by name only where SELECT is held: a refused table is never opened.
CREATE FUNCTION pg_temp.ha2n_old(p_table regclass, p_id uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  IF NOT has_table_privilege(p_table, 'SELECT') THEN
    RETURN 'refused';
  END IF;
  EXECUTE format('SELECT count(*) FROM %s WHERE user_id = $1', p_table) INTO v USING p_id;
  RETURN v::text;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ha2n_old(regclass, uuid) TO anon, authenticated;
-- What a member reads of an old Dispatch table's rows they may read: n where SELECT is theirs, else 'refused'.
CREATE FUNCTION pg_temp.ha2n_may(p_table regclass, p_n text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN has_table_privilege('authenticated', p_table, 'SELECT') THEN p_n ELSE 'refused' END
$$;
-- Every read of a member, by id (and the handle given), as the caller reads it.
CREATE FUNCTION pg_temp.ha2n_ask(p_who text, p_id uuid, p_handle text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ha2n_got VALUES
    (p_who, 'profile by id', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'bio', p.bio, 'role', p.role, 'is_social_private', p.is_social_private)), '[]') FROM public.profiles p WHERE p.id = p_id)::text),
    (p_who, 'profile by handle', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'bio', p.bio, 'role', p.role, 'is_social_private', p.is_social_private)), '[]') FROM public.profiles p WHERE p.username = p_handle)::text),
    (p_who, 'rows', concat_ws(',',
       (SELECT count(*) FROM public.logs WHERE user_id = p_id),
       (SELECT count(*) FROM public.lists WHERE user_id = p_id),
       (SELECT count(*) FROM public.watchlists WHERE user_id = p_id),
       (SELECT count(*) FROM public.physical_archive WHERE user_id = p_id),
       (SELECT count(*) FROM public.interactions WHERE user_id = p_id OR target_user_id = p_id),
       (SELECT count(*) FROM public.lounges WHERE creator_id = p_id),
       (SELECT count(*) FROM public.lounge_members WHERE user_id = p_id),
       (SELECT count(*) FROM public.lounge_message_reactions WHERE user_id = p_id),
       pg_temp.ha2n_old('public.dispatch_dossiers_legacy', p_id),
       pg_temp.ha2n_old('public.dossier_certifications_legacy', p_id))),
    (p_who, 'search', (SELECT count(*) FROM public.search_members(p_handle, true, NULL, NULL, 50) s WHERE s.username = p_handle)::text);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ha2n_ask(text, uuid, text) TO anon, authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2n_ask('blocked of 1', (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT username FROM ha2n_who WHERE n = 1));
SELECT pg_temp.ha2n_ask('blocked of no one', (SELECT id FROM ha2n_ids WHERE what = 'no one'), 'rh_no_member_holds_this');
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2n_ask('blocker of self, blocked', (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT username FROM ha2n_who WHERE n = 1));
SELECT pg_temp.ha2n_ask('blocker of 2, blocked', (SELECT id FROM rehearsal_members WHERE n = 2), (SELECT username FROM ha2n_who WHERE n = 2));
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2n_ask('admin of 1', (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT username FROM ha2n_who WHERE n = 1));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) AS done \gset rh_
INSERT INTO ha2n_got VALUES ('visitor of 1', 'profile by id',
  (SELECT count(*) FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1))::text);
RESET ROLE;
-- The blocks go (as the house), and member 1 asks the same of themselves and of member 2 again.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks WHERE blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1)
   AND blocked_id IN (SELECT id FROM rehearsal_members WHERE n IN (2, 4));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2n_ask('blocker of self, unblocked', (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT username FROM ha2n_who WHERE n = 1));
SELECT pg_temp.ha2n_ask('blocker of 2, unblocked', (SELECT id FROM rehearsal_members WHERE n = 2), (SELECT username FROM ha2n_who WHERE n = 2));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE FUNCTION pg_temp.ha2n(p_who text, p_k text) RETURNS text LANGUAGE sql AS $$ SELECT v FROM ha2n_got WHERE who = p_who AND k = p_k $$;
SELECT count(pg_temp.rh_case('to the member blocked, ' || k || ' of the blocker is that of no one',
  pg_temp.ha2n('blocked of no one', k), pg_temp.ha2n('blocked of 1', k)))
  FROM unnest(ARRAY['profile by id', 'profile by handle', 'rows', 'search']) k \gset rh_
SELECT pg_temp.rh_case('and no one is nothing: no row, no count',
  '[]|[]|0,0,0,0,0,0,0,0,' || pg_temp.ha2n_may('public.dispatch_dossiers_legacy', '0') || ','
    || pg_temp.ha2n_may('public.dossier_certifications_legacy', '0') || '|0',
  concat_ws('|', pg_temp.ha2n('blocked of 1', 'profile by id'), pg_temp.ha2n('blocked of 1', 'profile by handle'),
            pg_temp.ha2n('blocked of 1', 'rows'), pg_temp.ha2n('blocked of 1', 'search'))) AS done \gset rh_
SELECT count(pg_temp.rh_case('the blocker''s own ' || k || ' is as it is with no block', pg_temp.ha2n('blocker of self, unblocked', k), pg_temp.ha2n('blocker of self, blocked', k)))
  FROM unnest(ARRAY['profile by id', 'profile by handle', 'rows', 'search']) k \gset rh_
SELECT count(pg_temp.rh_case('the blocker reads the blocked member''s ' || k || ' as with no block', pg_temp.ha2n('blocker of 2, unblocked', k), pg_temp.ha2n('blocker of 2, blocked', k)))
  FROM unnest(ARRAY['profile by id', 'profile by handle']) k \gset rh_
-- (The old dossier and certification: as before while members may read the old tables; refused to
-- every member, an admin too, once H-B10.locks takes them, the house's own functions reading them as the house.)
SELECT pg_temp.rh_case('an admin the blocker blocked still reads the blocker''s row, salon, reaction, dossier and certification (a roster is its salon''s alone), as before',
  -- Member 1 is borrowed from the house and may hold salons, reactions and dossiers of their own: the
  -- admin reads all the house holds of them, counted here as the house.
  concat_ws(',', '1',
    (SELECT count(*) FROM public.lounges WHERE creator_id = (SELECT id FROM rehearsal_members WHERE n = 1)),
    (SELECT count(*) FROM public.lounge_message_reactions WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1)),
    pg_temp.ha2n_may('public.dispatch_dossiers_legacy', (SELECT count(*) FROM public.dispatch_dossiers_legacy WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1))::text),
    pg_temp.ha2n_may('public.dossier_certifications_legacy', (SELECT count(*) FROM public.dossier_certifications_legacy WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1))::text)),
  concat_ws(',', jsonb_array_length(pg_temp.ha2n('admin of 1', 'profile by id')::jsonb),
            split_part(pg_temp.ha2n('admin of 1', 'rows'), ',', 6),
            split_part(pg_temp.ha2n('admin of 1', 'rows'), ',', 8), split_part(pg_temp.ha2n('admin of 1', 'rows'), ',', 9),
            split_part(pg_temp.ha2n('admin of 1', 'rows'), ',', 10))) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor reads the blocker''s row', '1', pg_temp.ha2n('visitor of 1', 'profile by id')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
