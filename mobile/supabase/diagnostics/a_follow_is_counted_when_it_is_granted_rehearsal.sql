-- ════════════════════════════════════════════════════════════════════════════
-- a_follow_is_counted_when_it_is_granted_rehearsal.sql — 20261003_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_follow_is_counted_when_it_is_granted_rehearsal.sql
--
-- A host with four would-be followers: one is let in, one turned away, one
-- withdraws, and one never asked. A visitor and the one who never asked both
-- try to "accept" a request that does not exist. Without with_fix the counts
-- move for nothing, the visitor is let through, the requester hears nothing
-- and the host's notices outlive their requests: the rehearsal says no.
-- Read each NOTICE as  case | expected | got.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261003_01_a_follow_is_counted_when_it_is_granted.sql
\endif

-- Five members: the host, and four others with nothing between them and the host.
CREATE TEMP TABLE fc_cast ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY created_at) AS n FROM public.profiles ORDER BY created_at LIMIT 5;
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
DECLARE failed integer := 0; c record;
  moved_followers integer := (SELECT coalesce(p.followers_count, 0) - b.followers FROM public.profiles p JOIN fc_before b USING (id) WHERE id = current_setting('rehearsal.host')::uuid);
  moved_following integer := (SELECT coalesce(p.following_count, 0) - b.following FROM public.profiles p JOIN fc_before b USING (id) WHERE id = current_setting('rehearsal.admitted')::uuid);
  host_moved_following integer := (SELECT coalesce(p.following_count, 0) - b.following FROM public.profiles p JOIN fc_before b USING (id) WHERE id = current_setting('rehearsal.host')::uuid);
  stranger_moved integer := (SELECT coalesce(p.followers_count, 0) - b.followers FROM public.profiles p JOIN fc_before b USING (id) WHERE id = current_setting('rehearsal.stranger')::uuid);
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('a visitor cannot accept a request', 'refused', (SELECT got FROM fc_out WHERE k = 'visitor')),
    ('the host gains one follower: the one let in', '1', moved_followers::text),
    ('the one let in follows one more', '1', moved_following::text),
    ('nothing moves for a request that does not exist', '0', (host_moved_following + stranger_moved)::text),
    ('the one let in follows the host', 'follow',
       (SELECT type FROM public.interactions WHERE user_id = current_setting('rehearsal.admitted')::uuid AND target_user_id = current_setting('rehearsal.host')::uuid)),
    ('and hears that they were let in', '1',
       (SELECT count(*)::text FROM public.notifications WHERE user_id = current_setting('rehearsal.admitted')::uuid
          AND type = 'follow_accept' AND from_user_id = current_setting('rehearsal.host')::uuid)),
    ('the host keeps no notice of a request that has ended', '0',
       (SELECT count(*)::text FROM public.notifications WHERE user_id = current_setting('rehearsal.host')::uuid AND type = 'follow_request'
          AND from_user_id IN (current_setting('rehearsal.admitted')::uuid, current_setting('rehearsal.declined')::uuid, current_setting('rehearsal.withdrew')::uuid))),
    ('no request notice in the house outlives its request', '0',
       (SELECT count(*)::text FROM public.notifications n WHERE n.type = 'follow_request' AND NOT EXISTS (
          SELECT 1 FROM public.interactions i WHERE i.user_id = n.from_user_id AND i.target_user_id = n.user_id AND i.type = 'follow_request')))
  ) AS t(label, expected, got) LOOP
    RAISE NOTICE '% | % | %', c.label, c.expected, c.got;
    IF c.got IS DISTINCT FROM c.expected THEN failed := failed + 1; END IF;
  END LOOP;
  RAISE NOTICE 'FAILED: %', failed;
END $$;

ROLLBACK;
