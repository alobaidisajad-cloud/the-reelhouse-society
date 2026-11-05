-- ════════════════════════════════════════════════════════════════════════════
-- a_salons_last_word_rehearsal.sql — 20261104_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_salons_last_word_rehearsal.sql
--
-- 20261104_02 is applied on production; this shows it still holds there, and
-- on every sealed copy (db-integration.yml). The Lounge's directory says when each salon's last word was said. A member
-- asks for three salons they do not sit in: an open one whose newest word is by
-- an author they have blocked (its time is the newest word they may read), a
-- private one, and one where nothing has been said (no answer for it). Only the
-- time comes back. A visitor (not signed in) may not ask at all.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_who (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
INSERT INTO rh_who
SELECT what, pg_temp.rh_found('a member to be ' || what, id)
  FROM (SELECT (ARRAY['the reader', 'a host', 'the blocked'])[row_number() OVER (ORDER BY created_at)] AS what, id
          FROM (SELECT id, created_at FROM public.profiles WHERE role <> 'admin' AND NOT coalesce(is_banned, false) ORDER BY created_at LIMIT 3) p) w;
SELECT pg_temp.rh_need('members to ask and be asked about', (SELECT count(*) FROM rh_who), 3);
CREATE FUNCTION pg_temp.rh_id(p_what text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM rh_who WHERE what = p_what $$;

-- Nothing between the three but the reader's block of one of them.
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rh_who) AND blocked_id IN (SELECT id FROM rh_who);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type) VALUES (pg_temp.rh_id('the reader'), pg_temp.rh_id('the blocked'), 'block');

-- Three salons the host keeps and the reader does not sit in.
CREATE TEMP TABLE rh_room (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('rh open salon', pg_temp.rh_id('a host'), false),
         ('rh private salon', pg_temp.rh_id('a host'), true),
         ('rh quiet salon', pg_temp.rh_id('a host'), false)
  RETURNING id, name)
INSERT INTO rh_room SELECT replace(replace(name, 'rh ', ''), ' salon', ''), id FROM made;
-- Read as each asker, so a refusal is the function's own, never this table's.
GRANT SELECT ON rh_room TO authenticated, anon;
-- The open salon: the host spoke two hours ago, the blocked author an hour ago. The private
-- salon: the host spoke three hours ago. The quiet salon: nothing.
INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at) VALUES
  ((SELECT id FROM rh_room WHERE what = 'open'), pg_temp.rh_id('a host'), 'rh: the host', now() - interval '2 hours'),
  ((SELECT id FROM rh_room WHERE what = 'open'), pg_temp.rh_id('the blocked'), 'rh: the blocked', now() - interval '1 hour'),
  ((SELECT id FROM rh_room WHERE what = 'private'), pg_temp.rh_id('a host'), 'rh: in private', now() - interval '3 hours');

-- The salons' last words as one reader asks (NULL, a visitor): each one's hours ago, or why not.
CREATE FUNCTION pg_temp.rh_last_words_as(p_who uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_who IS NULL THEN '{"role":"anon"}'
    ELSE json_build_object('sub', p_who, 'role', 'authenticated')::text END, true);
  PERFORM set_config('role', CASE WHEN p_who IS NULL THEN 'anon' ELSE 'authenticated' END, true);
  BEGIN
    SELECT coalesce(string_agg(r.what || ':' || round(extract(epoch FROM now() - w.last_message_at) / 3600)::text, ',' ORDER BY r.what), 'none')
      INTO v
      FROM public.get_salon_last_words((SELECT array_agg(id) FROM rh_room)) w
      JOIN rh_room r ON r.id = w.lounge_id;
  EXCEPTION WHEN insufficient_privilege THEN
    v := 'refused';
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

CREATE TEMP TABLE rh_rows (what text PRIMARY KEY, got text) ON COMMIT DROP;
INSERT INTO rh_rows VALUES ('the reader', pg_temp.rh_last_words_as(pg_temp.rh_id('the reader')));
INSERT INTO rh_rows VALUES ('a visitor', pg_temp.rh_last_words_as(NULL));

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.rh_case('a member reads each salon''s last word they may read, and none for a quiet one', 'open:2,private:3',
    (SELECT got FROM rh_rows WHERE what = 'the reader'));
  PERFORM pg_temp.rh_case('a visitor may not ask', 'refused',
    (SELECT got FROM rh_rows WHERE what = 'a visitor'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
