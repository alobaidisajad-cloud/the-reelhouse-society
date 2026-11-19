-- ════════════════════════════════════════════════════════════════════════════
-- a_sealed_stack_takes_its_cards_rehearsal.sql — 20261119_21. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_sealed_stack_takes_its_cards_rehearsal.sql --with-train
--
-- The train applies 20261119_21 here (with_train), 20261119_00 to 20261119_20 already applied; a sealed copy already holds it.
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

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE b3_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON b3_ids TO authenticated;
CREATE TEMP TABLE b3_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
-- 20261119_21 is applied on production (the train of 2026-11-19); this shows it still holds there.

-- ── B3.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B3's triggers rehearsal · a sealed stack is never shown in a salon (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (B3.up and
-- B3.locks applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Members 1 and 2 hold the Archivist's rank for the run and sit in a salon of 1's. 1 keeps an open
-- stack of two reels and shares it there, as themselves, as the phone sends a card. Then:
--   1 seals it: the card in the salon turns sealed, its title, count, curator and posters gone;
--   1 shares the sealed stack: refused (STACK_SEALED); 2 shares a stack no longer in the house:
--   refused (STACK_GONE); 2's plain word in the salon goes through, as before;
--   1 opens it again: the card is made again from the stack as it stands (its new title, its count,
--   its curator, its posters in order), and 2 may share it again.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2));

WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('The Rehearsal Screening Room', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO b3_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM b3_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM b3_ids WHERE what = 'salon'), id, 'approved' FROM rehearsal_members WHERE n IN (1, 2);
WITH made AS (INSERT INTO public.lists (user_id, title, is_private)
              VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh the open stack', false) RETURNING id)
INSERT INTO b3_ids SELECT 'stack', id FROM made;
INSERT INTO public.list_items (list_id, film_id, film_title, rank_position, poster_path)
VALUES ((SELECT id FROM b3_ids WHERE what = 'stack'), 990000301, 'rh first reel', 1, '/rh-first.jpg'),
       ((SELECT id FROM b3_ids WHERE what = 'stack'), 990000302, 'rh second reel', 2, '/rh-second.jpg');
INSERT INTO b3_ids VALUES ('gone stack', gen_random_uuid());

-- One act as a member, as themselves: what it answers, or the refusal's code and words.
CREATE FUNCTION pg_temp.b3_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
GRANT EXECUTE ON FUNCTION pg_temp.b3_as(bigint, text) TO authenticated;
-- A stack's card, as the phone sends it (ShareToLoungeModal), from a member into the salon.
CREATE FUNCTION pg_temp.b3_share(p_member bigint, p_stack text, p_title text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.b3_as(p_member, format(
    'INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, metadata) VALUES (%L, %L, %L, ''list_share'', %L) RETURNING id::text',
    (SELECT id FROM b3_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = p_member), '',
    jsonb_build_object('listId', (SELECT id FROM b3_ids WHERE what = p_stack)::text, 'title', p_title, 'filmCount', 2,
                       'curator', 'rh', 'topPosters', jsonb_build_array('/rh-first.jpg', '/rh-second.jpg'))));
$$;
-- What the salon's member 2 reads on a card.
CREATE FUNCTION pg_temp.b3_card(p_id text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.b3_as(2, format('SELECT metadata::text FROM public.lounge_messages WHERE id = %L', p_id));
$$;

INSERT INTO b3_seen VALUES ('shared while open', pg_temp.b3_share(1, 'stack', 'rh the open stack'));
INSERT INTO b3_seen VALUES ('read while open', pg_temp.b3_card((SELECT got FROM b3_seen WHERE what = 'shared while open')));
INSERT INTO b3_seen VALUES ('sealed', pg_temp.b3_as(1, format('UPDATE public.lists SET is_private = true WHERE id = %L RETURNING is_private::text', (SELECT id FROM b3_ids WHERE what = 'stack'))));
INSERT INTO b3_seen VALUES ('read once sealed', pg_temp.b3_card((SELECT got FROM b3_seen WHERE what = 'shared while open')));
INSERT INTO b3_seen VALUES ('shared while sealed', pg_temp.b3_share(1, 'stack', 'rh the open stack'));
INSERT INTO b3_seen VALUES ('a stack gone shared', pg_temp.b3_share(2, 'gone stack', 'rh nothing'));
INSERT INTO b3_seen VALUES ('a plain word', pg_temp.b3_as(2, format(
  'INSERT INTO public.lounge_messages (lounge_id, user_id, content) VALUES (%L, %L, ''rh a plain word'') RETURNING ''sent''',
  (SELECT id FROM b3_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 2))));
INSERT INTO b3_seen VALUES ('renamed while sealed', pg_temp.b3_as(1, format('UPDATE public.lists SET title = ''rh the stack renamed'' WHERE id = %L RETURNING title', (SELECT id FROM b3_ids WHERE what = 'stack'))));
INSERT INTO b3_seen VALUES ('opened again', pg_temp.b3_as(1, format('UPDATE public.lists SET is_private = false WHERE id = %L RETURNING is_private::text', (SELECT id FROM b3_ids WHERE what = 'stack'))));
INSERT INTO b3_seen VALUES ('read once opened', pg_temp.b3_card((SELECT got FROM b3_seen WHERE what = 'shared while open')));
INSERT INTO b3_seen VALUES ('shared once opened', pg_temp.b3_share(2, 'stack', 'rh the stack renamed'));

DO $$
DECLARE
  v_open   jsonb := (SELECT got FROM b3_seen WHERE what = 'read while open')::jsonb;
  v_sealed jsonb := (SELECT got FROM b3_seen WHERE what = 'read once sealed')::jsonb;
  v_back   jsonb := (SELECT got FROM b3_seen WHERE what = 'read once opened')::jsonb;
  v_stack  text  := (SELECT id FROM b3_ids WHERE what = 'stack')::text;
BEGIN
  PERFORM pg_temp.rh_case('an open stack is shared into a salon, as before', 'true',
    ((SELECT got FROM b3_seen WHERE what = 'shared while open') ~ '^[0-9a-f-]{36}$')::text);
  PERFORM pg_temp.rh_case('and its card is read whole', 'rh the open stack', v_open ->> 'title');
  PERFORM pg_temp.rh_case('the curator seals it', 'true', (SELECT got FROM b3_seen WHERE what = 'sealed'));
  PERFORM pg_temp.rh_case('sealed, its card says only that, and which stack', jsonb_build_object('listId', v_stack, 'sealed', true)::text, v_sealed::text);
  PERFORM pg_temp.rh_case('a sealed stack is not shared, even by its curator', 'refused: 42501 STACK_SEALED',
    (SELECT got FROM b3_seen WHERE what = 'shared while sealed'));
  PERFORM pg_temp.rh_case('a stack no longer in the house is not shared', 'refused: P0002 STACK_GONE',
    (SELECT got FROM b3_seen WHERE what = 'a stack gone shared'));
  PERFORM pg_temp.rh_case('a plain word goes through, as before', 'sent', (SELECT got FROM b3_seen WHERE what = 'a plain word'));
  PERFORM pg_temp.rh_case('the curator renames it while sealed', 'rh the stack renamed', (SELECT got FROM b3_seen WHERE what = 'renamed while sealed'));
  PERFORM pg_temp.rh_case('the curator opens it again', 'false', (SELECT got FROM b3_seen WHERE what = 'opened again'));
  PERFORM pg_temp.rh_case('opened, its card is made again from the stack as it stands',
    'rh the stack renamed|2|["/rh-first.jpg", "/rh-second.jpg"]|false',
    (v_back ->> 'title') || '|' || (v_back ->> 'filmCount') || '|' || (v_back -> 'topPosters')::text || '|' || (v_back ? 'sealed')::text);
  PERFORM pg_temp.rh_case('and names its curator', (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1)),
    v_back ->> 'curator');
  PERFORM pg_temp.rh_case('and it may be shared again', 'true',
    ((SELECT got FROM b3_seen WHERE what = 'shared once opened') ~ '^[0-9a-f-]{36}$')::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
