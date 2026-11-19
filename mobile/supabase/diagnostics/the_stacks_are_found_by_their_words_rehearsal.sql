-- ════════════════════════════════════════════════════════════════════════════
-- the_stacks_are_found_by_their_words_rehearsal.sql — 20261119_19. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_stacks_are_found_by_their_words_rehearsal.sql --with-train
--
-- The train applies 20261119_19 here (with_train), 20261119_00 to 20261119_18 already applied; a sealed copy already holds it.
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

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261119_19 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── H-D4 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-D4 rehearsal · the search finds the stacks the phone's own read found, in its order (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (pg_temp.rh_case,
-- rolled back with the rest), with its rehearsal_members (n = 1..4). 2 keeps a public stack and a
-- private one, 3 (a private member, whom 1 does not follow) a public stack described by the words, 4
-- (whom 1 has blocked) a public stack: all hold the words. Each member and a visitor search, as
-- themselves, for the rare words (read by their pieces), for a word many stacks hold, and for two
-- letters (walked), and read the next page after the first stack found: search_stacks answers the
-- same stacks in the same order as the read the phone made through the tables' rules (public, title
-- or description, newest first), and 1 finds 2's public stack, never 2's private one, 3's or 4's.

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interactions
 WHERE type = 'follow' AND user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET is_social_private = (id = (SELECT id FROM rehearsal_members WHERE n = 3))
 WHERE id IN (SELECT id FROM rehearsal_members);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 4), 'block');

CREATE TEMP TABLE hd4_stacks ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.lists (user_id, title, description, is_private, created_at)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), 'The Qhd4 Mirror', 'kept open', false, now() - interval '4 minutes'),
         ((SELECT id FROM rehearsal_members WHERE n = 2), 'The Qhd4 Mirror, kept', NULL, true, now() - interval '3 minutes'),
         ((SELECT id FROM rehearsal_members WHERE n = 3), 'Notes', 'on the qhd4 mirror', false, now() - interval '2 minutes'),
         ((SELECT id FROM rehearsal_members WHERE n = 4), 'Qhd4 Mirror too', NULL, false, now() - interval '1 minute')
  RETURNING id, user_id, is_private)
SELECT * FROM made;
GRANT SELECT ON hd4_stacks TO anon, authenticated;
CREATE TEMP TABLE hd4_who ON COMMIT DROP AS SELECT id, n FROM rehearsal_members;
GRANT SELECT ON hd4_who TO anon, authenticated;

-- As one member (0: a visitor), the search and the phone's own read, for the words after a cursor: 'same', or both.
CREATE FUNCTION pg_temp.hd4_both(p_member bigint, p_words text, p_at timestamptz DEFAULT NULL, p_id uuid DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE searched text; read text;
BEGIN
  IF p_member = 0 THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
  END IF;
  SELECT string_agg(s.id::text, ',' ORDER BY k) INTO searched
    FROM public.search_stacks(p_words, p_at, p_id, 21) WITH ORDINALITY AS s(id, user_id, title, description, is_ranked, created_at, k);
  SELECT string_agg(r.id::text, ',' ORDER BY r.created_at DESC, r.id DESC) INTO read
    FROM (SELECT l.id, l.created_at FROM public.lists l
           WHERE (l.title ILIKE '%' || p_words || '%' OR l.description ILIKE '%' || p_words || '%')
             AND l.is_private = false
             AND (p_at IS NULL OR (l.created_at, l.id) < (p_at, p_id))
           ORDER BY l.created_at DESC, l.id DESC LIMIT 21) r;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN CASE WHEN searched IS NOT DISTINCT FROM read THEN 'same' ELSE coalesce(searched, '-') || ' / ' || coalesce(read, '-') END;
END $$;

-- What member 1 finds of the four stacks, by whose they are.
CREATE FUNCTION pg_temp.hd4_found(p_member bigint, p_words text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT string_agg(m.n::text || CASE WHEN h.is_private THEN 'p' ELSE '' END, ',' ORDER BY m.n, h.is_private) INTO got
    FROM public.search_stacks(p_words, NULL, NULL, 51) s
    JOIN hd4_stacks h ON h.id = s.id
    JOIN hd4_who m ON m.id = h.user_id;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(got, '');
END $$;

SELECT pg_temp.rh_case('member 1 finds 2''s public stack, never 2''s private one, the private member''s or the blocked one''s', '2',
  pg_temp.hd4_found(1, 'qhd4 mirror')) AS done \gset rh_
SELECT pg_temp.rh_case('the private member finds their own stack by its description, 2''s, and 4''s (whom only 1 blocked)', '2,3,4',
  pg_temp.hd4_found(3, 'qhd4 mirror')) AS done \gset rh_
SELECT count(*) AS done FROM (
  SELECT pg_temp.rh_case(format('as %s, "%s" finds what the phone''s own read found, in its order', who, words), 'same',
           pg_temp.hd4_both(n, words))
    FROM (VALUES (0, 'visitor'), (1, 'member 1'), (2, 'member 2'), (3, 'member 3'), (4, 'member 4')) AS a(n, who),
         (VALUES ('qhd4 mirror'), ('mirror'), ('st'), ('qh')) AS w(words)) c \gset rh_
SELECT pg_temp.rh_case('and its next page, after the first stack found', 'same',
  pg_temp.hd4_both(3, 'qhd4 mirror',
    (SELECT l.created_at FROM public.lists l WHERE l.id = (SELECT id FROM hd4_stacks WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 3))),
    (SELECT id FROM hd4_stacks WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 3)))) AS done \gset rh_
SELECT pg_temp.rh_case('nothing searched finds nothing', '0',
  (SELECT count(*)::text FROM public.search_stacks('', NULL, NULL, 21))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
