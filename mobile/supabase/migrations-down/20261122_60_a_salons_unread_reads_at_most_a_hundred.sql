-- Undo of 20261122_60: a salon's unread count as production holds it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: as production holds it
CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts() RETURNS TABLE(lounge_id uuid, unread_count bigint, last_message_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT auth.uid() AS id, (SELECT private.hidden_authors()) AS hidden),
  rooms AS (
    SELECT lm.lounge_id, lm.last_read_at, (NOT l.is_private OR lm.status IN ('approved', 'muted')) AS readable
      FROM me
      JOIN public.lounge_members lm ON lm.user_id = me.id
      JOIN public.lounges l ON l.id = lm.lounge_id
  )
  SELECT
    r.lounge_id,
    -- A room read before is counted from that moment alone: its index (lounge_messages_room_newest)
    -- starts there, so only the messages since are read, each from its row to ask whose words it
    -- carries. One test asking "never read, or since" could start nowhere, and read every message the
    -- room holds (291 ms for a member in 200 rooms of the load house). A room never read: all of it.
    CASE WHEN r.readable THEN (
      CASE WHEN r.last_read_at IS NULL THEN (
        SELECT count(*) FROM (
          SELECT 1 FROM public.lounge_messages m
           WHERE m.lounge_id = r.lounge_id
             AND m.user_id <> me.id
             AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
             AND NOT COALESCE(m.carries_words_of && me.hidden, false)
           LIMIT 100
        ) unread
      ) ELSE (
        SELECT count(*) FROM (
          SELECT 1 FROM public.lounge_messages m
           WHERE m.lounge_id = r.lounge_id
             AND m.created_at > r.last_read_at
             AND m.user_id <> me.id
             AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
             AND NOT COALESCE(m.carries_words_of && me.hidden, false)
           LIMIT 100
        ) unread
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
