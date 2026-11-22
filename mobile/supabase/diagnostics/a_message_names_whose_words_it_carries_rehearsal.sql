-- ════════════════════════════════════════════════════════════════════════════
-- a_message_names_whose_words_it_carries_rehearsal.sql — 20261120_19. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_message_names_whose_words_it_carries_rehearsal.sql
--
-- 20261120_19 is applied on production (the train of 2026-11-22); this shows it still holds there, and on every sealed copy.
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
CREATE TEMP TABLE hb3c_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON hb3c_ids TO authenticated;

-- ── H-B3.column ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.critique_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.analytics_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.salon_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-B3's column rehearsal · a message names whose words it carries, its writer cannot change it, and the rule reads it (review round 14) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (H-B3.column
-- applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction. Kept short:
-- the car holds lounge_messages until this ends.
-- Member 3 keeps an open salon where 1, 2, 3 and 4 sit. The house lays two messages of 3's there: one
-- naming member 2 as a member whose words it carries, one naming no one. Member 1 blocks 2. Then:
--   1 reads 3's plain message and not the one carrying 2's words; 4 reads both; 3 reads both, their own;
--   3 changes what their own message names: kept as the house wrote it.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members);

WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('The Rehearsal Quoting Room', (SELECT id FROM rehearsal_members WHERE n = 3), false) RETURNING id)
INSERT INTO hb3c_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM hb3c_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM hb3c_ids WHERE what = 'salon'), id, 'approved' FROM rehearsal_members;
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
              VALUES ((SELECT id FROM hb3c_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh plain words')
              RETURNING id)
INSERT INTO hb3c_ids SELECT 'plain', id FROM made;
WITH made AS (INSERT INTO public.lounge_messages (lounge_id, user_id, content)
              VALUES ((SELECT id FROM hb3c_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 3), 'rh carrying words')
              RETURNING id)
INSERT INTO hb3c_ids SELECT 'carrying', id FROM made;
-- As the house writes it (H-B3.up.sql names it when a message is sent).
UPDATE public.lounge_messages SET carries_words_of = ARRAY[(SELECT id FROM rehearsal_members WHERE n = 2)]
 WHERE id = (SELECT id FROM hb3c_ids WHERE what = 'carrying');
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'block');

-- One act as a member, as themselves: what it answers, or the refusal's code and words.
CREATE FUNCTION pg_temp.hb3c_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_member), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql INTO v_got;
  EXCEPTION WHEN OTHERS THEN
    v_got := 'refused: ' || SQLSTATE || ' ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN coalesce(nullif(v_got, ''), 'done');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.hb3c_as(bigint, text) TO authenticated;
-- What a member reads of the two: each message's words they are given, in order.
CREATE FUNCTION pg_temp.hb3c_reads(p_member bigint) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.hb3c_as(p_member, format(
    'SELECT coalesce(string_agg(content, '','' ORDER BY content), ''nothing'') FROM public.lounge_messages WHERE id IN (%L, %L)',
    (SELECT id FROM hb3c_ids WHERE what = 'plain'), (SELECT id FROM hb3c_ids WHERE what = 'carrying')));
$$;

SELECT pg_temp.hb3c_as(3, format('UPDATE public.lounge_messages SET carries_words_of = NULL WHERE id = %L RETURNING id::text',
  (SELECT id FROM hb3c_ids WHERE what = 'carrying'))) AS changed \gset hb3c_

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a message names whose words it carries, a list of members that may be empty', 'ARRAY|YES',
    (SELECT data_type || '|' || is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lounge_messages' AND column_name = 'carries_words_of'));
  PERFORM pg_temp.rh_case('a member who blocked 2 reads 3''s plain words and not those carrying 2''s', 'rh plain words',
    pg_temp.hb3c_reads(1));
  PERFORM pg_temp.rh_case('a member who hid no one reads both', 'rh carrying words,rh plain words',
    pg_temp.hb3c_reads(4));
  PERFORM pg_temp.rh_case('the writer reads both, their own', 'rh carrying words,rh plain words',
    pg_temp.hb3c_reads(3));
  PERFORM pg_temp.rh_case('the writer cannot change whom their message names', (SELECT id FROM rehearsal_members WHERE n = 2)::text,
    (SELECT array_to_string(carries_words_of, ',') FROM public.lounge_messages WHERE id = (SELECT id FROM hb3c_ids WHERE what = 'carrying')));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
