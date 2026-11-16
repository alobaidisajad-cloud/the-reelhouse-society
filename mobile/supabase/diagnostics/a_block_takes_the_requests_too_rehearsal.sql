-- ════════════════════════════════════════════════════════════════════════════
-- a_block_takes_the_requests_too_rehearsal.sql — 20261115_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_block_takes_the_requests_too_rehearsal.sql --with-train
--
-- 20261115_01 is applied on production (2026-11-16); this shows it still holds there: nothing
-- of a follow may stand across a block anywhere in the house, and four members in good standing,
-- acting as themselves, find: a block takes the requests between the two both ways, with the
-- notice the request left; a mute leaves a request waiting, and the same mute raised to a block
-- takes it; a request with no block between is admitted as before, and counted; and a request
-- waiting across a block (made in the same moment as the block) admits no one when accepted,
-- is taken from the door, sends no notice and counts no one. Every row here is undone with the
-- transaction. Read each NOTICE as  case|expected|got ; the last line is the verdict, and any
-- miss makes psql exit non-zero.
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


DO $$ BEGIN
  PERFORM pg_temp.rh_case('nothing of a follow stands across a block in the house', '0',
    (SELECT count(*)::text FROM public.interactions i
      WHERE i.type IN ('follow', 'follow_request')
        AND EXISTS (SELECT 1 FROM public.user_blocks b
                     WHERE b.type = 'block'
                       AND ((b.blocker_id = i.user_id AND b.blocked_id = i.target_user_id)
                         OR (b.blocker_id = i.target_user_id AND b.blocked_id = i.user_id)))));
END $$;

-- The four start with nothing between them: no block, no follow, no request.
DELETE FROM public.user_blocks
 WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interactions
 WHERE type IN ('follow', 'follow_request')
   AND user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.notifications
 WHERE type IN ('follow_request', 'follow_accept')
   AND user_id IN (SELECT id FROM rehearsal_members) AND from_user_id IN (SELECT id FROM rehearsal_members);

-- The requests, made a day ago (a member may act once a second, and these are all at once):
-- 1 and 2 at each other's door, 3 at 2's, 4 at 1's.
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
SELECT a.id, b.id, 'follow_request', now() - interval '1 day'
  FROM (VALUES (1, 2), (2, 1), (3, 2), (4, 1)) AS v(from_n, to_n)
  JOIN rehearsal_members a ON a.n = v.from_n
  JOIN rehearsal_members b ON b.n = v.to_n;

-- 1 at 3's door across a block, as a request made in the same moment as the block is left: the
-- block (3 blocks 1) is made while the row is something else, and the row becomes the request.
INSERT INTO public.interactions (user_id, target_user_id, type, created_at)
SELECT a.id, b.id, 'rehearsal_waiting', now() - interval '1 day'
  FROM rehearsal_members a, rehearsal_members b WHERE a.n = 1 AND b.n = 3;
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
SELECT b.id, a.id, 'block' FROM rehearsal_members a, rehearsal_members b WHERE a.n = 1 AND b.n = 3;
UPDATE public.interactions SET type = 'follow_request'
 WHERE type = 'rehearsal_waiting'
   AND user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
   AND target_user_id = (SELECT id FROM rehearsal_members WHERE n = 3);

-- What each was counted before.
CREATE TEMP TABLE rh_counted ON COMMIT DROP AS
  SELECT m.n, p.followers_count, p.following_count
    FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  m1 uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  m2 uuid := (SELECT id FROM rehearsal_members WHERE n = 2);
  m3 uuid := (SELECT id FROM rehearsal_members WHERE n = 3);
  m4 uuid := (SELECT id FROM rehearsal_members WHERE n = 4);
  as_member CONSTANT text := '{"sub":"%s","role":"authenticated"}';
  waiting CONSTANT text := 'SELECT count(*)::text FROM public.interactions WHERE user_id = $1 AND target_user_id = $2 AND type = $3';
  got text;
BEGIN
  -- ── 2 blocks 1 ───────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', format(as_member, m2), true);
  PERFORM pg_temp.rh_case('before the block, 1 waits at 2''s door', '1',
    (SELECT count(*)::text FROM public.interactions WHERE user_id = m1 AND target_user_id = m2 AND type = 'follow_request'));
  PERFORM pg_temp.rh_case('and its notice is at 2''s', '1',
    (SELECT count(*)::text FROM public.notifications WHERE user_id = m2 AND type = 'follow_request' AND from_user_id = m1));
  INSERT INTO public.user_blocks (blocker_id, blocked_id, type) VALUES (m2, m1, 'block');
  EXECUTE waiting INTO got USING m1, m2, 'follow_request';
  PERFORM pg_temp.rh_case('a block takes the request at the blocker''s door', '0', got);
  EXECUTE waiting INTO got USING m2, m1, 'follow_request';
  PERFORM pg_temp.rh_case('and the blocker''s own request to the one blocked', '0', got);
  PERFORM pg_temp.rh_case('and the notice the request left', '0',
    (SELECT count(*)::text FROM public.notifications WHERE user_id = m2 AND type = 'follow_request' AND from_user_id = m1));

  -- ── 2 mutes 3, then blocks them ──────────────────────────────────────────
  INSERT INTO public.user_blocks (blocker_id, blocked_id, type) VALUES (m2, m3, 'mute');
  EXECUTE waiting INTO got USING m3, m2, 'follow_request';
  PERFORM pg_temp.rh_case('a mute leaves the request waiting', '1', got);
  UPDATE public.user_blocks SET type = 'block' WHERE blocker_id = m2 AND blocked_id = m3;
  EXECUTE waiting INTO got USING m3, m2, 'follow_request';
  PERFORM pg_temp.rh_case('the mute raised to a block takes it', '0', got);

  -- ── 1 admits 4: no block between ─────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', format(as_member, m1), true);
  PERFORM public.accept_follow_request(m4);
  EXECUTE waiting INTO got USING m4, m1, 'follow';
  PERFORM pg_temp.rh_case('a request with no block between is admitted', '1', got);
  EXECUTE waiting INTO got USING m4, m1, 'follow_request';
  PERFORM pg_temp.rh_case('and leaves the door', '0', got);

  -- ── 3 admits 1, across 3's block ─────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', format(as_member, m3), true);
  EXECUTE waiting INTO got USING m1, m3, 'follow_request';
  PERFORM pg_temp.rh_case('a request waits across a block (made with it)', '1', got);
  PERFORM public.accept_follow_request(m1);
  EXECUTE waiting INTO got USING m1, m3, 'follow';
  PERFORM pg_temp.rh_case('a request across a block admits no one', '0', got);
  EXECUTE waiting INTO got USING m1, m3, 'follow_request';
  PERFORM pg_temp.rh_case('and is taken from the door', '0', got);
END $$;
RESET ROLE;

-- As the house: what a member may not read of another's.
DO $$
DECLARE
  m1 uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  m3 uuid := (SELECT id FROM rehearsal_members WHERE n = 3);
  m4 uuid := (SELECT id FROM rehearsal_members WHERE n = 4);
BEGIN
  PERFORM pg_temp.rh_case('the one admitted is told', '1',
    (SELECT count(*)::text FROM public.notifications WHERE user_id = m4 AND type = 'follow_accept' AND from_user_id = m1));
  PERFORM pg_temp.rh_case('the one across the block is told nothing', '0',
    (SELECT count(*)::text FROM public.notifications WHERE user_id = m1 AND type = 'follow_accept' AND from_user_id = m3));
  PERFORM pg_temp.rh_case('the admission is counted, both sides', '1/1',
    (SELECT (a.followers_count - ca.followers_count) || '/' || (b.following_count - cb.following_count)
       FROM public.profiles a, public.profiles b, rh_counted ca, rh_counted cb
      WHERE a.id = m1 AND ca.n = 1 AND b.id = m4 AND cb.n = 4));
  PERFORM pg_temp.rh_case('and the one across the block counts no one', '0/0',
    (SELECT (a.followers_count - ca.followers_count) || '/' || (b.following_count - cb.following_count)
       FROM public.profiles a, public.profiles b, rh_counted ca, rh_counted cb
      WHERE a.id = m3 AND ca.n = 3 AND b.id = m1 AND cb.n = 1));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
