-- ════════════════════════════════════════════════════════════════════════════
-- train_0_rehearsal.sql — 20261015_01 and 20261015_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs train_0_rehearsal.sql
--
-- Both files are applied on production; this shows they still hold there, and
-- on every sealed copy (db-integration.yml):
--   - no function in public can be run by a role with no grant, nor can one
--     made now, while members keep the functions they call;
--   - a salon's channel is read by whoever may read its messages, and a seated
--     member alone shares presence there; nobody sends a broadcast on it;
--   - typing reaches a salon once per member every 2 seconds, from a seated
--     member only, stamped with the sender's own id.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- ── no function open to everyone ──────────────────────────────────────────────
CREATE ROLE rh_nobody NOLOGIN;
CREATE FUNCTION public.rh_made_now() RETURNS integer LANGUAGE sql AS 'SELECT 1';
DO $$ BEGIN
  PERFORM pg_temp.rh_case('no function in public can be run by a role with no grant', '0',
    (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND has_function_privilege('rh_nobody', p.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')));
  PERFORM pg_temp.rh_case('a function made now starts closed to it', 'false',
    has_function_privilege('rh_nobody', 'public.rh_made_now()', 'EXECUTE')::text);
  PERFORM pg_temp.rh_case('a member still opens a salon, joins one and keeps their preferences', 'true',
    (has_function_privilege('authenticated', 'public.create_lounge(text, text, boolean)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.join_public_lounge(uuid)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.update_my_preferences(jsonb)', 'EXECUTE'))::text);
  PERFORM pg_temp.rh_case('a visitor still reads a member''s counts', 'true',
    has_function_privilege('anon', 'public.get_profile_counts(uuid)', 'EXECUTE')::text);
  PERFORM pg_temp.rh_case('a visitor cannot delete a list (it owns none)', 'false',
    has_function_privilege('anon', 'public.delete_list_cascade(uuid)', 'EXECUTE')::text);
END $$;

-- ── a salon's channel ─────────────────────────────────────────────────────────
-- An open salon with a seated member, and a member who holds no seat in it.
SELECT set_config('rehearsal.salon', pg_temp.rh_found('an open salon with a seated member',
  (SELECT l.id FROM public.lounges l WHERE l.is_private = false
     AND EXISTS (SELECT 1 FROM public.lounge_members m WHERE m.lounge_id = l.id AND m.status = 'approved')
   ORDER BY l.created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.seated', pg_temp.rh_found('the salon''s seated member',
  (SELECT m.user_id FROM public.lounge_members m WHERE m.lounge_id = current_setting('rehearsal.salon')::uuid
     AND m.status = 'approved' ORDER BY m.joined_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.outsider', pg_temp.rh_found('a member with no seat in the salon',
  (SELECT p.id FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM public.lounge_members m
     WHERE m.lounge_id = current_setting('rehearsal.salon')::uuid AND m.user_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.lounges l WHERE l.id = current_setting('rehearsal.salon')::uuid AND l.creator_id = p.id)
   ORDER BY p.created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.topic', 'lounge-' || current_setting('rehearsal.salon'), true) AS done \gset rh_

-- One message already on each channel, so a member's read of it can be counted.
INSERT INTO realtime.messages (topic, extension, payload, event, private)
VALUES (current_setting('rehearsal.topic'), 'broadcast', '{}', 'rh_probe', true),
       ('global_notifications', 'broadcast', '{}', 'rh_probe', true);

CREATE FUNCTION pg_temp.rh_as(member text, topic text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting(member), 'role', 'authenticated')::text, true),
         set_config('realtime.topic', topic, true)
$$;
CREATE FUNCTION pg_temp.rh_reads(topic text) RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM realtime.messages WHERE realtime.messages.topic = rh_reads.topic AND event = 'rh_probe'
$$;
-- Sends presence or a broadcast as the current member; 'sent' or 'refused'.
CREATE FUNCTION pg_temp.rh_sends(extension text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO realtime.messages (topic, extension, payload, event, private)
  VALUES (current_setting('realtime.topic'), extension, '{}', 'rh_sent', true);
  RETURN 'sent';
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'refused';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.rh_as(text, text), pg_temp.rh_reads(text), pg_temp.rh_sends(text) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.outsider', current_setting('rehearsal.topic')) AS done \gset rh_
DO $$ BEGIN
  PERFORM pg_temp.rh_case('any signed-in member receives an open salon''s channel', '1', pg_temp.rh_reads(current_setting('realtime.topic')));
  PERFORM pg_temp.rh_case('a member without a seat shares no presence in it', 'refused', pg_temp.rh_sends('presence'));
END $$;
SELECT pg_temp.rh_as('rehearsal.outsider', 'global_notifications') AS done \gset rh_
DO $$ BEGIN
  PERFORM pg_temp.rh_case('a signed-in member receives the notices channel', '1', pg_temp.rh_reads('global_notifications'));
END $$;
RESET ROLE;

-- The same salon, private: made so by the owner, not by the member last played, whom the
-- tier gate would judge.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.lounges SET is_private = true WHERE id = current_setting('rehearsal.salon')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.rh_as('rehearsal.outsider', current_setting('rehearsal.topic')) AS done \gset rh_
DO $$ BEGIN
  PERFORM pg_temp.rh_case('a member without a seat receives nothing of a private salon''s channel', '0',
    pg_temp.rh_reads(current_setting('realtime.topic')));
  PERFORM pg_temp.rh_case('nor does a topic that is no salon''s', 'false', public.salon_channel_readable('lounge-not-a-salon')::text);
  PERFORM pg_temp.rh_case('a member without a seat cannot type into it', 'false',
    public.send_salon_typing(current_setting('rehearsal.salon')::uuid)::text);
END $$;
SELECT pg_temp.rh_as('rehearsal.seated', current_setting('rehearsal.topic')) AS done \gset rh_
DO $$
DECLARE
  sent integer := 0;
BEGIN
  PERFORM pg_temp.rh_case('a seated member receives it', '1', pg_temp.rh_reads(current_setting('realtime.topic')));
  PERFORM pg_temp.rh_case('a seated member shares their presence', 'sent', pg_temp.rh_sends('presence'));
  PERFORM pg_temp.rh_case('a seated member sends no broadcast of their own', 'refused', pg_temp.rh_sends('broadcast'));
  FOR i IN 1..100 LOOP
    IF public.send_salon_typing(current_setting('rehearsal.salon')::uuid) THEN sent := sent + 1; END IF;
  END LOOP;
  PERFORM pg_temp.rh_case('a hundred typing calls in a moment send once', '1', sent::text);
END $$;
RESET ROLE;

DO $$ BEGIN
  PERFORM pg_temp.rh_case('one typing message reached the salon''s channel, stamped with the sender''s id', '1',
    (SELECT count(*)::text FROM realtime.messages WHERE topic = current_setting('rehearsal.topic') AND event = 'typing'
       AND payload ->> 'user_id' = current_setting('rehearsal.seated')));
  PERFORM pg_temp.rh_case('and no other typing reached it', '1',
    (SELECT count(*)::text FROM realtime.messages WHERE topic = current_setting('rehearsal.topic') AND event = 'typing'));
  PERFORM pg_temp.rh_case('no client reads or writes the typing clock', 'false',
    (has_table_privilege('authenticated', 'public.salon_typing_sent', 'SELECT')
     OR has_table_privilege('authenticated', 'public.salon_typing_sent', 'INSERT')
     OR has_table_privilege('anon', 'public.salon_typing_sent', 'SELECT'))::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
