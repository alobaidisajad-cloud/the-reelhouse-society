-- ════════════════════════════════════════════════════════════════════════════
-- a_block_closes_a_file_rehearsal.sql — 20261120_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_block_closes_a_file_rehearsal.sql
--
-- 20261120_03 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE ha2_salon (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ha2_salon TO anon, authenticated;
CREATE TEMP TABLE ha2_got (who text, k text, v text, PRIMARY KEY (who, k)) ON COMMIT DROP;
GRANT ALL ON ha2_got TO anon, authenticated;
CREATE TEMP TABLE ha2f_got (who text, k text, v text, PRIMARY KEY (who, k)) ON COMMIT DROP;
GRANT ALL ON ha2f_got TO anon, authenticated;

-- ── H-A2 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-A2 rehearsal · a file is closed across a block, and open as before everywhere else (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). Member 1 is an open member given a
-- film on their Watchlist, one in their Vault and one logged (beside any they held), who follows member 3 and is followed by
-- member 3, and then blocks member 2. Member 4 is private, followed by member 3.
-- As member 2 (blocked): member 1's file is closed (can_view_user_data false); member 1's Watchlist and
-- Vault read nothing; every count of member 1 is 0, the follows' too; the statistics, the fingerprint,
-- the honours and the match each answer 'forbidden'; a row between member 1 and member 3 is not open.
-- As member 1 (the blocker) the same of member 2. As member 1, their own file is whole. As member 3 (no
-- block) member 1's file reads as before: the rows, the counts, every figure; and member 4's private
-- file is open to their follower, closed to member 2 (no follow), as before. A visitor reads member 1's
-- open file as before. Neither test may be asked directly: public.can_view_user_data is the house's alone,
-- and both tests live in private, which the API never serves.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- The blocks that stood when the car ran took each one's seat in the other's salons.
SELECT pg_temp.rh_case('no member sits in a salon of a member a block stands between them and', '0',
  (SELECT count(*)::text FROM public.lounge_members m
     JOIN public.lounges l ON l.id = m.lounge_id
     JOIN public.user_blocks b ON b.type = 'block'
      AND ((m.user_id = b.blocked_id AND l.creator_id = b.blocker_id) OR (m.user_id = b.blocker_id AND l.creator_id = b.blocked_id))
    WHERE m.status IN ('approved', 'muted', 'pending'))) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
-- Salons, before the block: member 1's (members 2 and 3 seated), two of member 2's (member 1 seated in
-- one, banned from the other), and member 3's (members 1 and 2 seated).
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2, 3));
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh H-A2 of 1', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO ha2_salon SELECT 'of 1', id FROM made;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh H-A2 of 2', (SELECT id FROM rehearsal_members WHERE n = 2), false) RETURNING id)
INSERT INTO ha2_salon SELECT 'of 2', id FROM made;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh H-A2 of 2, banned', (SELECT id FROM rehearsal_members WHERE n = 2), false) RETURNING id)
INSERT INTO ha2_salon SELECT 'of 2, banned', id FROM made;
WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('rh H-A2 of 3', (SELECT id FROM rehearsal_members WHERE n = 3), false) RETURNING id)
INSERT INTO ha2_salon SELECT 'of 3', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id IN (SELECT id FROM ha2_salon);
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT s.id, m.id, x.status
  FROM (VALUES ('of 1', 2, 'approved'), ('of 1', 3, 'approved'), ('of 2', 1, 'approved'),
               ('of 2, banned', 1, 'banned'), ('of 3', 1, 'approved'), ('of 3', 2, 'approved')) x(salon, n, status)
  JOIN ha2_salon s ON s.what = x.salon
  JOIN rehearsal_members m ON m.n = x.n;
DELETE FROM public.interactions
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = false WHERE id IN (SELECT id FROM rehearsal_members);
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3), 'follow'),
       ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 1), 'follow'),
       ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rehearsal_members WHERE n = 4), 'follow');
-- Member 4 turns private after member 3 followed them (a follow asked of a private member is a request).
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
-- Member 1 is borrowed from the house and may already hold films (the house's first members hold many):
-- what each reader sees of member 1's file before the planted rows, so each reads exactly one more after.
CREATE TEMP TABLE ha2_before (who text, k text, v bigint, PRIMARY KEY (who, k)) ON COMMIT DROP;
GRANT ALL ON ha2_before TO anon, authenticated;
CREATE FUNCTION pg_temp.ha2_seen(p_who text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_of uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
BEGIN
  INSERT INTO ha2_before VALUES
    (p_who, 'watchlist', (SELECT count(*) FROM public.watchlists WHERE user_id = v_of)),
    (p_who, 'vault', (SELECT count(*) FROM public.physical_archive WHERE user_id = v_of)),
    (p_who, 'logs', (SELECT count(*) FROM public.logs WHERE user_id = v_of));
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ha2_seen(text) TO anon, authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2_seen('self');
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2_seen('bystander of 1');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) AS done \gset rh_
SELECT pg_temp.ha2_seen('visitor of 1');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO public.watchlists (user_id, film_id, film_title)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990690, 'rh H-A2 watchlist film');
INSERT INTO public.physical_archive (user_id, film_id, film_title)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990691, 'rh H-A2 vault film');
INSERT INTO public.logs (user_id, film_id, film_title, watched_date, rating)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990692, 'rh H-A2 logged film', '2026-01-02', 4);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'block');

-- What each reader is answered: (reader, question, answer).
CREATE FUNCTION pg_temp.ha2_ask(p_who text, p_of integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_of uuid := (SELECT id FROM rehearsal_members WHERE n = p_of);
  v_three uuid := (SELECT id FROM rehearsal_members WHERE n = 3);
BEGIN
  INSERT INTO ha2_got VALUES
    (p_who, 'open', private.can_view_user_data(v_of)::text),
    (p_who, 'watchlist', (SELECT count(*) FROM public.watchlists WHERE user_id = v_of)::text),
    (p_who, 'vault', (SELECT count(*) FROM public.physical_archive WHERE user_id = v_of)::text),
    (p_who, 'logs', (SELECT count(*) FROM public.logs WHERE user_id = v_of)::text),
    (p_who, 'counts', public.get_profile_counts(v_of)::text),
    (p_who, 'analytics', coalesce(public.get_user_analytics(v_of) ->> 'error', 'answered')),
    (p_who, 'taste', coalesce(public.get_taste_profile(v_of) ->> 'error', 'answered')),
    (p_who, 'honours', coalesce(public.get_public_profile_analytics(v_of) ->> 'error', 'answered')),
    (p_who, 'match', coalesce(public.get_taste_match(v_of) ->> 'error', 'answered')),
    (p_who, 'row with 3', private.no_block_stands_with(v_of, v_three)::text);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ha2_ask(text, integer) TO anon, authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2_ask('blocked of 1', 1);
INSERT INTO ha2_got VALUES ('blocked of 4', 'open', private.can_view_user_data((SELECT id FROM rehearsal_members WHERE n = 4))::text);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2_ask('blocker of 2', 2);
SELECT pg_temp.ha2_ask('self', 1);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2_ask('bystander of 1', 1);
INSERT INTO ha2_got VALUES ('follower of 4', 'open', private.can_view_user_data((SELECT id FROM rehearsal_members WHERE n = 4))::text);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) AS done \gset rh_
INSERT INTO ha2_got VALUES
  ('visitor of 1', 'open', private.can_view_user_data((SELECT id FROM rehearsal_members WHERE n = 1))::text),
  ('visitor of 1', 'watchlist', (SELECT count(*) FROM public.watchlists WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1))::text),
  ('visitor of 1', 'row with 3', private.no_block_stands_with((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3))::text);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE FUNCTION pg_temp.ha2(p_who text, p_k text) RETURNS text LANGUAGE sql AS $$ SELECT v FROM ha2_got WHERE who = p_who AND k = p_k $$;
-- What a reader saw of member 1 before, and one more: the row planted.
CREATE FUNCTION pg_temp.ha2_one_more(p_who text, p_k text) RETURNS text LANGUAGE sql AS $$ SELECT (v + 1)::text FROM ha2_before WHERE who = p_who AND k = p_k $$;
CREATE FUNCTION pg_temp.ha2_count(p_who text, p_k text) RETURNS text LANGUAGE sql AS $$ SELECT pg_temp.ha2(p_who, 'counts')::json ->> p_k $$;

-- Across a block, member 2 reads member 1's file as a stranger reads a private one.
SELECT pg_temp.rh_case('across a block the file is closed', 'false', pg_temp.ha2('blocked of 1', 'open')) AS done \gset rh_
SELECT pg_temp.rh_case('the Watchlist reads nothing', '0', pg_temp.ha2('blocked of 1', 'watchlist')) AS done \gset rh_
SELECT pg_temp.rh_case('the Vault reads nothing', '0', pg_temp.ha2('blocked of 1', 'vault')) AS done \gset rh_
SELECT pg_temp.rh_case('the logs read nothing, as round 10 made them', '0', pg_temp.ha2('blocked of 1', 'logs')) AS done \gset rh_
SELECT pg_temp.rh_case('every count is 0, the follows'' too', '0,0,0,0,0,0,0',
  (SELECT string_agg(pg_temp.ha2_count('blocked of 1', k), ',' ORDER BY k)
     FROM unnest(ARRAY['logs_count', 'ledger_count', 'watchlist_count', 'vault_count', 'lists_count', 'followers_count', 'following_count']) k)) AS done \gset rh_
SELECT pg_temp.rh_case('the statistics answer forbidden', 'forbidden', pg_temp.ha2('blocked of 1', 'analytics')) AS done \gset rh_
SELECT pg_temp.rh_case('the fingerprint answers forbidden', 'forbidden', pg_temp.ha2('blocked of 1', 'taste')) AS done \gset rh_
SELECT pg_temp.rh_case('the honours answer forbidden', 'forbidden', pg_temp.ha2('blocked of 1', 'honours')) AS done \gset rh_
SELECT pg_temp.rh_case('the taste match answers forbidden', 'forbidden', pg_temp.ha2('blocked of 1', 'match')) AS done \gset rh_
SELECT pg_temp.rh_case('a block stands between member 2 and member 1, an end of a follow', 'false', pg_temp.ha2('blocked of 1', 'row with 3')) AS done \gset rh_
-- The blocker reads the blocked member's file the same way: a block closes both ways.
SELECT pg_temp.rh_case('the blocker finds the blocked member''s file closed', 'false', pg_temp.ha2('blocker of 2', 'open')) AS done \gset rh_
SELECT pg_temp.rh_case('and its figures forbidden', 'forbidden,forbidden,forbidden,forbidden',
  concat_ws(',', pg_temp.ha2('blocker of 2', 'analytics'), pg_temp.ha2('blocker of 2', 'taste'), pg_temp.ha2('blocker of 2', 'honours'), pg_temp.ha2('blocker of 2', 'match'))) AS done \gset rh_
-- Everywhere else, as before.
SELECT pg_temp.rh_case('a member''s own file is whole', concat_ws(',', 'true', pg_temp.ha2_one_more('self', 'watchlist'), pg_temp.ha2_one_more('self', 'vault'), pg_temp.ha2_one_more('self', 'logs')), concat_ws(',', pg_temp.ha2('self', 'open'), pg_temp.ha2('self', 'watchlist'), pg_temp.ha2('self', 'vault'), pg_temp.ha2('self', 'logs'))) AS done \gset rh_
SELECT pg_temp.rh_case('and every figure of it answered', 'answered,answered,answered',
  concat_ws(',', pg_temp.ha2('self', 'analytics'), pg_temp.ha2('self', 'taste'), pg_temp.ha2('self', 'honours'))) AS done \gset rh_
SELECT pg_temp.rh_case('a member with no block reads the open file',
  concat_ws(',', 'true', pg_temp.ha2_one_more('bystander of 1', 'watchlist'), pg_temp.ha2_one_more('bystander of 1', 'vault'), pg_temp.ha2_one_more('bystander of 1', 'logs')),
  concat_ws(',', pg_temp.ha2('bystander of 1', 'open'), pg_temp.ha2('bystander of 1', 'watchlist'), pg_temp.ha2('bystander of 1', 'vault'), pg_temp.ha2('bystander of 1', 'logs'))) AS done \gset rh_
SELECT pg_temp.rh_case('with its counts', 'true',
  (pg_temp.ha2_count('bystander of 1', 'watchlist_count')::int >= 1 AND pg_temp.ha2_count('bystander of 1', 'vault_count')::int >= 1
   AND pg_temp.ha2_count('bystander of 1', 'logs_count')::int >= 1 AND pg_temp.ha2_count('bystander of 1', 'followers_count')::int >= 1
   AND pg_temp.ha2_count('bystander of 1', 'following_count')::int >= 1)::text) AS done \gset rh_
SELECT pg_temp.rh_case('and every figure answered', 'answered,answered,answered,answered',
  concat_ws(',', pg_temp.ha2('bystander of 1', 'analytics'), pg_temp.ha2('bystander of 1', 'taste'), pg_temp.ha2('bystander of 1', 'honours'), pg_temp.ha2('bystander of 1', 'match'))) AS done \gset rh_
SELECT pg_temp.rh_case('no block stands between member 3 and either end', 'true', pg_temp.ha2('bystander of 1', 'row with 3')) AS done \gset rh_
SELECT pg_temp.rh_case('a private file is open to its follower', 'true', pg_temp.ha2('follower of 4', 'open')) AS done \gset rh_
SELECT pg_temp.rh_case('and closed to a member who does not follow', 'false', pg_temp.ha2('blocked of 4', 'open')) AS done \gset rh_
SELECT pg_temp.rh_case('a visitor reads the open file', concat_ws(',', 'true', pg_temp.ha2_one_more('visitor of 1', 'watchlist'), 'true'),
  concat_ws(',', pg_temp.ha2('visitor of 1', 'open'), pg_temp.ha2('visitor of 1', 'watchlist'), pg_temp.ha2('visitor of 1', 'row with 3'))) AS done \gset rh_
-- No member or visitor may ask either test directly: the API serves only public, where the one name
-- left is the house's, and asking it is refused.
SELECT pg_temp.rh_case('a member or a visitor may not run public.can_view_user_data', 'false,false',
  concat_ws(',', has_function_privilege('authenticated', 'public.can_view_user_data(uuid)', 'EXECUTE')::text,
                 has_function_privilege('anon', 'public.can_view_user_data(uuid)', 'EXECUTE')::text)) AS done \gset rh_
SELECT pg_temp.rh_case('the house may, and it answers as the test', 'true,true',
  concat_ws(',', has_function_privilege('service_role', 'public.can_view_user_data(uuid)', 'EXECUTE')::text,
                 (SELECT public.can_view_user_data((SELECT id FROM rehearsal_members WHERE n = 1)))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('the tests live in private, which the API never serves; no public block test', 'private,private,none',
  concat_ws(',', (SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.oid = to_regprocedure('private.can_view_user_data(uuid)')),
                 (SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.oid = to_regprocedure('private.no_block_stands_with(uuid, uuid)')),
                 coalesce(to_regprocedure('public.no_block_stands_with(uuid, uuid)')::text, 'none'))) AS done \gset rh_
SELECT pg_temp.rh_case('the Watchlist, Vault and logs rules ask the test where it lives', '3',
  (SELECT count(*)::text FROM pg_policies
    WHERE policyname IN ('watchlists_select_authorized', 'physical_archive_select_authorized', 'logs_select_authorized')
      AND qual LIKE '%private.can_view_user_data%')) AS done \gset rh_

-- The block took each one's seat in the other's salons, both ways; a ban, and every other seat, stand.
SELECT pg_temp.rh_case('the seats after member 1 blocked member 2, salon by salon',
  'of 1:3 approved|of 2, banned:1 banned|of 3:1 approved,2 approved',
  (SELECT string_agg(s.what || ':' || seats, '|' ORDER BY s.what)
     FROM ha2_salon s
     CROSS JOIN LATERAL (SELECT string_agg(r.n || ' ' || m.status, ',' ORDER BY r.n) AS seats
                           FROM public.lounge_members m JOIN rehearsal_members r ON r.id = m.user_id
                          WHERE m.lounge_id = s.id) x
    WHERE x.seats IS NOT NULL)) AS done \gset rh_

-- Who has blocked the caller, for the read rules: member 1 to member 2; no one to member 1 (the one
-- who chose it), to a visitor, or to an admin.
UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 4);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 4), 'block');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ha2_got VALUES ('blocked', 'blocking me', (SELECT coalesce(string_agg(r.n::text, ',' ORDER BY r.n), '') FROM rehearsal_members r WHERE r.id = ANY (private.members_blocking_me())));
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ha2_got VALUES ('blocker', 'blocking me', cardinality(private.members_blocking_me())::text);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO ha2_got VALUES ('admin', 'blocking me', cardinality(private.members_blocking_me())::text);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true) AS done \gset rh_
INSERT INTO ha2_got VALUES ('visitor', 'blocking me', cardinality(private.members_blocking_me())::text);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the member blocked is answered who blocked them, for the read rules', '1', pg_temp.ha2('blocked', 'blocking me')) AS done \gset rh_
SELECT pg_temp.rh_case('the blocker, an admin (blocked too) and a visitor are answered no one', '0,0,0',
  concat_ws(',', pg_temp.ha2('blocker', 'blocking me'), pg_temp.ha2('admin', 'blocking me'), pg_temp.ha2('visitor', 'blocking me'))) AS done \gset rh_
SELECT pg_temp.rh_case('which no member or visitor may ask: it lives in private', 'private',
  (SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.oid = to_regprocedure('private.members_blocking_me()'))) AS done \gset rh_

-- Every figure of the blocker, to the member blocked, is the figure of an id no member holds; the
-- blocker's own figures are as they are with no block. (The rows are the next car's, with its rules.)
DELETE FROM public.user_blocks WHERE blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1)
   AND blocked_id = (SELECT id FROM rehearsal_members WHERE n = 4);
CREATE TEMP TABLE ha2f_nobody ON COMMIT DROP AS SELECT gen_random_uuid() AS id;
GRANT SELECT ON ha2f_nobody TO authenticated;
CREATE FUNCTION pg_temp.ha2f_ask(p_who text, p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ha2f_got VALUES
    (p_who, 'counts', public.get_profile_counts(p_id)::text),
    (p_who, 'analytics', public.get_user_analytics(p_id)::text),
    (p_who, 'taste', public.get_taste_profile(p_id)::text),
    (p_who, 'honours', public.get_public_profile_analytics(p_id)::text),
    (p_who, 'match', public.get_taste_match(p_id)::text),
    (p_who, 'calendar', (SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]') FROM public.calendar_days(p_id) c)::text),
    (p_who, 'dispatch room', (SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]') FROM public.dispatch_room_totals(p_id) d)::text);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ha2f_ask(text, uuid) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2f_ask('blocked of 1', (SELECT id FROM rehearsal_members WHERE n = 1));
SELECT pg_temp.ha2f_ask('blocked of no one', (SELECT id FROM ha2f_nobody));
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2f_ask('self, blocked', (SELECT id FROM rehearsal_members WHERE n = 1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks WHERE blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1)
   AND blocked_id = (SELECT id FROM rehearsal_members WHERE n = 2);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.ha2f_ask('self, unblocked', (SELECT id FROM rehearsal_members WHERE n = 1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE FUNCTION pg_temp.ha2f(p_who text, p_k text) RETURNS text LANGUAGE sql AS $$ SELECT v FROM ha2f_got WHERE who = p_who AND k = p_k $$;
SELECT count(pg_temp.rh_case('to the member blocked, the ' || k || ' of the blocker is that of no one',
  pg_temp.ha2f('blocked of no one', k), pg_temp.ha2f('blocked of 1', k)))
  FROM unnest(ARRAY['counts', 'analytics', 'taste', 'honours', 'match', 'calendar', 'dispatch room']) k \gset rh_
SELECT count(pg_temp.rh_case('the blocker''s own ' || k || ' is as it is with no block', pg_temp.ha2f('self, unblocked', k), pg_temp.ha2f('self, blocked', k)))
  FROM unnest(ARRAY['counts', 'analytics', 'taste', 'honours', 'calendar', 'dispatch room']) k \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
