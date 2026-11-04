-- ════════════════════════════════════════════════════════════════════════════
-- 20261104_02 — a salon's last word, for the Lounge's directory.
-- ════════════════════════════════════════════════════════════════════════════
--   The Lounge's directory of all salons says, on each row, when the last word
--   was said there ("2 MIN AGO"), as each of your own salons already does. Only
--   your own were known: get_lounge_unread_counts answers for the rooms a member
--   sits in. get_salon_last_words answers for the rooms the corridor lists, a
--   hundred at most: each one's newest message by an author the reader does not
--   hide, its time and nothing else (no words, no author). A signed-in member
--   only. Each answer walks lounge_messages_room_newest from the newest and
--   stops at the first it may count.
-- Undo: mobile/supabase/migrations-down/20261104_02_a_salons_last_word.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.get_salon_last_words(p_lounge_ids uuid[]) RETURNS TABLE(lounge_id uuid, last_message_at timestamp with time zone)
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

-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.get_salon_last_words(uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_salon_last_words(uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_salon_last_words(uuid[]) TO service_role;
