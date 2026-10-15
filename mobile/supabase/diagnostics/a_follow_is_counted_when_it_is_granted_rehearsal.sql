-- ════════════════════════════════════════════════════════════════════════════
-- a_follow_is_counted_when_it_is_granted_rehearsal.sql — 20261003_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_follow_is_counted_when_it_is_granted_rehearsal.sql
--
-- A host with four would-be followers: one is let in, one turned away, one
-- withdraws, and one never asked. A visitor and the one who never asked both
-- try to "accept" a request that does not exist. The counts move only for the
-- one let in, the visitor is refused, the requester hears they were let in,
-- and no notice outlives its request. Production runs it by hand;
-- db-integration.yml runs it on the sealed copy (e2e/db/rehearsals.mjs).
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- Five members in good standing: the host, and four others with nothing between them and the host.
CREATE TEMP TABLE fc_cast ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY created_at) AS n FROM public.profiles
 WHERE NOT coalesce(is_banned, false) AND (suspended_until IS NULL OR suspended_until <= now())
 ORDER BY created_at LIMIT 5;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM fc_cast), 5) AS done \gset rh_
SELECT set_config('rehearsal.host',     (SELECT id::text FROM fc_cast WHERE n = 1), true) AS done \gset rh_
SELECT set_config('rehearsal.admitted', (SELECT id::text FROM fc_cast WHERE n = 2), true) AS done \gset rh_
SELECT set_config('rehearsal.declined', (SELECT id::text FROM fc_cast WHERE n = 3), true) AS done \gset rh_
SELECT set_config('rehearsal.withdrew', (SELECT id::text FROM fc_cast WHERE n = 4), true) AS done \gset rh_
SELECT set_config('rehearsal.stranger', (SELECT id::text FROM fc_cast WHERE n = 5), true) AS done \gset rh_
DELETE FROM public.interactions
 WHERE (user_id IN (SELECT id FROM fc_cast) AND target_user_id = current_setting('rehearsal.host')::uuid)
    OR (target_user_id IN (SELECT id FROM fc_cast) AND user_id = current_setting('rehearsal.host')::uuid);
DELETE FROM public.notifications WHERE user_id IN (SELECT id FROM fc_cast) AND from_user_id IN (SELECT id FROM fc_cast);

-- Three requests, as the app makes them: a follow of a private profile becomes a request.
UPDATE public.profiles SET is_social_private = true WHERE id = current_setting('rehearsal.host')::uuid;
INSERT INTO public.interactions (user_id, target_user_id, type)
SELECT id, current_setting('rehearsal.host')::uuid, 'follow' FROM fc_cast WHERE n IN (2, 3, 4);

CREATE TEMP TABLE fc_before ON COMMIT DROP AS
SELECT id, coalesce(followers_count, 0) AS followers, coalesce(following_count, 0) AS following FROM public.profiles WHERE id IN (SELECT id FROM fc_cast);
CREATE TEMP TABLE fc_out (k text, got text) ON COMMIT DROP;
GRANT ALL ON fc_out TO anon, authenticated;
GRANT SELECT ON fc_cast TO anon, authenticated;

-- A visitor "accepts" a request that does not exist.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) AS done \gset rh_
DO $$
BEGIN
  PERFORM public.accept_follow_request(current_setting('rehearsal.host')::uuid);
  INSERT INTO fc_out VALUES ('visitor', 'ran');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO fc_out VALUES ('visitor', 'refused');
END $$;
RESET ROLE;

-- The stranger "accepts" the host, who never asked.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.stranger'), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.accept_follow_request(current_setting('rehearsal.host')::uuid) AS done \gset rh_
RESET ROLE;

-- The host lets one in and turns one away; the third withdraws.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.host'), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT public.accept_follow_request(current_setting('rehearsal.admitted')::uuid) AS done \gset rh_
SELECT public.decline_follow_request(current_setting('rehearsal.declined')::uuid) AS done \gset rh_
RESET ROLE;
DELETE FROM public.interactions WHERE user_id = current_setting('rehearsal.withdrew')::uuid AND target_user_id = current_setting('rehearsal.host')::uuid;

DO $$
DECLARE
  moved_followers integer := (SELECT coalesce(p.followers_count, 0) - b.followers FROM public.profiles p JOIN fc_before b USING (id) WHERE id = current_setting('rehearsal.host')::uuid);
  moved_following integer := (SELECT coalesce(p.following_count, 0) - b.following FROM public.profiles p JOIN fc_before b USING (id) WHERE id = current_setting('rehearsal.admitted')::uuid);
  host_moved_following integer := (SELECT coalesce(p.following_count, 0) - b.following FROM public.profiles p JOIN fc_before b USING (id) WHERE id = current_setting('rehearsal.host')::uuid);
  stranger_moved integer := (SELECT coalesce(p.followers_count, 0) - b.followers FROM public.profiles p JOIN fc_before b USING (id) WHERE id = current_setting('rehearsal.stranger')::uuid);
BEGIN
  PERFORM pg_temp.rh_case('a visitor cannot accept a request', 'refused', (SELECT got FROM fc_out WHERE k = 'visitor'));
  PERFORM pg_temp.rh_case('the host gains one follower: the one let in', '1', moved_followers::text);
  PERFORM pg_temp.rh_case('the one let in follows one more', '1', moved_following::text);
  PERFORM pg_temp.rh_case('nothing moves for a request that does not exist', '0', (host_moved_following + stranger_moved)::text);
  PERFORM pg_temp.rh_case('the one let in follows the host', 'follow',
    (SELECT type FROM public.interactions WHERE user_id = current_setting('rehearsal.admitted')::uuid AND target_user_id = current_setting('rehearsal.host')::uuid));
  PERFORM pg_temp.rh_case('and hears that they were let in', '1',
    (SELECT count(*)::text FROM public.notifications WHERE user_id = current_setting('rehearsal.admitted')::uuid
       AND type = 'follow_accept' AND from_user_id = current_setting('rehearsal.host')::uuid));
  PERFORM pg_temp.rh_case('the host keeps no notice of a request that has ended', '0',
    (SELECT count(*)::text FROM public.notifications WHERE user_id = current_setting('rehearsal.host')::uuid AND type = 'follow_request'
       AND from_user_id IN (current_setting('rehearsal.admitted')::uuid, current_setting('rehearsal.declined')::uuid, current_setting('rehearsal.withdrew')::uuid)));
  PERFORM pg_temp.rh_case('no request notice in the house outlives its request', '0',
    (SELECT count(*)::text FROM public.notifications n WHERE n.type = 'follow_request' AND NOT EXISTS (
       SELECT 1 FROM public.interactions i WHERE i.user_id = n.from_user_id AND i.target_user_id = n.user_id AND i.type = 'follow_request')));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
