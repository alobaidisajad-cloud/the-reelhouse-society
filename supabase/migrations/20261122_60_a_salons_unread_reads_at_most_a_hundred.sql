-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_60 — a salon's unread count reads at most a hundred of its dispatches, at any size.
-- ════════════════════════════════════════════════════════════════════════════
--   get_lounge_unread_counts stopped counting at a hundred, but the planner gathered every dispatch since
--   the member's last reading (a bitmap) before the count read its first: for the member in 200 salons
--   of the load house, 33,276 index rows read to count 7,371 (34,469 rows in all, past the busy read's
--   bound of 20,000, at 100,000 members and again at 500,000; load 45042605575). The corridor
--   (get_lounge_list) reads the same counts. Now each salon reads its newest hundred dispatches since the
--   reading, from the front of its own index (lounge_messages_room_newest, the plan held: enable_bitmapscan
--   off), and counts those the member may read and did not write. So the read is at most a hundred a
--   salon, however long its history: a member in 200 salons reads at most 20,000, at any size of house.
--   A hundred counted shows as it did: the card's tag says 9+, and its spoken count "more than 99". Among
--   those hundred, the member's own dispatches and those of members they hid are not counted, so a salon
--   whose newest hundred hold some of those says the readable ones among them: never more than there are.
--   And the members hidden are asked as a set, by its hash: the member in 200 salons who hides 500 was
--   counted in 26 ms, 9 ms now (local house of 100,000).
--   One function replaced; no table is locked.
-- Undo: mobile/supabase/migrations-down/20261122_60_a_salons_unread_reads_at_most_a_hundred.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the same rooms, the same last word, each count read from the newest hundred since the reading (the rehearsal replays a room never read, one read before, a private room awaiting, one past a hundred, hidden and own words, against the old reading); TestFlight build 41 and the website read the same columns
CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts() RETURNS TABLE(lounge_id uuid, unread_count bigint, last_message_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    -- Each salon's newest hundred read from the front of its index, never every dispatch since the
    -- reading gathered first (a bitmap) for a count that keeps a hundred.
    SET enable_bitmapscan TO 'off'
    AS $$
  WITH me AS (SELECT auth.uid() AS id, (SELECT private.hidden_authors()) AS hidden),
  -- The members hidden, as a set: each word counted asks it once, by its hash, never the whole list
  -- (the whale of the load house hides 500: 26 ms of its count went to walking the list for each word).
  hidden AS MATERIALIZED (SELECT h.u FROM me, unnest(me.hidden) h(u) WHERE h.u IS NOT NULL),
  rooms AS (
    SELECT lm.lounge_id, lm.last_read_at, (NOT l.is_private OR lm.status IN ('approved', 'muted')) AS readable
      FROM me
      JOIN public.lounge_members lm ON lm.user_id = me.id
      JOIN public.lounges l ON l.id = lm.lounge_id
  )
  SELECT
    r.lounge_id,
    -- The newest hundred dispatches since the reading (a room never read: its newest hundred), read in
    -- the order of lounge_messages_room_newest, so the read stops at a hundred however many there are;
    -- then those the member may read and did not write counted. A room read before is read from that
    -- moment alone: one test asking "never read, or since" could start nowhere.
    CASE WHEN r.readable THEN (
      CASE WHEN r.last_read_at IS NULL THEN (
        SELECT count(*) FROM (
          SELECT m.user_id, m.carries_words_of FROM public.lounge_messages m
           WHERE m.lounge_id = r.lounge_id
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT 100
        ) w
         WHERE w.user_id <> me.id
           AND w.user_id NOT IN (SELECT h.u FROM hidden h)
           AND NOT COALESCE(w.carries_words_of && me.hidden, false)
      ) ELSE (
        SELECT count(*) FROM (
          SELECT m.user_id, m.carries_words_of FROM public.lounge_messages m
           WHERE m.lounge_id = r.lounge_id
             AND m.created_at > r.last_read_at
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT 100
        ) w
         WHERE w.user_id <> me.id
           AND w.user_id NOT IN (SELECT h.u FROM hidden h)
           AND NOT COALESCE(w.carries_words_of && me.hidden, false)
      ) END
    ) ELSE 0 END AS unread_count,
    -- The last word the member can read: one from a member they hid moved the card to the front
    -- and said "LAST WORD 1M AGO" over a room with nothing new in it (review round 8); one carrying
    -- a hidden member's words is not one they can read either (review round 14).
    CASE WHEN r.readable THEN (
      SELECT m.created_at FROM public.lounge_messages m
       WHERE m.lounge_id = r.lounge_id
         AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
         AND (m.user_id = me.id OR NOT COALESCE(m.carries_words_of && me.hidden, false))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
    ) END AS last_message_at
  FROM rooms r CROSS JOIN me;
$$;
