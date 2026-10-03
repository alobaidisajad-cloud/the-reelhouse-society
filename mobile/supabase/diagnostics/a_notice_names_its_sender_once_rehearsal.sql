-- ════════════════════════════════════════════════════════════════════════════
-- a_notice_names_its_sender_once_rehearsal.sql — 20261003_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_notice_names_its_sender_once_rehearsal.sql
--
-- A follow notice is written the old way, then the fix runs, then a member of
-- Archivist rank asks to enter a private salon. Without with_fix the request
-- names them twice, the old notice keeps its copy, and a writer may still do
-- it: the rehearsal says no. Read each NOTICE as  case | expected | got.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

-- A host, and a guest whose rank opens the Lounge and who is free to ask.
SELECT set_config('rehearsal.host', (SELECT id::text FROM public.profiles ORDER BY created_at LIMIT 1), true) AS done \gset rh_
SELECT set_config('rehearsal.guest', (
  SELECT id::text FROM public.profiles
   WHERE id::text <> current_setting('rehearsal.host')
     AND public.profile_tier_weight(tier, role, is_founding) >= 1
     AND NOT coalesce(is_banned, false)
     AND (suspended_until IS NULL OR suspended_until <= now())
   ORDER BY created_at LIMIT 1), true) AS done \gset rh_
SELECT set_config('rehearsal.guest_name', (SELECT username FROM public.profiles WHERE id = current_setting('rehearsal.guest')::uuid), true) AS done \gset rh_

-- Written the old way, before the fix.
CREATE TEMP TABLE nn_old ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
  VALUES (current_setting('rehearsal.host')::uuid, 'follow', current_setting('rehearsal.guest_name'),
          current_setting('rehearsal.guest')::uuid, '@' || upper(current_setting('rehearsal.guest_name')) || ' is now following you.')
  RETURNING id)
SELECT id FROM made;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261003_02_a_notice_names_its_sender_once.sql
\endif

CREATE TEMP TABLE nn_lounge ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('The Rehearsal Salon', current_setting('rehearsal.host')::uuid, true)
  RETURNING id)
SELECT id FROM made;
GRANT SELECT ON nn_lounge TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.guest'), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.request_lounge_membership((SELECT id FROM nn_lounge)) AS done \gset rh_
RESET ROLE;

-- A writer that names the sender twice; and a house notice, which names no one.
CREATE TEMP TABLE nn_writes (k text, got text) ON COMMIT DROP;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
    VALUES (current_setting('rehearsal.host')::uuid, 'follow', current_setting('rehearsal.guest_name'),
            current_setting('rehearsal.guest')::uuid, '@' || current_setting('rehearsal.guest_name') || ' is following you.');
    INSERT INTO nn_writes VALUES ('twice', 'written');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO nn_writes VALUES ('twice', 'refused');
  END;
  BEGIN
    INSERT INTO public.notifications (user_id, type, message)
    VALUES (current_setting('rehearsal.host')::uuid, 'featured', 'Your log hangs in the Lobby today.');
    INSERT INTO nn_writes VALUES ('house', 'written');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO nn_writes VALUES ('house', 'refused');
  END;
END $$;

DO $$
DECLARE failed integer := 0; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('the request names the guest in its own column', current_setting('rehearsal.guest_name'),
       (SELECT from_username FROM public.notifications WHERE related_lounge_id = (SELECT id FROM nn_lounge))),
    ('its message says only what was done', 'is asking to enter The Rehearsal Salon.',
       (SELECT message FROM public.notifications WHERE related_lounge_id = (SELECT id FROM nn_lounge))),
    ('the notice written before loses its copy of the name', 'is now following you.',
       (SELECT message FROM public.notifications WHERE id = (SELECT id FROM nn_old))),
    ('no notice in the house names its sender twice', '0',
       (SELECT count(*)::text FROM public.notifications WHERE from_username IS NOT NULL AND message LIKE '@%')),
    ('a writer that names the sender twice is refused', 'refused', (SELECT got FROM nn_writes WHERE k = 'twice')),
    ('a notice from the house itself still posts', 'written', (SELECT got FROM nn_writes WHERE k = 'house'))
  ) AS t(label, expected, got) LOOP
    RAISE NOTICE '% | % | %', c.label, c.expected, c.got;
    IF c.got IS DISTINCT FROM c.expected THEN failed := failed + 1; END IF;
  END LOOP;
  RAISE NOTICE 'FAILED: %', failed;
END $$;

ROLLBACK;
