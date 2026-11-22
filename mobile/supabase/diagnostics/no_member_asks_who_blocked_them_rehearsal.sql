-- ════════════════════════════════════════════════════════════════════════════
-- no_member_asks_who_blocked_them_rehearsal.sql — 20261120_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs no_member_asks_who_blocked_them_rehearsal.sql
--
-- 20261120_02 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE ha5_got (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON ha5_got TO anon, authenticated;

-- ── H-A5 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A5 rehearsal · no member can ask the house who blocked them (review round 14) ──────────────────
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). Member 2 blocks member 1 and files
-- a record. As member 1 and as a visitor: the two public names are refused (the API would serve them);
-- no function a member or visitor may run in public bears either name. Then the rule still holds as
-- the member reads: member 1 reads none of member 2's records, member 3 reads them; member 1's search
-- leaves member 2 out, member 3's finds them; the six functions members run as themselves answer, and
-- the house's own (get_profile_counts, get_marks_ledger) still run for a member. In member 3's salon,
-- where 1, 2 and 3 sit, member 1 is shown no face of member 2 and member 3 every face; no function asks
-- the rule through its public name, and the member search runs as the house.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = false WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 1), 'block');
INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 603, 'rh H-A5 The Matrix', current_date);
CREATE TEMP TABLE ha5_who ON COMMIT DROP AS
  SELECT m.n, p.username FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id;
GRANT SELECT ON ha5_who TO anon, authenticated;
-- Member 3 hosts an open salon where 1, 2 and 3 sit: its three faces.
UPDATE public.profiles SET tier = 'archivist' WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2, 3));
CREATE TEMP TABLE ha5_salon ON COMMIT DROP AS
  WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
                VALUES ('The Rehearsal Faces Room', (SELECT id FROM rehearsal_members WHERE n = 3), false) RETURNING id)
  SELECT id FROM made;
GRANT SELECT ON ha5_salon TO anon, authenticated;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM ha5_salon);
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM ha5_salon), m.id, 'approved' FROM rehearsal_members m WHERE m.n IN (1, 2, 3);
-- The faces a member is shown of that salon, each by the member's number.
CREATE FUNCTION pg_temp.ha5_faces() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(w.n::text, ',' ORDER BY w.n), 'none')
    FROM public.get_salon_member_faces(ARRAY[(SELECT id FROM ha5_salon)]) f JOIN ha5_who w ON w.username = f.username
$$;
GRANT EXECUTE ON FUNCTION pg_temp.ha5_faces() TO authenticated;

-- As member 1, whom member 2 blocked.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
BEGIN
  PERFORM public.hidden_authors();
  INSERT INTO ha5_got VALUES ('member asks hidden_authors', 'answered');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO ha5_got VALUES ('member asks hidden_authors', 'refused');
END $$;
DO $$
BEGIN
  PERFORM public.is_hidden_by(NULL, (SELECT id FROM rehearsal_members WHERE n = 2));
  INSERT INTO ha5_got VALUES ('member asks is_hidden_by', 'answered');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO ha5_got VALUES ('member asks is_hidden_by', 'refused');
END $$;
INSERT INTO ha5_got SELECT 'member 1 reads member 2''s records', count(*)::text
  FROM public.logs WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2);
INSERT INTO ha5_got SELECT 'member 1 finds member 2', count(*)::text
  FROM public.search_members((SELECT username FROM ha5_who WHERE n = 2), false, NULL, NULL, 20) s
 WHERE s.id = (SELECT id FROM rehearsal_members WHERE n = 2);
INSERT INTO ha5_got SELECT 'the rule, asked as the read rules ask it', ((SELECT id FROM rehearsal_members WHERE n = 2) = ANY (private.hidden_authors()))::text;
INSERT INTO ha5_got SELECT 'lobby', (public.get_lobby() IS NOT NULL)::text;
INSERT INTO ha5_got SELECT 'salons', (public.get_lounge_list() IS NOT NULL)::text;
INSERT INTO ha5_got SELECT 'reel', count(*)::text FROM public.get_community_feed_auth_cursor(40, NULL, NULL) f
 WHERE f.user_id = (SELECT id FROM rehearsal_members WHERE n = 2);
INSERT INTO ha5_got SELECT 'archive films', count(*)::text FROM public.dispatch_archive_films('rh H-A5');
INSERT INTO ha5_got SELECT 'critiques seen', coalesce(public.critiques_seen(l), 0)::text
  FROM public.logs l WHERE l.user_id = (SELECT id FROM rehearsal_members WHERE n = 1) LIMIT 1;
INSERT INTO ha5_got SELECT 'profile counts', (public.get_profile_counts((SELECT id FROM rehearsal_members WHERE n = 3)) IS NOT NULL)::text;
INSERT INTO ha5_got SELECT 'marks', (public.get_marks_ledger() IS NOT NULL)::text;
INSERT INTO ha5_got SELECT 'member 1 sees the faces', pg_temp.ha5_faces();

-- As member 3, whom no one blocked.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ha5_got SELECT 'member 3 reads member 2''s records', count(*)::text
  FROM public.logs WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND film_title = 'rh H-A5 The Matrix';
INSERT INTO ha5_got SELECT 'member 3 finds member 2', count(*)::text
  FROM public.search_members((SELECT username FROM ha5_who WHERE n = 2), false, NULL, NULL, 20) s
 WHERE s.id = (SELECT id FROM rehearsal_members WHERE n = 2);
INSERT INTO ha5_got SELECT 'member 3 sees the faces', pg_temp.ha5_faces();
RESET ROLE;

-- As a visitor.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) AS done \gset rh_
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.hidden_authors();
  INSERT INTO ha5_got VALUES ('visitor asks hidden_authors', 'answered');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO ha5_got VALUES ('visitor asks hidden_authors', 'refused');
END $$;
INSERT INTO ha5_got SELECT 'visitor reads member 2''s records', count(*)::text
  FROM public.logs WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND film_title = 'rh H-A5 The Matrix';
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_case('a member asking who is hidden from them is refused', 'refused', (SELECT v FROM ha5_got WHERE k = 'member asks hidden_authors')) AS done \gset rh_
SELECT pg_temp.rh_case('and asking it of one member', 'refused', (SELECT v FROM ha5_got WHERE k = 'member asks is_hidden_by')) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor too', 'refused', (SELECT v FROM ha5_got WHERE k = 'visitor asks hidden_authors')) AS done \gset rh_
SELECT pg_temp.rh_case('no function in public a member or visitor may run bears either name', '0',
  (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'graphql_public') AND p.proname IN ('hidden_authors', 'is_hidden_by')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')))) AS done \gset rh_
SELECT pg_temp.rh_case('the rule lives where the API never serves it', 'private,private',
  (SELECT string_agg(n.nspname, ',' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname IN ('hidden_authors', 'is_hidden_by') AND p.prosecdef)) AS done \gset rh_
SELECT pg_temp.rh_case('every read rule that hid a member calls it there', '0',
  (SELECT count(*)::text FROM pg_policy WHERE pg_get_expr(polqual, polrelid) ~ 'public\.(hidden_authors|is_hidden_by)')) AS done \gset rh_
SELECT pg_temp.rh_case('and the ten rules still call it', '10',
  (SELECT count(*)::text FROM pg_policy WHERE pg_get_expr(polqual, polrelid) ~ 'private\.hidden_authors')) AS done \gset rh_
SELECT pg_temp.rh_case('the rule answers as the read rules ask it, for the member', 'true', (SELECT v FROM ha5_got WHERE k = 'the rule, asked as the read rules ask it')) AS done \gset rh_
SELECT pg_temp.rh_case('the blocked member reads none of the blocker''s records', '0', (SELECT v FROM ha5_got WHERE k = 'member 1 reads member 2''s records')) AS done \gset rh_
SELECT pg_temp.rh_case('another member reads them', '1', (SELECT v FROM ha5_got WHERE k = 'member 3 reads member 2''s records')) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor reads them', '1', (SELECT v FROM ha5_got WHERE k = 'visitor reads member 2''s records')) AS done \gset rh_
SELECT pg_temp.rh_case('the blocked member''s search leaves the blocker out', '0', (SELECT v FROM ha5_got WHERE k = 'member 1 finds member 2')) AS done \gset rh_
SELECT pg_temp.rh_case('another member''s finds them', '1', (SELECT v FROM ha5_got WHERE k = 'member 3 finds member 2')) AS done \gset rh_
SELECT pg_temp.rh_case('the Reel leaves the blocker out', '0', (SELECT v FROM ha5_got WHERE k = 'reel')) AS done \gset rh_
SELECT pg_temp.rh_case('the Lobby answers', 'true', (SELECT v FROM ha5_got WHERE k = 'lobby')) AS done \gset rh_
SELECT pg_temp.rh_case('the salons answer', 'true', (SELECT v FROM ha5_got WHERE k = 'salons')) AS done \gset rh_
SELECT pg_temp.rh_case('the Dispatch archive''s films answer', '0', (SELECT v FROM ha5_got WHERE k = 'archive films')) AS done \gset rh_
SELECT pg_temp.rh_case('the house''s own functions still run for a member', 'true,true',
  (SELECT v FROM ha5_got WHERE k = 'profile counts') || ',' || (SELECT v FROM ha5_got WHERE k = 'marks')) AS done \gset rh_
SELECT pg_temp.rh_case('the salon shows the blocked member no face of the blocker', '1,3', (SELECT v FROM ha5_got WHERE k = 'member 1 sees the faces')) AS done \gset rh_
SELECT pg_temp.rh_case('and its host every face', '1,2,3', (SELECT v FROM ha5_got WHERE k = 'member 3 sees the faces')) AS done \gset rh_
SELECT pg_temp.rh_case('no function asks the rule of one member at a time through its public name (two calls a row): each asks private.*', '',
  (SELECT coalesce(string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosrc ~ '(public\.|[^.a-z_]|^)is_hidden_by\s*\(')) AS done \gset rh_
SELECT pg_temp.rh_case('the member search runs as the house, so the profiles rule leaves its words their indexes', 'true',
  (SELECT p.prosecdef::text FROM pg_proc p WHERE p.oid = 'public.search_members(text, boolean, integer, text, integer)'::regprocedure)) AS done \gset rh_
SELECT pg_temp.rh_case('no function a member or visitor runs as themselves calls the public names (it would be refused)', '',
  (SELECT coalesce(string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private') AND NOT p.prosecdef
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      AND p.prosrc ~ '(public\.|[^.a-z_]|^)(hidden_authors|is_hidden_by)\s*\(')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
