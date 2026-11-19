-- Undo of 20261120_20: a hidden member's words never reach a reader through another member's reply or card, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B3 undone · the house names no one a message carries, and counts as before ──
--   Before H-B3.column.down.sql (the column goes there). The names written stay until the column goes.

-- add-only (1): no shipped client uses it: the trigger's function as 20261016_01 made it, put back (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.a_reply_quotes_its_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  q public.lounge_messages%ROWTYPE;
BEGIN
  IF NEW.reply_to_id IS NULL THEN
    NEW.reply_to_content := NULL;
    NEW.reply_to_username := NULL;
    RETURN NEW;
  END IF;
  SELECT * INTO q FROM public.lounge_messages WHERE id = NEW.reply_to_id;
  IF NOT FOUND OR q.lounge_id IS DISTINCT FROM NEW.lounge_id THEN
    RAISE EXCEPTION 'A reply answers a message of its own salon.' USING ERRCODE = '42501';
  END IF;
  NEW.reply_to_content := CASE WHEN q.deleted_at IS NULL THEN q.content END;
  NEW.reply_to_username := CASE WHEN q.user_id IS NULL THEN '[deleted]'
                                ELSE (SELECT p.username FROM public.profiles p WHERE p.id = q.user_id) END;
  RETURN NEW;
END $$;

-- add-only (1): no shipped client uses it: the function as 20261116_01 made it, put back (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts() RETURNS TABLE(lounge_id uuid, unread_count bigint, last_message_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT auth.uid() AS id, public.hidden_authors() AS hidden),
  rooms AS (
    SELECT lm.lounge_id, lm.last_read_at, (NOT l.is_private OR lm.status IN ('approved', 'muted')) AS readable
      FROM me
      JOIN public.lounge_members lm ON lm.user_id = me.id
      JOIN public.lounges l ON l.id = lm.lounge_id
  )
  SELECT
    r.lounge_id,
    CASE WHEN r.readable THEN (
      SELECT count(*) FROM (
        SELECT 1 FROM public.lounge_messages m
         WHERE m.lounge_id = r.lounge_id
           AND m.user_id <> me.id
           AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
           AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
         LIMIT 100
      ) unread
    ) ELSE 0 END AS unread_count,
    -- The last word the member can read: one from a member they hid moved the card to the front
    -- and said "LAST WORD 1M AGO" over a room with nothing new in it (review round 8).
    CASE WHEN r.readable THEN (
      SELECT m.created_at FROM public.lounge_messages m
       WHERE m.lounge_id = r.lounge_id
         AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
    ) END AS last_message_at
  FROM rooms r CROSS JOIN me;
$$;

-- add-only (1): no shipped client uses it: the function as 20261104_02 made it, put back (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.get_salon_last_words(p_lounge_ids uuid[]) RETURNS TABLE(lounge_id uuid, last_message_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT auth.uid() AS id, public.hidden_authors() AS hidden)
  SELECT l.id, newest.created_at
    FROM me
    JOIN public.lounges l ON l.id = ANY (p_lounge_ids[1:100])
    CROSS JOIN LATERAL (
      SELECT m.created_at
        FROM public.lounge_messages m
       WHERE m.lounge_id = l.id
         AND NOT COALESCE(m.user_id = ANY (me.hidden), false)
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
    ) newest
   WHERE me.id IS NOT NULL;
$$;

-- add-only (1): no shipped client uses it: a function round 14 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.whose_words_a_message_carries(uuid, text, jsonb, uuid);
-- add-only (1): no shipped client uses it: a function round 14 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_cards_author(text, jsonb);
