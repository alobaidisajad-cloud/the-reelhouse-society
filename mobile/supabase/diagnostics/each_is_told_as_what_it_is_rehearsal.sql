-- ════════════════════════════════════════════════════════════════════════════
-- each_is_told_as_what_it_is_rehearsal.sql — 20261116_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs each_is_told_as_what_it_is_rehearsal.sql --with-train
--
-- The train applies 20261116_01 here (with_train); a sealed copy already holds it. Then four
-- members in good standing, acting as themselves, find: a host's corridor counts at a salon's
-- door the one member who may come in and names them, never one the host has muted or blocked,
-- and every other piece of the corridor still answers; a certification of a filing is told under
-- the filing's key as before, and a certification of a critique under its own; a salon's last
-- word is the last one its reader can read, never one from a member they muted; a film's archive
-- search is counted by the house without the member the reader muted; a banned member's row stays
-- through a removal and a stepping out, and one taken before is put back; a muted follower leaves
-- the follow counts; a muted seat reads its private salon, and a member blocked by an author reads
-- none of their records or stacks. Every row here
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

-- Before the train, a ban whose row was taken: member 1 keeps a gallery that banned 2, and 2's row is gone.
\if :{?with_train}
CREATE TEMP TABLE rh_gallery ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('The Rehearsal Gallery', (SELECT id FROM rehearsal_members WHERE n = 1), false)
  RETURNING id)
SELECT id FROM made;
INSERT INTO public.lounge_sanctions (lounge_id, user_id, status)
VALUES ((SELECT id FROM rh_gallery), (SELECT id FROM rehearsal_members WHERE n = 2), 'banned');
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM rh_gallery) AND user_id = (SELECT id FROM rehearsal_members WHERE n = 2);
\endif

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

-- Member 1 also keeps an open salon where 3 sits, last read three minutes ago: 3 says a word, and
-- 2, whom the host muted, says one after it.
CREATE TEMP TABLE rh_corner ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('The Rehearsal Corner', (SELECT id FROM rehearsal_members WHERE n = 1), false)
  RETURNING id)
SELECT id FROM made;
GRANT SELECT ON rh_corner TO authenticated;
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at)
SELECT (SELECT id FROM rh_corner), id, 'approved', now() - interval '3 minutes' FROM rehearsal_members WHERE n IN (1, 3);
-- 2 and 4 sit there too: the host will remove 2, and 4 will step out.
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM rh_corner), id, 'approved' FROM rehearsal_members WHERE n IN (2, 4);

-- Members 1, 2 and 3 each file a take on one film, its title this run's own.
INSERT INTO public.dispatch_posts (kind, user_id, author_username, body, subject_kind, subject_id, subject_title)
SELECT 'take', m.id, p.username, 'rehearsal: on the picture', 'film', 990000101,
       'The Rehearsal Picture ' || (SELECT id FROM rh_salon)
  FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id WHERE m.n IN (1, 2, 3);

INSERT INTO public.lounge_messages (lounge_id, user_id, content, created_at)
VALUES ((SELECT id FROM rh_corner), (SELECT id FROM rehearsal_members WHERE n = 3), 'rehearsal: a word', now() - interval '2 minutes'),
       ((SELECT id FROM rh_corner), (SELECT id FROM rehearsal_members WHERE n = 2), 'rehearsal: a muted word', now() - interval '1 minute');

-- Member 1 keeps a private parlour where 3 sits muted, and says a word there; and files a record and a
-- stack, for 4 (whom 1 blocked) to look for.
CREATE TEMP TABLE rh_parlour ON COMMIT DROP AS
WITH made AS (
  INSERT INTO public.lounges (name, creator_id, is_private)
  VALUES ('The Rehearsal Parlour', (SELECT id FROM rehearsal_members WHERE n = 1), true)
  RETURNING id)
SELECT id FROM made;
GRANT SELECT ON rh_parlour TO authenticated;
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT (SELECT id FROM rh_parlour), id, 'muted' FROM rehearsal_members WHERE n = 3;
INSERT INTO public.lounge_messages (lounge_id, user_id, content)
VALUES ((SELECT id FROM rh_parlour), (SELECT id FROM rehearsal_members WHERE n = 1), 'rehearsal: a parlour word');
CREATE TEMP TABLE rh_own (what text, id uuid) ON COMMIT DROP;
GRANT SELECT ON rh_own TO authenticated;
WITH r AS (INSERT INTO public.logs (user_id, film_id, film_title, watched_date)
           VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 990000102, 'rh film', current_date) RETURNING id)
INSERT INTO rh_own SELECT 'log', id FROM r;
WITH r AS (INSERT INTO public.lists (user_id, title) VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), 'rh stack') RETURNING id)
INSERT INTO rh_own SELECT 'stack', id FROM r;
CREATE TEMP TABLE rh_seen (who int, what text, got text) ON COMMIT DROP;
GRANT ALL ON rh_seen TO authenticated;

-- The host reads their corridor, as themselves.
CREATE TEMP TABLE rh_corridor (got jsonb) ON COMMIT DROP;
GRANT ALL ON rh_corridor TO authenticated;
CREATE TEMP TABLE rh_unread (unread bigint, last_at timestamptz) ON COMMIT DROP;
GRANT ALL ON rh_unread TO authenticated;
CREATE TEMP TABLE rh_films (subject_id integer, filings bigint) ON COMMIT DROP;
GRANT ALL ON rh_films TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_corridor SELECT public.get_lounge_list();
INSERT INTO rh_unread SELECT u.unread_count, u.last_message_at FROM public.get_lounge_unread_counts() u
 WHERE u.lounge_id = (SELECT id FROM rh_corner);
INSERT INTO rh_films SELECT f.subject_id, f.filings FROM public.dispatch_archive_films('The Rehearsal Picture ' || (SELECT id FROM rh_salon)) f;
-- The host bans 3, then removes 3 and 2.
SELECT public.set_lounge_member_status((SELECT id FROM rh_corner), (SELECT id FROM rehearsal_members WHERE n = 3), 'banned') AS done \gset rh_
SELECT public.remove_lounge_member((SELECT id FROM rh_corner), (SELECT id FROM rehearsal_members WHERE n = 3)) AS done \gset rh_
SELECT public.remove_lounge_member((SELECT id FROM rh_corner), (SELECT id FROM rehearsal_members WHERE n = 2)) AS done \gset rh_
RESET ROLE;

-- 3, banned, tries to step out; 4 steps out. Each as themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM rh_corner) AND user_id = (SELECT id FROM rehearsal_members WHERE n = 3);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
DELETE FROM public.lounge_members WHERE lounge_id = (SELECT id FROM rh_corner) AND user_id = (SELECT id FROM rehearsal_members WHERE n = 4);
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
  PERFORM pg_temp.rh_case('a salon''s unread count leaves out the member the reader muted, as before', '1',
    (SELECT unread::text FROM rh_unread));
  PERFORM pg_temp.rh_case('its last word is the last one the reader can read, never the muted member''s after it',
    (now() - interval '2 minutes')::text, (SELECT last_at::text FROM rh_unread));
  PERFORM pg_temp.rh_case('a film''s archive search finds it once', '1', (SELECT count(*)::text FROM rh_films));
  PERFORM pg_temp.rh_case('and counts its filings without the member the reader muted', '2',
    (SELECT filings::text FROM rh_films WHERE subject_id = 990000101));
  PERFORM pg_temp.rh_case('a banned member''s row stays through the host''s removal and their own stepping out', 'banned',
    (SELECT status FROM public.lounge_members WHERE lounge_id = (SELECT id FROM rh_corner) AND user_id = (SELECT id FROM rehearsal_members WHERE n = 3)));
  PERFORM pg_temp.rh_case('a seated member is removed as before, and one steps out as before', '0',
    (SELECT count(*)::text FROM public.lounge_members WHERE lounge_id = (SELECT id FROM rh_corner)
      AND user_id IN (SELECT id FROM rehearsal_members WHERE n IN (2, 4))));

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

\if :{?with_train}
SELECT pg_temp.rh_case('a ban whose row was taken is on its host''s roster again', 'banned',
  (SELECT status FROM public.lounge_members WHERE lounge_id = (SELECT id FROM rh_gallery) AND user_id = (SELECT id FROM rehearsal_members WHERE n = 2))) AS done \gset rh_
\endif

-- 2 follows 1, and 1 follows 2 (whom 1 muted). 1 reads their counts muted, and again unmuted.
DELETE FROM public.interactions WHERE type = 'follow'
   AND ((user_id = (SELECT id FROM rehearsal_members WHERE n = 2) AND target_user_id = (SELECT id FROM rehearsal_members WHERE n = 1))
     OR (user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND target_user_id = (SELECT id FROM rehearsal_members WHERE n = 2)));
INSERT INTO public.interactions (user_id, target_user_id, type)
VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 1), 'follow'),
       ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'follow');
CREATE TEMP TABLE rh_counts (muted boolean, got json) ON COMMIT DROP;
GRANT ALL ON rh_counts TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_counts SELECT true, public.get_profile_counts((SELECT id FROM rehearsal_members WHERE n = 1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.user_blocks WHERE blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND blocked_id = (SELECT id FROM rehearsal_members WHERE n = 2);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_counts SELECT false, public.get_profile_counts((SELECT id FROM rehearsal_members WHERE n = 1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('a follower the member muted is not in their FOLLOWERS', '1',
  ((SELECT (got ->> 'followers_count')::int FROM rh_counts WHERE NOT muted)
    - (SELECT (got ->> 'followers_count')::int FROM rh_counts WHERE muted))::text) AS done \gset rh_
SELECT pg_temp.rh_case('nor one they follow and muted in their FOLLOWING', '1',
  ((SELECT (got ->> 'following_count')::int FROM rh_counts WHERE NOT muted)
    - (SELECT (got ->> 'following_count')::int FROM rh_counts WHERE muted))::text) AS done \gset rh_

-- 3, muted in the parlour, reads it as themselves; 4 looks for 1's record and stack; 1 reads their own.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 3), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_seen SELECT 3, 'words', count(*)::text FROM public.lounge_messages WHERE lounge_id = (SELECT id FROM rh_parlour);
INSERT INTO rh_seen SELECT 3, 'channel', public.salon_channel_readable('lounge-' || (SELECT id FROM rh_parlour))::text;
INSERT INTO rh_seen SELECT 3, 'roster', public.is_lounge_member_or_host((SELECT id FROM rh_parlour))::text;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 4), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_seen SELECT 4, 'log', count(*)::text FROM public.logs WHERE id = (SELECT id FROM rh_own WHERE what = 'log');
INSERT INTO rh_seen SELECT 4, 'stack', count(*)::text FROM public.lists WHERE id = (SELECT id FROM rh_own WHERE what = 'stack');
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_seen SELECT 1, 'log', count(*)::text FROM public.logs WHERE id = (SELECT id FROM rh_own WHERE what = 'log');
INSERT INTO rh_seen SELECT 1, 'stack', count(*)::text FROM public.lists WHERE id = (SELECT id FROM rh_own WHERE what = 'stack');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('a muted seat reads its private salon''s words', '1', (SELECT got FROM rh_seen WHERE who = 3 AND what = 'words')) AS done \gset rh_
SELECT pg_temp.rh_case('and receives its channel', 'true', (SELECT got FROM rh_seen WHERE who = 3 AND what = 'channel')) AS done \gset rh_
SELECT pg_temp.rh_case('and reads its roster', 'true', (SELECT got FROM rh_seen WHERE who = 3 AND what = 'roster')) AS done \gset rh_
SELECT pg_temp.rh_case('a member blocked by an author reads none of their records', '0', (SELECT got FROM rh_seen WHERE who = 4 AND what = 'log')) AS done \gset rh_
SELECT pg_temp.rh_case('nor their stacks', '0', (SELECT got FROM rh_seen WHERE who = 4 AND what = 'stack')) AS done \gset rh_
SELECT pg_temp.rh_case('the author reads their own record as before', '1', (SELECT got FROM rh_seen WHERE who = 1 AND what = 'log')) AS done \gset rh_
SELECT pg_temp.rh_case('and their own stack', '1', (SELECT got FROM rh_seen WHERE who = 1 AND what = 'stack')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
