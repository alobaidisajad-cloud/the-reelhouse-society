-- ════════════════════════════════════════════════════════════════════════════
-- a_salon_is_founded_once_rehearsal.sql — 20261105_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_salon_is_founded_once_rehearsal.sql
--
-- A member founds a salon with the id their form made, and asks again with it
-- (the first answer lost): one room, the founder seated once, the same id
-- back. Another member asking with that id is refused, ranked or not, and an
-- unranked member is still refused a room of their own. An older call (no id)
-- founds as before. A visitor may not found at all. Read each NOTICE as
-- case|expected|got ; the last line is the verdict, and any miss makes psql
-- exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\ir ../../../supabase/migrations/20261105_02_a_salon_is_founded_once.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- a founds; b is ranked too, and asks with a's id; c holds no rank. Ordered by the key, which
-- its index walks in order to the first that fits (a_salon_keeps_its_own_words_rehearsal).
SELECT set_config('rehearsal.a', pg_temp.rh_found('a member',
  (SELECT id FROM public.profiles WHERE role IS DISTINCT FROM 'admin' ORDER BY id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.b', pg_temp.rh_found('a second member',
  (SELECT id FROM public.profiles WHERE role IS DISTINCT FROM 'admin'
      AND id <> current_setting('rehearsal.a')::uuid ORDER BY id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.c', pg_temp.rh_found('a third member',
  (SELECT id FROM public.profiles WHERE role IS DISTINCT FROM 'admin'
      AND id NOT IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid) ORDER BY id LIMIT 1))::text, true) AS done \gset rh_
-- Each set back to a cinephile with no grant and in good standing; a and b then granted the
-- Archivist rank as the house grants one by hand.
UPDATE public.profiles SET tier = 'cinephile', role = 'cinephile', entitlement_source = NULL, is_founding = false,
       is_banned = false, suspended_until = NULL
 WHERE id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid, current_setting('rehearsal.c')::uuid);
DELETE FROM public.rank_grants
 WHERE user_id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid, current_setting('rehearsal.c')::uuid);
SELECT count(*) AS done FROM public.grant_entitlement(current_setting('rehearsal.a')::uuid, 'archivist', 'manual') \gset rh_
SELECT count(*) AS done FROM public.grant_entitlement(current_setting('rehearsal.b')::uuid, 'archivist', 'manual') \gset rh_
SELECT pg_temp.rh_need('two members ranked to found a salon',
  (SELECT count(*) FROM public.profiles
    WHERE id IN (current_setting('rehearsal.a')::uuid, current_setting('rehearsal.b')::uuid)
      AND public.profile_tier_weight(tier, role, is_founding) >= 1), 2) AS done \gset rh_
SELECT set_config('rehearsal.room', gen_random_uuid()::text, true) AS done \gset rh_
SELECT set_config('rehearsal.other', gen_random_uuid()::text, true) AS done \gset rh_

CREATE TEMP TABLE fo_out (k text PRIMARY KEY, got text) ON COMMIT DROP;
GRANT ALL ON fo_out TO anon, authenticated;

-- One ask, as the member named (or a visitor, for none): the id back, or the refusal's code and words.
CREATE FUNCTION pg_temp.fo_ask(p_k text, p_who text, p_call text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE said text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_who IS NULL THEN json_build_object('role', 'anon')::text
         ELSE json_build_object('sub', current_setting('rehearsal.' || p_who), 'role', 'authenticated')::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_who IS NULL THEN 'anon' ELSE 'authenticated' END);
  BEGIN
    EXECUTE 'SELECT (' || p_call || ')::text' INTO said;
  EXCEPTION WHEN OTHERS THEN
    said := SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO fo_out VALUES (p_k, said);
END $$;

SELECT pg_temp.fo_ask('first', 'a', format('public.create_lounge(p_name => %L, p_description => %L, p_is_private => false, p_id => %L)',
  'rh founded once', 'rh', current_setting('rehearsal.room'))) AS done \gset rh_
SELECT pg_temp.fo_ask('again', 'a', format('public.create_lounge(p_name => %L, p_description => %L, p_is_private => false, p_id => %L)',
  'rh founded once', 'rh', current_setting('rehearsal.room'))) AS done \gset rh_
SELECT pg_temp.fo_ask('another ranked', 'b', format('public.create_lounge(p_name => %L, p_description => %L, p_is_private => false, p_id => %L)',
  'rh not yours', 'rh', current_setting('rehearsal.room'))) AS done \gset rh_
SELECT pg_temp.fo_ask('another unranked', 'c', format('public.create_lounge(p_name => %L, p_description => %L, p_is_private => false, p_id => %L)',
  'rh not yours', 'rh', current_setting('rehearsal.room'))) AS done \gset rh_
SELECT pg_temp.fo_ask('unranked, a room of their own', 'c', format('public.create_lounge(p_name => %L, p_description => %L, p_is_private => false, p_id => %L)',
  'rh unranked', 'rh', current_setting('rehearsal.other'))) AS done \gset rh_
SELECT pg_temp.fo_ask('older call', 'a', format('public.create_lounge(p_name => %L, p_description => %L, p_is_private => false)',
  'rh older call', 'rh')) AS done \gset rh_
SELECT pg_temp.fo_ask('visitor', NULL, format('public.create_lounge(p_name => %L, p_description => %L, p_is_private => false, p_id => %L)',
  'rh visitor', 'rh', gen_random_uuid())) AS done \gset rh_

DO $$
DECLARE
  room uuid := current_setting('rehearsal.room')::uuid;
  a uuid := current_setting('rehearsal.a')::uuid;
BEGIN
  PERFORM pg_temp.rh_case('founded with the form''s id, that id comes back', room::text, (SELECT got FROM fo_out WHERE k = 'first'));
  PERFORM pg_temp.rh_case('asked again with it, the same id comes back', room::text, (SELECT got FROM fo_out WHERE k = 'again'));
  PERFORM pg_temp.rh_case('rooms of that name, founded by the member', '1',
    (SELECT count(*)::text FROM public.lounges WHERE creator_id = a AND name = 'rh founded once'));
  PERFORM pg_temp.rh_case('the founder''s seats in it, each admitted', '1|approved',
    (SELECT count(*) || '|' || string_agg(DISTINCT status::text, ',') FROM public.lounge_members WHERE lounge_id = room AND user_id = a));
  PERFORM pg_temp.rh_case('the room as founded: its name, its founder, open', 'rh founded once|true|false',
    (SELECT name || '|' || (creator_id = a) || '|' || is_private FROM public.lounges WHERE id = room));
  PERFORM pg_temp.rh_case('a ranked member asking with another''s room''s id is refused', '42501 That room is another member''s.',
    (SELECT got FROM fo_out WHERE k = 'another ranked'));
  PERFORM pg_temp.rh_case('so is an unranked one', '42501 That room is another member''s.',
    (SELECT got FROM fo_out WHERE k = 'another unranked'));
  PERFORM pg_temp.rh_case('an unranked member is still refused a room of their own', 'refused',
    (SELECT CASE WHEN got ~ '^[0-9a-f]{8}-' THEN 'founded' ELSE 'refused' END FROM fo_out WHERE k = 'unranked, a room of their own'));
  PERFORM pg_temp.rh_case('and none was made', '0',
    (SELECT count(*)::text FROM public.lounges WHERE id = current_setting('rehearsal.other')::uuid));
  PERFORM pg_temp.rh_case('the room still the founder''s alone, after both refusals', '1|1',
    (SELECT count(*) || '|' || (SELECT count(*) FROM public.lounge_members WHERE lounge_id = room) FROM public.lounges WHERE id = room AND creator_id = a));
  PERFORM pg_temp.rh_case('an older call, with no id, founds a room of its own', 'true',
    (SELECT (got ~ '^[0-9a-f]{8}-' AND got <> room::text AND EXISTS (
       SELECT 1 FROM public.lounges WHERE id::text = got AND creator_id = a AND name = 'rh older call'))::text FROM fo_out WHERE k = 'older call'));
  PERFORM pg_temp.rh_case('a visitor founds nothing', 'refused',
    (SELECT CASE WHEN got ~ '^[0-9a-f]{8}-' THEN 'founded' ELSE 'refused' END FROM fo_out WHERE k = 'visitor'));
  PERFORM pg_temp.rh_case('one create_lounge, taking the form''s id', 'create_lounge(p_name text, p_description text, p_is_private boolean, p_id uuid DEFAULT NULL::uuid)',
    (SELECT string_agg(proname || '(' || pg_get_function_arguments(oid) || ')', ';') FROM pg_proc
      WHERE proname = 'create_lounge' AND pronamespace = 'public'::regnamespace));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
