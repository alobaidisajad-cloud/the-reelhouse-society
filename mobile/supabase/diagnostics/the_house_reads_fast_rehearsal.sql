-- ════════════════════════════════════════════════════════════════════════════
-- the_house_reads_fast_rehearsal.sql — 20261003_03 and e2e/load/proposed.sql. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/the_house_reads_fast_rehearsal.sql
--
-- A speed change (e2e/load/proposed.sql, applied between the two reads, empty
-- when nothing is under measurement) must change how fast the house is read,
-- and nothing a member is shown, except what it sets out to change:
--   · a log's counts are the same for every reader (a sealed member's
--     certification is never hidden from those they had not admitted);
--   · a salon's unread count stops at 100 and skips authors hidden from the
--     member, as the room does.
-- Every member is asked every read before and after; then the kept counts are
-- checked against the truth, and against a mark made and taken back.
-- Production runs it by hand; db-integration.yml runs it on the sealed copy
-- (e2e/db/rehearsals.mjs). Read each NOTICE as  case|expected|got ; the last
-- line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

CREATE TEMP TABLE r_members ON COMMIT DROP AS SELECT id FROM public.profiles;
CREATE TEMP TABLE r_feed (phase text, member uuid, fn text, pos bigint, id uuid, certify int, critique int, certified boolean) ON COMMIT DROP;
CREATE TEMP TABLE r_unread (phase text, member uuid, lounge uuid, n bigint, last_at timestamptz) ON COMMIT DROP;
CREATE TEMP TABLE r_rows (phase text, member uuid, tbl text, n bigint, h text) ON COMMIT DROP;
GRANT SELECT ON r_members TO authenticated, anon;
GRANT ALL ON r_feed, r_unread, r_rows TO authenticated, anon;

-- A house may have no block and no sealed member, and on such data a hiding
-- or privacy rule could be wrong and every case below still hold. The cases
-- are made first (rolled back with the rest): the most-notified member V blocks
-- the house's busiest author, is blocked by the second, mutes the third; and
-- the member who certified most is sealed.
CREATE TEMP TABLE r_authors ON COMMIT DROP AS
SELECT a.user_id, row_number() OVER (ORDER BY count(*) DESC, a.user_id) AS rank
  FROM (SELECT user_id FROM public.dispatch_posts UNION ALL SELECT user_id FROM public.log_comments
        UNION ALL SELECT user_id FROM public.dispatch_comments UNION ALL SELECT user_id FROM public.logs
        UNION ALL SELECT user_id FROM public.lounge_messages) a
 WHERE a.user_id IS NOT NULL
 GROUP BY a.user_id;
CREATE TEMP TABLE r_case ON COMMIT DROP AS
SELECT (SELECT n.user_id FROM public.notifications n
         WHERE n.from_user_id IS NOT NULL AND n.user_id NOT IN (SELECT user_id FROM r_authors WHERE rank <= 3)
         GROUP BY n.user_id ORDER BY count(*) DESC, n.user_id LIMIT 1) AS viewer,
       (SELECT user_id FROM r_authors WHERE rank = 1) AS blocked_by_viewer,
       (SELECT user_id FROM r_authors WHERE rank = 2) AS blocks_viewer,
       (SELECT user_id FROM r_authors WHERE rank = 3) AS muted_by_viewer,
       (SELECT i.user_id FROM public.interactions i WHERE i.type = 'endorse_log'
         GROUP BY i.user_id ORDER BY count(*) DESC, i.user_id LIMIT 1) AS sealed;
DO $$ BEGIN
  PERFORM pg_temp.rh_found('a notified member outside the three busiest authors', (SELECT viewer FROM r_case));
  PERFORM pg_temp.rh_need('authors', (SELECT count(*) FROM r_authors), 3);
  PERFORM pg_temp.rh_found('a member who has certified a log', (SELECT sealed FROM r_case));
END $$;
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
DO $$ BEGIN
  RAISE NOTICE 'cases made: % blocks and mutes, % sealed members',
    (SELECT count(*) FROM public.user_blocks), (SELECT count(*) FROM public.profiles WHERE is_social_private);
END $$;

SELECT set_config('r.phase', 'before', true) AS done \gset rh_
\ir the_house_reads_fast_capture.sql

\ir ../../e2e/load/proposed.sql

SELECT set_config('r.phase', 'after', true) AS done \gset rh_
\ir the_house_reads_fast_capture.sql

-- ── what every reader is shown ──────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE 'members asked: %; feed rows before: %, after: %', (SELECT count(*) FROM r_members),
    (SELECT count(*) FROM r_feed WHERE phase = 'before'), (SELECT count(*) FROM r_feed WHERE phase = 'after');
  PERFORM pg_temp.rh_need('feed row read after the change', (SELECT count(*) FROM r_feed WHERE phase = 'after'), 1);

  -- Same entries, same order, for every member and every feed.
  PERFORM pg_temp.rh_case('feed entries or order changed', '0', (SELECT count(*)::text FROM (
    (SELECT member, fn, pos, id FROM r_feed WHERE phase = 'before'
     EXCEPT SELECT member, fn, pos, id FROM r_feed WHERE phase = 'after')
    UNION ALL
    (SELECT member, fn, pos, id FROM r_feed WHERE phase = 'after'
     EXCEPT SELECT member, fn, pos, id FROM r_feed WHERE phase = 'before')) d));

  -- The member's own heart, unchanged.
  PERFORM pg_temp.rh_case('certified flag changed', '0', (SELECT count(*)::text
    FROM r_feed b JOIN r_feed a ON a.phase = 'after' AND b.phase = 'before'
     AND a.member IS NOT DISTINCT FROM b.member AND a.fn = b.fn AND a.pos = b.pos
   WHERE a.certified IS DISTINCT FROM b.certified));

  -- Stacks are not touched in what they count.
  PERFORM pg_temp.rh_case('stack counts changed', '0', (SELECT count(*)::text
    FROM r_feed b JOIN r_feed a ON a.phase = 'after' AND b.phase = 'before'
     AND a.member IS NOT DISTINCT FROM b.member AND a.fn = b.fn AND a.pos = b.pos
   WHERE b.fn LIKE 'stacks%' AND (a.certify, a.critique) IS DISTINCT FROM (b.certify, b.critique)));

  -- A log's counts after: the true totals, for every reader.
  PERFORM pg_temp.rh_case('log counts not the true total', '0', (SELECT count(*)::text
    FROM r_feed a
   WHERE a.phase = 'after' AND a.fn IN ('following', 'house')
     AND (a.certify, a.critique) IS DISTINCT FROM (
       (SELECT count(*)::int FROM public.interactions i WHERE i.target_log_id = a.id AND i.type = 'endorse_log'),
       (SELECT count(*)::int FROM public.log_comments c WHERE c.log_id = a.id))));

  -- …and where they moved, it is only because a reader could not see a mark before.
  RAISE NOTICE 'log counts that moved (each a mark the reader could not see): %', (SELECT count(*)
    FROM r_feed b JOIN r_feed a ON a.phase = 'after' AND b.phase = 'before'
     AND a.member IS NOT DISTINCT FROM b.member AND a.fn = b.fn AND a.pos = b.pos
   WHERE b.fn IN ('following', 'house') AND (a.certify, a.critique) IS DISTINCT FROM (b.certify, b.critique));
  PERFORM pg_temp.rh_case('a count that went DOWN', '0', (SELECT count(*)::text
    FROM r_feed b JOIN r_feed a ON a.phase = 'after' AND b.phase = 'before'
     AND a.member IS NOT DISTINCT FROM b.member AND a.fn = b.fn AND a.pos = b.pos
   WHERE b.fn IN ('following', 'house') AND (a.certify < b.certify OR a.critique < b.critique)));

  -- Every row-rule table: the same rows for every reader.
  PERFORM pg_temp.rh_need('protected table read after the change', (SELECT count(*) FROM r_rows WHERE phase = 'after'), 1);
  PERFORM pg_temp.rh_case('protected rows changed (of ' || (SELECT count(*) FROM r_rows WHERE phase = 'after') || ' tables compared)', '0',
    (SELECT count(*)::text
       FROM r_rows b JOIN r_rows a ON a.phase = 'after' AND b.phase = 'before'
        AND a.member IS NOT DISTINCT FROM b.member AND a.tbl = b.tbl
      WHERE (a.n, a.h) IS DISTINCT FROM (b.n, b.h)));
END $$;

-- ── salon unread ────────────────────────────────────────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.rh_need('salon whose unread is read', (SELECT count(*) FROM r_unread WHERE phase = 'after'), 1);
  PERFORM pg_temp.rh_case('rooms whose list changed (of ' || (SELECT count(*) FROM r_unread WHERE phase = 'after') || ' compared)', '0',
    (SELECT count(*)::text FROM (
      (SELECT member, lounge FROM r_unread WHERE phase = 'before' EXCEPT SELECT member, lounge FROM r_unread WHERE phase = 'after')
      UNION ALL
      (SELECT member, lounge FROM r_unread WHERE phase = 'after' EXCEPT SELECT member, lounge FROM r_unread WHERE phase = 'before')) d));
  PERFORM pg_temp.rh_case('last message time changed', '0', (SELECT count(*)::text
    FROM r_unread b JOIN r_unread a ON a.phase = 'after' AND b.phase = 'before' AND a.member = b.member AND a.lounge = b.lounge
   WHERE a.last_at IS DISTINCT FROM b.last_at));
  -- After = the room's unread, minus authors hidden from the member, at most 100.
  PERFORM pg_temp.rh_case('unread not as the room shows it', '0', (SELECT count(*)::text
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
     ELSE 0 END));
  RAISE NOTICE 'unread that moved (hidden authors, or past 100): %', (SELECT count(*)
    FROM r_unread b JOIN r_unread a ON a.phase = 'after' AND b.phase = 'before' AND a.member = b.member AND a.lounge = b.lounge
   WHERE a.n <> b.n);
END $$;

-- ── the kept counts ─────────────────────────────────────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.rh_case('logs whose kept count is not the true total (of ' || (SELECT count(*) FROM public.logs) || ')', '0',
    (SELECT count(*)::text
       FROM public.logs l LEFT JOIN public.log_counts c ON c.log_id = l.id
      WHERE (COALESCE(c.certify_count, 0), COALESCE(c.critique_count, 0)) IS DISTINCT FROM (
        (SELECT count(*)::int FROM public.interactions i WHERE i.target_log_id = l.id AND i.type = 'endorse_log'),
        (SELECT count(*)::int FROM public.log_comments k WHERE k.log_id = l.id))));
  RAISE NOTICE 'logs with a kept count: %', (SELECT count(*) FROM public.log_counts);
END $$;

-- The triggers keep it: a certification and a critique, made and taken back.
CREATE TEMP TABLE r_pick ON COMMIT DROP AS
SELECT l.id AS log_id, p.id AS member
  FROM public.logs l
  JOIN public.profiles p ON p.id <> l.user_id
 WHERE NOT EXISTS (SELECT 1 FROM public.interactions i WHERE i.target_log_id = l.id AND i.user_id = p.id AND i.type = 'endorse_log')
 ORDER BY l.created_at DESC, p.id
 LIMIT 1;
SELECT pg_temp.rh_need('log another member has not certified', (SELECT count(*) FROM r_pick), 1) AS done \gset rh_
CREATE TEMP TABLE r_kept (step text, certify int, critique int) ON COMMIT DROP;
INSERT INTO r_kept SELECT 'at first', COALESCE(c.certify_count, 0), COALESCE(c.critique_count, 0) FROM r_pick k LEFT JOIN public.log_counts c ON c.log_id = k.log_id;
INSERT INTO public.interactions (user_id, target_log_id, type) SELECT member, log_id, 'endorse_log' FROM r_pick;
INSERT INTO r_kept SELECT 'certified', c.certify_count, c.critique_count FROM r_pick k JOIN public.log_counts c ON c.log_id = k.log_id;
INSERT INTO public.log_comments (log_id, user_id, username, body) SELECT k.log_id, k.member, p.username, 'rehearsal' FROM r_pick k JOIN public.profiles p ON p.id = k.member;
INSERT INTO r_kept SELECT 'critiqued', c.certify_count, c.critique_count FROM r_pick k JOIN public.log_counts c ON c.log_id = k.log_id;
DELETE FROM public.log_comments c USING r_pick k WHERE c.log_id = k.log_id AND c.user_id = k.member AND c.body = 'rehearsal';
DELETE FROM public.interactions i USING r_pick k WHERE i.target_log_id = k.log_id AND i.user_id = k.member AND i.type = 'endorse_log';
INSERT INTO r_kept SELECT 'both taken back', c.certify_count, c.critique_count FROM r_pick k JOIN public.log_counts c ON c.log_id = k.log_id;
DO $$ BEGIN
  PERFORM pg_temp.rh_case('the kept counts follow a mark made and taken back (at first, certified, critiqued, both taken back)',
    (SELECT format('%s/%s, %s/%s, %s/%s, %s/%s', c0, k0, c0 + 1, k0, c0 + 1, k0 + 1, c0, k0)
       FROM (SELECT certify AS c0, critique AS k0 FROM r_kept WHERE step = 'at first') f),
    (SELECT string_agg(coalesce(certify::text, 'none') || '/' || coalesce(critique::text, 'none'), ', '
                       ORDER BY array_position(ARRAY['at first', 'certified', 'critiqued', 'both taken back'], step))
       FROM r_kept));
END $$;

-- ── what nothing can write ──────────────────────────────────────────────────
-- Column grants are asked too: a table-level answer misses them.
DO $$ BEGIN
  PERFORM pg_temp.rh_case('clients may write log_counts', '0', (SELECT count(*)::text
    FROM (VALUES ('anon'), ('authenticated')) r(role), (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
   WHERE has_table_privilege(r.role, 'public.log_counts', p.priv)
      OR (p.priv IN ('INSERT', 'UPDATE') AND has_any_column_privilege(r.role, 'public.log_counts', p.priv))));
  PERFORM pg_temp.rh_case('trigger functions callable by clients', '0', (SELECT count(*)::text
    FROM (VALUES ('anon'), ('authenticated')) r(role),
         (VALUES ('public.log_counts_keep_certify()'), ('public.log_counts_keep_critique()')) f(fn)
   WHERE has_function_privilege(r.role, f.fn, 'EXECUTE')));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
