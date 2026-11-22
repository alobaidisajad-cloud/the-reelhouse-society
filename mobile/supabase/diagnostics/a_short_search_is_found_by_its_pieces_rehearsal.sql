-- ════════════════════════════════════════════════════════════════════════════
-- a_short_search_is_found_by_its_pieces_rehearsal.sql — 20261122_15. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_short_search_is_found_by_its_pieces_rehearsal.sql --with-train
--
-- The train applies 20261122_15 here (with_train), every car before it already applied (the indexes of
-- 20261122_13 and _14 among them); a sealed copy already holds it. On rows it plants, as a member
-- searching: a pair of letters (9q) no other planted row holds, in a stack's title, in another's description, in a
-- member's handle and in another's name, and one letter of the same kind, found by search_stacks,
-- search_members and the Reel's stack search; a private stack never; each answered after the car as
-- before it (before is read first, with_train). Every row here is undone with the transaction. Read each
-- NOTICE as  case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 3;
SELECT pg_temp.rh_need('three members in good standing', (SELECT count(*) FROM rehearsal_members), 3) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);

-- Member 1 holds 9q in their handle and member 2 in their name; member 1 keeps three stacks: 9q in an open
-- one's title, in another open one's description, and in a private one's title; ǁ alone is in member 3's
-- name and in nothing else of the house's. (A handle holds lowercase letters, digits and underscores;
-- md5's letters stop at f, so no other planted piece holds the q.)
UPDATE public.profiles SET is_social_private = false WHERE id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET username = 'rh_9q_' || substr(md5(id::text), 1, 6) WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);
UPDATE public.profiles SET display_name = 'Rh 9q' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2);
UPDATE public.profiles SET display_name = 'Rh ǁ' WHERE id = (SELECT id FROM rehearsal_members WHERE n = 3);
CREATE TEMP TABLE ssp_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ssp_ids TO anon, authenticated;
INSERT INTO ssp_ids SELECT w, gen_random_uuid() FROM unnest(ARRAY['title', 'description', 'private']) w;
INSERT INTO public.lists (id, user_id, title, description, is_private)
SELECT s.id, (SELECT id FROM rehearsal_members WHERE n = 1),
       CASE s.what WHEN 'description' THEN 'rh plain' ELSE 'rh 9q' END,
       CASE s.what WHEN 'description' THEN 'Holds 9q.' ELSE 'rh' END, s.what = 'private'
  FROM ssp_ids s;

-- What member 3 finds: stacks (search_stacks), members (search_members, by name and by handle), and the
-- Reel's stacks (by title or handle), for the pair and for the one letter.
CREATE FUNCTION pg_temp.ssp_finds() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT jsonb_build_object(
    'stacks', (SELECT string_agg(s.what, ',' ORDER BY s.what) FROM public.search_stacks('9q', NULL, NULL, 21) f JOIN ssp_ids s ON s.id = f.id),
    'members', (SELECT string_agg(m.n::text, ',' ORDER BY m.n) FROM public.search_members('9q', false, NULL, NULL, 21) f JOIN rehearsal_members m ON m.id = f.id),
    'handles', (SELECT string_agg(m.n::text, ',' ORDER BY m.n) FROM public.search_members('9q', true, NULL, NULL, 21) f JOIN rehearsal_members m ON m.id = f.id),
    'one letter', (SELECT string_agg(m.n::text, ',' ORDER BY m.n) FROM public.search_members('ǁ', false, NULL, NULL, 21) f JOIN rehearsal_members m ON m.id = f.id),
    'reel', (SELECT string_agg(s.what, ',' ORDER BY s.what) FROM public.get_filtered_stacks_auth_cursor_v2('9q', false, 60) f JOIN ssp_ids s ON s.id = f.id)) INTO v;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;
CREATE TEMP TABLE ssp_before ON COMMIT DROP AS SELECT pg_temp.ssp_finds() AS r;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_15_a_short_search_is_found_by_its_pieces.sql
\endif
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE ssp_after ON COMMIT DROP AS SELECT pg_temp.ssp_finds() AS r;

SELECT pg_temp.rh_case('a pair of letters finds the open stacks holding it, in a title or a description, never the private one', 'description,title',
  (SELECT r ->> 'stacks' FROM ssp_after)) AS done \gset rh_
SELECT pg_temp.rh_case('and the members holding it, in a handle or a name; by handles alone, the handle', '1,2|1',
  (SELECT (r ->> 'members') || '|' || (r ->> 'handles') FROM ssp_after)) AS done \gset rh_
SELECT pg_temp.rh_case('one letter finds the member holding it', '3',
  (SELECT r ->> 'one letter' FROM ssp_after)) AS done \gset rh_
SELECT pg_temp.rh_case('the Reel finds a stack by its title and by its author''s handle', 'description,title',
  (SELECT r ->> 'reel' FROM ssp_after)) AS done \gset rh_
SELECT pg_temp.rh_case('every search answers after the car as it did before it', 'true',
  ((SELECT r FROM ssp_after) = (SELECT r FROM ssp_before))::text) AS done \gset rh_
SELECT pg_temp.rh_case('the stacks and the members are analysed with the indexes of their pieces', 'true',
  (EXISTS (SELECT 1 FROM pg_stats WHERE schemaname = 'public' AND tablename = 'lists_short_grams')
   AND EXISTS (SELECT 1 FROM pg_stats WHERE schemaname = 'public' AND tablename = 'profiles_short_grams'))::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
