-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_20 — a hidden member's words never reach a reader through another member's reply or card.
-- ════════════════════════════════════════════════════════════════════════════
--   1. The house names, on each message as it is sent, the members whose words it carries (the message
--      it answers, the author of the piece its card shows, the author of a card it answers), and the
--      salon's unread count and last word leave out such a message as they leave out a hidden member's
--      own (review round 14).
--   2. The messages already written are named once, here (review round 14).
--   Functions and the one-time pass, which writes only the replies and cards that carry another's
--   words; no table is locked whole. The column and rule are 20261120_19's.
-- Undo: mobile/supabase/migrations-down/20261120_20_a_hidden_members_words_stay_hidden.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B3 · a hidden member's words never reach a reader through another member's reply or card (review round 14) ──
--   After H-B3.column (the column and the widened hiding rule), in a car of its own: functions and one
--   pass over the messages already written; no table is held whole.
--   V blocks (or mutes) B, both sitting in salon S. C answers B's message in S, or shares B's essay,
--   log or stack into S. V read C's message with B's words in full above it ("B" and the quote,
--   spoken aloud too), or a card "BY @B" with B's headline; and the same the other way, a member B
--   blocked reading B's words quoted. The house hid a message by its writer alone, and every filter on
--   the phone did the same. Now the house names, on each message as it is sent, the members whose
--   words it carries besides its writer's (whose_words_a_message_carries, written by
--   a_reply_quotes_its_message whatever the sender sent): the author of the message it answers, the
--   author of the piece its card shows (a_cards_author), and the author of a card it answers (whose
--   caption it may quote). The hiding rule (H-B3.column) hides such a message from every reader one of
--   them is hidden from, unless the message is the reader's own; the salon's unread count and its
--   last word leave it out as they leave out a hidden member's own. The messages already written are
--   named once, here.
--   A message whose quoted writer, or whose card's author, has left the house names no one for them.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_cards_author(text, jsonb);
CREATE FUNCTION public.a_cards_author(p_type text, p_metadata jsonb) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- The piece a card shows, named as the phone and the website name it in the card's metadata; a
  -- name that is not an id, or a piece no longer in the house, has no author.
  SELECT CASE p_type
           WHEN 'log_share'     THEN (SELECT l.user_id FROM public.logs l WHERE l.id = k.id)
           WHEN 'list_share'    THEN (SELECT s.user_id FROM public.lists s WHERE s.id = k.id)
           WHEN 'dossier_share' THEN (SELECT d.user_id FROM public.dispatch_posts d WHERE d.id = k.id)
         END
    FROM (SELECT CASE WHEN n.named ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      THEN n.named::uuid END AS id
            FROM (SELECT CASE p_type
                           WHEN 'log_share'     THEN coalesce(p_metadata ->> 'log_id', p_metadata ->> 'logId')
                           WHEN 'list_share'    THEN p_metadata ->> 'listId'
                           WHEN 'dossier_share' THEN coalesce(p_metadata ->> 'dossier_id', p_metadata ->> 'dossierId')
                         END AS named) n) k
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house's own trigger and its one pass alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_cards_author(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.a_cards_author(text, jsonb) TO service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.whose_words_a_message_carries(uuid, text, jsonb, uuid);
CREATE FUNCTION public.whose_words_a_message_carries(p_writer uuid, p_type text, p_metadata jsonb, p_reply_to_id uuid) RETURNS uuid[]
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- The members whose words a message carries besides its writer's: the writer of the message it
  -- answers (its quote), the author of its own card, and the author of a card it answers (a caption
  -- the website wrote carries the stack's title and its curator). NULL: none but its writer's.
  SELECT nullif(ARRAY(
    SELECT DISTINCT w.id
      FROM (SELECT public.a_cards_author(p_type, p_metadata) AS id
            UNION ALL
            SELECT q.user_id FROM public.lounge_messages q WHERE q.id = p_reply_to_id
            UNION ALL
            SELECT public.a_cards_author(q.type, q.metadata) FROM public.lounge_messages q WHERE q.id = p_reply_to_id) w
     WHERE w.id IS NOT NULL AND w.id IS DISTINCT FROM p_writer
     ORDER BY w.id), '{}'::uuid[])
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house's own trigger and its one pass alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.whose_words_a_message_carries(uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whose_words_a_message_carries(uuid, text, jsonb, uuid) TO service_role;

-- As 20261016_01 made it, and it names whose words the message carries, whatever the sender sent.
-- add-only (3): it only fixes: a message is sent and a reply quotes its message as before, the house naming whose words each carries, as the H-B3 rehearsal replays as the members themselves; TestFlight build 41 and the website never write the column
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
  ELSE
    SELECT * INTO q FROM public.lounge_messages WHERE id = NEW.reply_to_id;
    IF NOT FOUND OR q.lounge_id IS DISTINCT FROM NEW.lounge_id THEN
      RAISE EXCEPTION 'A reply answers a message of its own salon.' USING ERRCODE = '42501';
    END IF;
    NEW.reply_to_content := CASE WHEN q.deleted_at IS NULL THEN q.content END;
    NEW.reply_to_username := CASE WHEN q.user_id IS NULL THEN '[deleted]'
                                  ELSE (SELECT p.username FROM public.profiles p WHERE p.id = q.user_id) END;
  END IF;
  -- Whose words it carries besides its writer's, named by the house: the hiding rule reads it.
  NEW.carries_words_of := public.whose_words_a_message_carries(NEW.user_id, NEW.type, NEW.metadata, NEW.reply_to_id);
  RETURN NEW;
END $$;

-- As 20261116_01 made it, and a message carrying a hidden member's words is neither counted nor the last word.
-- add-only (3): it only fixes: a salon's unread count and last word as before, without a message carrying the words of a member the reader has hidden, as the H-B3 rehearsal replays as the members themselves; TestFlight build 41 and the website call it as before
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
           AND NOT COALESCE(m.carries_words_of && me.hidden, false)
         LIMIT 100
      ) unread
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

-- As 20261104_02 made it, and a message carrying a hidden member's words is not the last word.
-- add-only (3): it only fixes: a salon's last word as before, without a message carrying the words of a member the reader has hidden, as the H-B3 rehearsal replays as the members themselves; TestFlight build 41 and the website call it as before
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
         AND (m.user_id = me.id OR NOT COALESCE(m.carries_words_of && me.hidden, false))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
    ) newest
   WHERE me.id IS NOT NULL;
$$;

-- The messages already written, named once: each reply and each card of a member's piece. Only rows
-- that carry another's words are touched (a reply, or a card of a log, stack or essay); the house's
-- own write, so a_keeps_what_it_is lets it.
UPDATE public.lounge_messages m
   SET carries_words_of = public.whose_words_a_message_carries(m.user_id, m.type, m.metadata, m.reply_to_id)
 WHERE m.carries_words_of IS NULL
   AND (m.reply_to_id IS NOT NULL OR m.type IN ('log_share', 'list_share', 'dossier_share'))
   AND public.whose_words_a_message_carries(m.user_id, m.type, m.metadata, m.reply_to_id) IS NOT NULL;
