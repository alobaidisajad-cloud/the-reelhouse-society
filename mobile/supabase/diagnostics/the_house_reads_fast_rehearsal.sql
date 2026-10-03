-- ════════════════════════════════════════════════════════════════════════════
-- the_house_reads_fast_rehearsal.sql — run against PRODUCTION, rolled back.
--   node rehearse.cjs supabase/diagnostics/the_house_reads_fast_rehearsal.sql
-- ════════════════════════════════════════════════════════════════════════════
-- The speed change (e2e/load/proposed.sql) must change how fast the house is
-- read, and nothing a member is shown, except what it sets out to change:
--   · a log's counts are the same for every reader (a sealed member's
--     certification was hidden from those they had not admitted);
--   · a salon's unread count stops at 100 and skips authors hidden from the
--     member, as the room does.
-- Every member is asked every read before and after; each line below says
-- what must hold, and the number that must be 0 is printed beside it.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TEMP TABLE r_members AS SELECT id FROM public.profiles;
CREATE TEMP TABLE r_feed (phase text, member uuid, fn text, pos bigint, id uuid, certify int, critique int, certified boolean);
CREATE TEMP TABLE r_unread (phase text, member uuid, lounge uuid, n bigint, last_at timestamptz);
CREATE TEMP TABLE r_rows (phase text, member uuid, tbl text, n bigint, h text);
GRANT SELECT ON r_members TO authenticated, anon;
GRANT ALL ON r_feed, r_unread, r_rows TO authenticated, anon;

-- Production has no block and no sealed member, so on its own data a hiding or
-- privacy rule could be wrong and every line below still read 0. The cases are
-- made first (rolled back with the rest): the most-notified member V blocks the
-- house's busiest author, is blocked by the second, mutes the third; and the
-- member who certified most is sealed.
CREATE TEMP TABLE r_authors AS
SELECT a.user_id, row_number() OVER (ORDER BY count(*) DESC, a.user_id) AS rank
  FROM (SELECT user_id FROM public.dispatch_posts UNION ALL SELECT user_id FROM public.log_comments
        UNION ALL SELECT user_id FROM public.dispatch_comments UNION ALL SELECT user_id FROM public.logs
        UNION ALL SELECT user_id FROM public.lounge_messages) a
 WHERE a.user_id IS NOT NULL
 GROUP BY a.user_id;
CREATE TEMP TABLE r_case AS
SELECT (SELECT n.user_id FROM public.notifications n
         WHERE n.from_user_id IS NOT NULL AND n.user_id NOT IN (SELECT user_id FROM r_authors WHERE rank <= 3)
         GROUP BY n.user_id ORDER BY count(*) DESC, n.user_id LIMIT 1) AS viewer,
       (SELECT user_id FROM r_authors WHERE rank = 1) AS blocked_by_viewer,
       (SELECT user_id FROM r_authors WHERE rank = 2) AS blocks_viewer,
       (SELECT user_id FROM r_authors WHERE rank = 3) AS muted_by_viewer,
       (SELECT i.user_id FROM public.interactions i WHERE i.type = 'endorse_log'
         GROUP BY i.user_id ORDER BY count(*) DESC, i.user_id LIMIT 1) AS sealed;
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
SELECT viewer, blocked_by_viewer, 'block' FROM r_case
UNION ALL SELECT blocks_viewer, viewer, 'block' FROM r_case
UNION ALL SELECT viewer, muted_by_viewer, 'mute' FROM r_case;
UPDATE public.profiles SET is_social_private = true WHERE id = (SELECT sealed FROM r_case);
-- And in a salon: a member mutes someone who has written there since they last read.
INSERT INTO public.user_blocks (blocker_id, blocked_id, type)
SELECT lm.user_id, m.user_id, 'mute'
  FROM public.lounge_members lm
  JOIN public.lounge_messages m ON m.lounge_id = lm.lounge_id AND m.user_id <> lm.user_id
   AND (lm.last_read_at IS NULL OR m.created_at > lm.last_read_at)
 WHERE NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.blocker_id = lm.user_id AND b.blocked_id = m.user_id)
 ORDER BY lm.lounge_id, lm.user_id, m.created_at
 LIMIT 1;
SELECT 'cases made: blocks, sealed members' AS what,
       (SELECT count(*) FROM public.user_blocks) AS blocks,
       (SELECT count(*) FROM public.profiles WHERE is_social_private) AS sealed;

SELECT set_config('r.phase', 'before', true);
\ir the_house_reads_fast_capture.sql

\ir ../../e2e/load/proposed.sql

SELECT set_config('r.phase', 'after', true);
\ir the_house_reads_fast_capture.sql

\echo '── what every reader is shown ──'
SELECT 'members asked' AS what, count(*) FROM r_members
UNION ALL SELECT 'feed rows before', count(*) FROM r_feed WHERE phase = 'before'
UNION ALL SELECT 'feed rows after', count(*) FROM r_feed WHERE phase = 'after';

-- Same entries, same order, for every member and every feed (must be 0).
SELECT 'feed entries or order changed (must be 0)' AS what, count(*) FROM (
  (SELECT member, fn, pos, id FROM r_feed WHERE phase = 'before'
   EXCEPT SELECT member, fn, pos, id FROM r_feed WHERE phase = 'after')
  UNION ALL
  (SELECT member, fn, pos, id FROM r_feed WHERE phase = 'after'
   EXCEPT SELECT member, fn, pos, id FROM r_feed WHERE phase = 'before')
) d;

-- The member's own heart, unchanged (must be 0).
SELECT 'certified flag changed (must be 0)' AS what, count(*)
  FROM r_feed b JOIN r_feed a ON a.phase = 'after' AND b.phase = 'before'
   AND a.member IS NOT DISTINCT FROM b.member AND a.fn = b.fn AND a.pos = b.pos
 WHERE a.certified IS DISTINCT FROM b.certified;

-- Stacks are not touched in what they count (must be 0).
SELECT 'stack counts changed (must be 0)' AS what, count(*)
  FROM r_feed b JOIN r_feed a ON a.phase = 'after' AND b.phase = 'before'
   AND a.member IS NOT DISTINCT FROM b.member AND a.fn = b.fn AND a.pos = b.pos
 WHERE b.fn LIKE 'stacks%' AND (a.certify, a.critique) IS DISTINCT FROM (b.certify, b.critique);

-- A log's counts after: the true totals, for every reader (must be 0).
SELECT 'log counts not the true total (must be 0)' AS what, count(*)
  FROM r_feed a
 WHERE a.phase = 'after' AND a.fn IN ('following', 'house')
   AND (a.certify, a.critique) IS DISTINCT FROM (
     (SELECT count(*)::int FROM public.interactions i WHERE i.target_log_id = a.id AND i.type = 'endorse_log'),
     (SELECT count(*)::int FROM public.log_comments c WHERE c.log_id = a.id));

-- …and where they moved, it is only because a reader could not see a mark before.
SELECT 'log counts that moved (each a mark the reader could not see)' AS what, count(*)
  FROM r_feed b JOIN r_feed a ON a.phase = 'after' AND b.phase = 'before'
   AND a.member IS NOT DISTINCT FROM b.member AND a.fn = b.fn AND a.pos = b.pos
 WHERE b.fn IN ('following', 'house') AND (a.certify, a.critique) IS DISTINCT FROM (b.certify, b.critique);
SELECT 'a count that went DOWN (must be 0)' AS what, count(*)
  FROM r_feed b JOIN r_feed a ON a.phase = 'after' AND b.phase = 'before'
   AND a.member IS NOT DISTINCT FROM b.member AND a.fn = b.fn AND a.pos = b.pos
 WHERE b.fn IN ('following', 'house') AND (a.certify < b.certify OR a.critique < b.critique);

-- Every row-rule table: the same rows for every reader (must be 0).
SELECT 'protected rows changed (must be 0)' AS what, count(*)
  FROM r_rows b JOIN r_rows a ON a.phase = 'after' AND b.phase = 'before'
   AND a.member IS NOT DISTINCT FROM b.member AND a.tbl = b.tbl
 WHERE (a.n, a.h) IS DISTINCT FROM (b.n, b.h);
SELECT 'protected tables compared' AS what, count(*) FROM r_rows WHERE phase = 'after';

\echo '── salon unread ──'
SELECT 'rooms compared' AS what, count(*) FROM r_unread WHERE phase = 'after';
SELECT 'rooms whose list changed (must be 0)' AS what, count(*) FROM (
  (SELECT member, lounge FROM r_unread WHERE phase = 'before' EXCEPT SELECT member, lounge FROM r_unread WHERE phase = 'after')
  UNION ALL
  (SELECT member, lounge FROM r_unread WHERE phase = 'after' EXCEPT SELECT member, lounge FROM r_unread WHERE phase = 'before')
) d;
SELECT 'last message time changed (must be 0)' AS what, count(*)
  FROM r_unread b JOIN r_unread a ON a.phase = 'after' AND b.phase = 'before' AND a.member = b.member AND a.lounge = b.lounge
 WHERE a.last_at IS DISTINCT FROM b.last_at;
-- After = the room's unread, minus authors hidden from the member, at most 100.
SELECT 'unread not as the room shows it (must be 0)' AS what, count(*)
  FROM r_unread a
  JOIN public.lounge_members lm ON lm.lounge_id = a.lounge AND lm.user_id = a.member
  JOIN public.lounges l ON l.id = a.lounge
 WHERE a.phase = 'after'
   AND a.n <> CASE WHEN NOT l.is_private OR lm.status = 'approved' THEN LEAST(100, (
     SELECT count(*) FROM public.lounge_messages m
      WHERE m.lounge_id = a.lounge AND m.user_id <> a.member
        AND (lm.last_read_at IS NULL OR m.created_at > lm.last_read_at)
        AND NOT EXISTS (SELECT 1 FROM public.user_blocks ub
                         WHERE (ub.blocker_id = a.member AND ub.blocked_id = m.user_id)
                            OR (ub.blocker_id = m.user_id AND ub.blocked_id = a.member AND ub.type = 'block'))))
   ELSE 0 END;
SELECT 'unread that moved (hidden authors, or past 100)' AS what, count(*)
  FROM r_unread b JOIN r_unread a ON a.phase = 'after' AND b.phase = 'before' AND a.member = b.member AND a.lounge = b.lounge
 WHERE a.n <> b.n;

\echo '── the kept counts ──'
SELECT 'logs whose kept count is not the true total (must be 0)' AS what, count(*)
  FROM public.logs l LEFT JOIN public.log_counts c ON c.log_id = l.id
 WHERE (COALESCE(c.certify_count, 0), COALESCE(c.critique_count, 0)) IS DISTINCT FROM (
   (SELECT count(*)::int FROM public.interactions i WHERE i.target_log_id = l.id AND i.type = 'endorse_log'),
   (SELECT count(*)::int FROM public.log_comments k WHERE k.log_id = l.id));
SELECT 'logs with a kept count' AS what, count(*) FROM public.log_counts;

-- The triggers keep it: a certification and a critique, made and taken back.
CREATE TEMP TABLE r_pick AS
SELECT l.id AS log_id, p.id AS member
  FROM public.logs l
  JOIN public.profiles p ON p.id <> l.user_id
 WHERE NOT EXISTS (SELECT 1 FROM public.interactions i WHERE i.target_log_id = l.id AND i.user_id = p.id AND i.type = 'endorse_log')
 ORDER BY l.created_at DESC, p.id
 LIMIT 1;
CREATE TEMP TABLE r_kept (step text, certify int, critique int);
INSERT INTO r_kept SELECT 'at first', COALESCE(c.certify_count, 0), COALESCE(c.critique_count, 0) FROM r_pick k LEFT JOIN public.log_counts c ON c.log_id = k.log_id;
INSERT INTO public.interactions (user_id, target_log_id, type) SELECT member, log_id, 'endorse_log' FROM r_pick;
INSERT INTO r_kept SELECT 'certified', c.certify_count, c.critique_count FROM r_pick k JOIN public.log_counts c ON c.log_id = k.log_id;
INSERT INTO public.log_comments (log_id, user_id, username, body) SELECT k.log_id, k.member, p.username, 'rehearsal' FROM r_pick k JOIN public.profiles p ON p.id = k.member;
INSERT INTO r_kept SELECT 'critiqued', c.certify_count, c.critique_count FROM r_pick k JOIN public.log_counts c ON c.log_id = k.log_id;
DELETE FROM public.log_comments c USING r_pick k WHERE c.log_id = k.log_id AND c.user_id = k.member AND c.body = 'rehearsal';
DELETE FROM public.interactions i USING r_pick k WHERE i.target_log_id = k.log_id AND i.user_id = k.member AND i.type = 'endorse_log';
INSERT INTO r_kept SELECT 'both taken back', c.certify_count, c.critique_count FROM r_pick k JOIN public.log_counts c ON c.log_id = k.log_id;
SELECT step, certify, critique FROM r_kept;
SELECT 'kept counts did not follow (must be 0)' AS what, count(*) FROM (
  SELECT (SELECT certify FROM r_kept WHERE step = 'certified') - (SELECT certify FROM r_kept WHERE step = 'at first') <> 1 AS bad
  UNION ALL SELECT (SELECT critique FROM r_kept WHERE step = 'critiqued') - (SELECT critique FROM r_kept WHERE step = 'certified') <> 1
  UNION ALL SELECT (SELECT certify FROM r_kept WHERE step = 'both taken back') <> (SELECT certify FROM r_kept WHERE step = 'at first')
  UNION ALL SELECT (SELECT critique FROM r_kept WHERE step = 'both taken back') <> (SELECT critique FROM r_kept WHERE step = 'at first')
) t WHERE bad IS DISTINCT FROM false;

\echo '── what nothing can write ──'
-- Column grants are asked too: a table-level answer misses them.
SELECT 'clients may write log_counts (must be 0)' AS what, count(*)
  FROM (VALUES ('anon'), ('authenticated')) r(role), (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
 WHERE has_table_privilege(r.role, 'public.log_counts', p.priv)
    OR (p.priv IN ('INSERT', 'UPDATE') AND has_any_column_privilege(r.role, 'public.log_counts', p.priv));
SELECT 'trigger functions callable by clients (must be 0)' AS what, count(*)
  FROM (VALUES ('anon'), ('authenticated')) r(role),
       (VALUES ('public.log_counts_keep_certify()'), ('public.log_counts_keep_critique()')) f(fn)
 WHERE has_function_privilege(r.role, f.fn, 'EXECUTE');

ROLLBACK;
