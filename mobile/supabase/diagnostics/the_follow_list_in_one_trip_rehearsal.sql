-- ════════════════════════════════════════════════════════════════════════════
-- the_follow_list_in_one_trip_rehearsal.sql — 20261122_09. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_follow_list_in_one_trip_rehearsal.sql --with-train
--
-- The train applies 20261122_09 here (with_train), every car before it already applied; a sealed copy already holds it.
-- Then members, acting as themselves, read their follow lists in one trip: the same handles, in the
-- same order, as the pages the phone read before, their own and no one else's (stage C, the kinds
-- pass). A borrowed member may already follow others: each case counts only what it planted, or
-- holds the trip to the pages' own answer. Every row here is undone with the transaction. Read each
-- NOTICE as case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, p.username, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   ORDER BY u.created_at LIMIT 4;
SELECT pg_temp.rh_need('members', (SELECT count(*) FROM rehearsal_members), 4) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_09_the_follow_list_in_one_trip.sql
\endif

-- ── the setting, as the house ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Member 1 follows member 2 and member 4 (in that order) and has asked to follow member 3; no block
-- between them. Whatever else member 1 follows stays as the house holds it.
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = false WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (2, 4));
DELETE FROM public.interactions WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
   AND target_user_id IN (SELECT id FROM rehearsal_members) AND type IN ('follow', 'follow_request');
INSERT INTO public.interactions (id, user_id, target_user_id, type, created_at) VALUES
  (gen_random_uuid(), (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'follow', now() + interval '1 second'),
  (gen_random_uuid(), (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 4), 'follow', now() + interval '2 seconds'),
  (gen_random_uuid(), (SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 3), 'follow_request', now() + interval '3 seconds');

-- A member's follow list as the one trip answers it, and as the old pages read it, each as the member.
CREATE FUNCTION pg_temp.fl_read(p_n bigint, p_trip boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_n), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF p_trip THEN
    v := public.get_my_follows();
  ELSE
    SELECT jsonb_build_object(
      'following', COALESCE(jsonb_agg(p.username ORDER BY i.created_at, i.id) FILTER (WHERE i.type = 'follow'), '[]'::jsonb),
      'requested', COALESCE(jsonb_agg(p.username ORDER BY i.created_at, i.id) FILTER (WHERE i.type = 'follow_request'), '[]'::jsonb))
      INTO v
      FROM public.interactions i JOIN public.profiles p ON p.id = i.target_user_id
     WHERE i.user_id = (SELECT id FROM rehearsal_members WHERE n = p_n) AND i.type IN ('follow', 'follow_request');
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

-- The handles of the planted members in one list of the trip, in the order the trip gives them.
CREATE FUNCTION pg_temp.fl_planted(p_list jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(m.n::text, ',' ORDER BY e.k), '')
    FROM jsonb_array_elements_text(p_list) WITH ORDINALITY AS e(handle, k)
    JOIN rehearsal_members m ON m.username = e.handle;
$$;

SELECT pg_temp.rh_case('the trip answers the follow list as the pages read it, every handle in the same order', 'true',
  (pg_temp.fl_read(1, true) = pg_temp.fl_read(1, false))::text) AS done \gset rh_
SELECT pg_temp.rh_case('the members followed, in the order followed', '2,4', pg_temp.fl_planted(pg_temp.fl_read(1, true) -> 'following')) AS done \gset rh_
SELECT pg_temp.rh_case('the member asked to follow, among the requests alone', '3', pg_temp.fl_planted(pg_temp.fl_read(1, true) -> 'requested')) AS done \gset rh_
SELECT pg_temp.rh_case('another member''s trip holds none of member 1''s follows', '', pg_temp.fl_planted(pg_temp.fl_read(2, true) -> 'requested')) AS done \gset rh_
SELECT pg_temp.rh_case('another member''s trip answers as their own pages read it', 'true',
  (pg_temp.fl_read(2, true) = pg_temp.fl_read(2, false))::text) AS done \gset rh_

-- A visitor has no list to ask for.
CREATE FUNCTION pg_temp.fl_visitor() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('role', 'anon', true);
  PERFORM public.get_my_follows();
  PERFORM set_config('role', 'none', true);
  RETURN 'answered';
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM set_config('role', 'none', true);
  RETURN 'refused';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.fl_visitor() TO anon;
SELECT pg_temp.rh_case('a visitor is refused the list', 'refused', pg_temp.fl_visitor()) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
