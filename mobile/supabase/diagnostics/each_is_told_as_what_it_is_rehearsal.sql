-- ════════════════════════════════════════════════════════════════════════════
-- each_is_told_as_what_it_is_rehearsal.sql — 20261116_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs each_is_told_as_what_it_is_rehearsal.sql --with-train
--
-- The train applies 20261116_01 here (with_train); a sealed copy already holds it. Then four
-- members in good standing, acting as themselves, find: a host's corridor counts at a salon's
-- door the one member who may come in and names them, never one the host has muted or blocked,
-- and every other piece of the corridor still answers; a certification of a filing is told under
-- the filing's key as before, and a certification of a critique under its own. Every row here
-- is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line is the
-- verdict, and any miss makes psql exit non-zero.
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

-- The train applies it here first (with_train); a sealed copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261116_01_each_is_told_as_what_it_is.sql
\endif

-- Nothing stands between the four before the run begins, so each case is the run's own doing.
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);

-- Member 1 hosts a private salon; members 2, 3 and 4 wait at its door. The host has muted 2 and
-- blocked 4; 3 is free to come in.
CREATE TEMP TABLE rh_salon ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('The Rehearsal Door', (SELECT id FROM rehearsal_members WHERE n = 1), true)
  RETURNING id)
SELECT id FROM made;
GRANT SELECT ON rh_salon TO authenticated;
DELETE FROM public.lounge_members
 WHERE lounge_id = (SELECT id FROM rh_salon) AND user_id IN (SELECT id FROM rehearsal_members WHERE n IN (2, 3, 4));
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM rh_salon), id, 'pending' FROM rehearsal_members WHERE n IN (2, 3, 4);
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'mute'),
       ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 4), 'block');
-- A block may take a seat or a request with it; the run asks only that 4 is not counted.

-- Member 1 files a take; member 2 critiques it.
CREATE TEMP TABLE rh_filing ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.dispatch_posts (kind, user_id, author_username, body)
  VALUES ('take', (SELECT id FROM rehearsal_members WHERE n = 1),
          (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1)),
          'rehearsal: a take')
  RETURNING id)
SELECT id FROM made;
GRANT SELECT ON rh_filing TO authenticated;
CREATE TEMP TABLE rh_critique ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.dispatch_comments (post_id, user_id, author_username, body)
  VALUES ((SELECT id FROM rh_filing), (SELECT id FROM rehearsal_members WHERE n = 2),
          (SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 2)),
          'rehearsal: a critique')
  RETURNING id)
SELECT id FROM made;
GRANT SELECT ON rh_critique TO authenticated;

-- The host reads their corridor, as themselves.
CREATE TEMP TABLE rh_corridor (got jsonb) ON COMMIT DROP;
GRANT ALL ON rh_corridor TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_corridor SELECT public.get_lounge_list();
RESET ROLE;

-- Member 3 certifies the take and the critique, as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO public.dispatch_certifications (user_id, post_id)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rh_filing));
INSERT INTO public.dispatch_certifications (user_id, comment_id)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 3), (SELECT id FROM rh_critique));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

DO $$
DECLARE
  door jsonb := (SELECT jsonb_agg(e) FROM rh_corridor, jsonb_array_elements(got -> 'pending') e
                  WHERE e ->> 'lounge_id' = (SELECT id::text FROM rh_salon));
BEGIN
  PERFORM pg_temp.rh_case('the door counts the one member who may come in, never one the host muted or blocked', '1',
    coalesce(jsonb_array_length(door), 0)::text);
  PERFORM pg_temp.rh_case('and names them', (SELECT id::text FROM rehearsal_members WHERE n = 3),
    door -> 0 ->> 'user_id');
  PERFORM pg_temp.rh_case('every other piece of the corridor still answers, each a list',
    'faces,hosted,joined,last_words,memberships,newest,pending,unread',
    (SELECT string_agg(k, ',' ORDER BY k) FROM rh_corridor, jsonb_object_keys(got) k
      WHERE jsonb_typeof(got -> k) = 'array'));
  PERFORM pg_temp.rh_case('the salon the host keeps is in their corridor', '1',
    (SELECT count(*)::text FROM rh_corridor, jsonb_array_elements(got -> 'hosted') h
      WHERE h ->> 'id' = (SELECT id::text FROM rh_salon)));

  PERFORM pg_temp.rh_case('a certification of the filing is told to its author under the filing''s key',
    'endorse:post:' || (SELECT id FROM rh_filing),
    (SELECT group_key FROM public.notifications
      WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
        AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = 3) AND type = 'endorse'
        AND metadata ->> 'dispatch_post_id' = (SELECT id::text FROM rh_filing)));
  PERFORM pg_temp.rh_case('a certification of the critique is told to its critic under its own key',
    'endorse:critique:' || (SELECT id FROM rh_filing),
    (SELECT group_key FROM public.notifications
      WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2)
        AND from_user_id = (SELECT id FROM rehearsal_members WHERE n = 3) AND type = 'endorse'
        AND metadata ->> 'comment_id' = (SELECT id::text FROM rh_critique)));
  PERFORM pg_temp.rh_case('in the words it had', 'certified your critique.',
    (SELECT message FROM public.notifications
      WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2)
        AND metadata ->> 'comment_id' = (SELECT id::text FROM rh_critique)));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
