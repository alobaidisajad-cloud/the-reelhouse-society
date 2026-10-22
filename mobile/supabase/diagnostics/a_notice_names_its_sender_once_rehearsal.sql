-- ════════════════════════════════════════════════════════════════════════════
-- a_notice_names_its_sender_once_rehearsal.sql — 20261003_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_notice_names_its_sender_once_rehearsal.sql
--
-- A member whose rank opens the Lounge asks to enter a private salon: the
-- request names them once, in its own column; no notice in the house names its
-- sender twice; a writer that tries is refused, and a notice from the house
-- itself still posts. Production runs it by hand; db-integration.yml runs it
-- on the sealed copy (e2e/db/rehearsals.mjs). Read each NOTICE as
-- case|expected|got ; the last line is the verdict, and any miss makes psql
-- exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- A host, and a guest whose rank opens the Lounge and who is free to ask.
SELECT set_config('rehearsal.host', pg_temp.rh_found('a member to host the salon',
  (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.guest', pg_temp.rh_found('a member of Archivist rank or above, in good standing, besides the host', (
  SELECT id FROM public.profiles
   WHERE id::text <> current_setting('rehearsal.host')
     AND (lower(tier) IN ('archivist', 'auteur', 'founding') OR lower(role) IN ('archivist', 'auteur', 'founding') OR is_founding)
      AND public.profile_tier_weight(tier, role, is_founding) >= 1
     AND NOT coalesce(is_banned, false)
     AND (suspended_until IS NULL OR suspended_until <= now())
   ORDER BY created_at LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.guest_name', (SELECT username FROM public.profiles WHERE id = current_setting('rehearsal.guest')::uuid), true) AS done \gset rh_

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

DO $$ BEGIN
  PERFORM pg_temp.rh_case('the request names the guest in its own column', current_setting('rehearsal.guest_name'),
    (SELECT from_username FROM public.notifications WHERE related_lounge_id = (SELECT id FROM nn_lounge)));
  PERFORM pg_temp.rh_case('its message says only what was done', 'is asking to enter The Rehearsal Salon.',
    (SELECT message FROM public.notifications WHERE related_lounge_id = (SELECT id FROM nn_lounge)));
  PERFORM pg_temp.rh_case('no notice in the house names its sender twice (of '
      || (SELECT count(*) FROM public.notifications WHERE from_username IS NOT NULL) || ' that name one)', '0',
    (SELECT count(*)::text FROM public.notifications WHERE from_username IS NOT NULL AND message LIKE '@%'));
  PERFORM pg_temp.rh_case('a writer that names the sender twice is refused', 'refused', (SELECT got FROM nn_writes WHERE k = 'twice'));
  PERFORM pg_temp.rh_case('a notice from the house itself still posts', 'written', (SELECT got FROM nn_writes WHERE k = 'house'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
