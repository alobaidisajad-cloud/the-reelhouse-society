-- ════════════════════════════════════════════════════════════════════════════
-- a_spoilers_mark_reaches_its_cards_rehearsal.sql — 20261119_22. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_spoilers_mark_reaches_its_cards_rehearsal.sql --with-train
--
-- The train applies 20261119_22 here (with_train), 20261119_00 to 20261119_21 already applied; a sealed copy already holds it.
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
CREATE TEMP TABLE b9_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON b9_ids TO authenticated;
CREATE TEMP TABLE b9_seen (what text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON b9_seen TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_22_a_spoilers_mark_reaches_its_cards.sql
\endif

-- ── B9.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── B9's trigger rehearsal · a take amended to SPOILERS takes its words off its cards (review round 13) ──
-- Run inside the round's rehearsal transaction, after rehearsal_kit.sql and the train (B9 and B9.locks
-- applied), with its rehearsal_members (n = 1..4); every row is undone with the transaction.
-- Member 1 has filed a take on a film (laid by the house, as a filing the app sends); members 1 and 2
-- hold the Archivist's rank for the run and sit in a salon of 1's, where 2 shares the take as a phone
-- before round 13 shared it: titled with its words. Then, as themselves:
--   1 amends the take to SPOILERS: the card is titled "TAKE on <film> · SPOILERS", no word of the take;
--   1 takes the mark off: the card is titled with the take's words again, as they stand;
--   a take with no film is titled "TAKE · SPOILERS"; a word written in the salon is untouched.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
UPDATE public.profiles SET tier = 'archivist', is_banned = false, suspended_until = NULL
 WHERE id IN (SELECT id FROM rehearsal_members WHERE n IN (1, 2));

WITH made AS (INSERT INTO public.lounges (name, creator_id, is_private)
              VALUES ('The Rehearsal Reading Room', (SELECT id FROM rehearsal_members WHERE n = 1), false) RETURNING id)
INSERT INTO b9_ids SELECT 'salon', id FROM made;
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM b9_ids WHERE what = 'salon');
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM b9_ids WHERE what = 'salon'), id, 'approved' FROM rehearsal_members WHERE n IN (1, 2);
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, subject_kind, subject_id, subject_title)
  VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 1),
          (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1)),
          'rh Rosebud is the sled', 'film', 990000901, 'rh Citizen Kane')
  RETURNING id)
INSERT INTO b9_ids SELECT 'take', id FROM made;
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
  VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 1),
          (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1)),
          'rh a take on nothing in particular')
  RETURNING id)
INSERT INTO b9_ids SELECT 'take with no film', id FROM made;

-- One act as a member, as themselves: what it answers, or the refusal's code.
CREATE FUNCTION pg_temp.b9_as(p_member bigint, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
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
GRANT EXECUTE ON FUNCTION pg_temp.b9_as(bigint, text) TO authenticated;
-- 2 shares a filing as a phone before round 13 did: titled with its words.
CREATE FUNCTION pg_temp.b9_share(p_what text, p_title text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.b9_as(2, format(
    'INSERT INTO public.lounge_messages (lounge_id, user_id, content, type, film_title, metadata) VALUES (%L, %L, ''rh look'', ''dossier_share'', %L, %L) RETURNING id::text',
    (SELECT id FROM b9_ids WHERE what = 'salon'), (SELECT id FROM rehearsal_members WHERE n = 2), p_title,
    jsonb_build_object('dossier_id', (SELECT id FROM b9_ids WHERE what = p_what)::text, 'kind', 'take')));
$$;
CREATE FUNCTION pg_temp.b9_mark(p_what text, p_label text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.b9_as(1, format('UPDATE public.dispatch_posts SET spoiler_label = %L WHERE id = %L RETURNING coalesce(spoiler_label, ''unmarked'')',
    p_label, (SELECT id FROM b9_ids WHERE what = p_what)));
$$;
-- What 2 reads on a card: its title and its words.
CREATE FUNCTION pg_temp.b9_card(p_id text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.b9_as(2, format('SELECT coalesce(film_title, ''(none)'') || ''|'' || content FROM public.lounge_messages WHERE id = %L', p_id));
$$;

INSERT INTO b9_seen VALUES ('card', pg_temp.b9_share('take', 'rh Rosebud is the sled'));
INSERT INTO b9_seen VALUES ('card with no film', pg_temp.b9_share('take with no film', 'rh a take on nothing in particular'));
INSERT INTO b9_seen VALUES ('marked', pg_temp.b9_mark('take', 'SPOILERS'));
INSERT INTO b9_seen VALUES ('read marked', pg_temp.b9_card((SELECT got FROM b9_seen WHERE what = 'card')));
INSERT INTO b9_seen VALUES ('marked with no film', pg_temp.b9_mark('take with no film', 'SPOILERS'));
INSERT INTO b9_seen VALUES ('read marked with no film', pg_temp.b9_card((SELECT got FROM b9_seen WHERE what = 'card with no film')));
INSERT INTO b9_seen VALUES ('reworded', pg_temp.b9_as(1, format('UPDATE public.dispatch_posts SET body = ''rh the sled, after all'' WHERE id = %L RETURNING ''done''',
  (SELECT id FROM b9_ids WHERE what = 'take'))));
INSERT INTO b9_seen VALUES ('unmarked', pg_temp.b9_mark('take', NULL));
INSERT INTO b9_seen VALUES ('read unmarked', pg_temp.b9_card((SELECT got FROM b9_seen WHERE what = 'card')));

DO $$ BEGIN
  PERFORM pg_temp.rh_case('a take is shared with its words, as a phone before round 13 shared it', 'true',
    ((SELECT got FROM b9_seen WHERE what = 'card') ~ '^[0-9a-f-]{36}$')::text);
  PERFORM pg_temp.rh_case('its author marks it SPOILERS', 'SPOILERS', (SELECT got FROM b9_seen WHERE what = 'marked'));
  PERFORM pg_temp.rh_case('its card is titled as what it is, with its film and its spoilers, and the sharer''s word stays',
    'TAKE on rh Citizen Kane · SPOILERS|rh look', (SELECT got FROM b9_seen WHERE what = 'read marked'));
  PERFORM pg_temp.rh_case('a take with no film is titled by its kind and its spoilers', 'TAKE · SPOILERS|rh look',
    (SELECT got FROM b9_seen WHERE what = 'read marked with no film'));
  PERFORM pg_temp.rh_case('the mark taken off, the card is titled with the take''s words as they stand', 'rh the sled, after all|rh look',
    (SELECT got FROM b9_seen WHERE what = 'read unmarked'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
