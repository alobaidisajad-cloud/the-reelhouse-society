-- Undo of 20261120_19: a salon message names whose words it carries, and the hiding rule reads it, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B3's column undone · the hiding rule reads the writer alone, and no message names whose words it carries ──
--   After H-B3.down.sql (its functions write the column).

-- add-only (1): no shipped client uses it: the rule as 20261015_07 wrote it, put back (TestFlight build 41 and the website checked)
ALTER POLICY lounge_messages_hide_blocked ON public.lounge_messages
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false)));

-- add-only (1): no shipped client uses it: the trigger as 20261015_06 made it, put back (TestFlight build 41 and the website checked)
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.lounge_messages FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('lounge_id', 'user_id', 'content', 'type', 'metadata', 'reply_to_id', 'reply_to_content', 'reply_to_username', 'film_id', 'film_title', 'film_poster', 'created_at', 'deleted_at');

-- add-only (1): no shipped client uses it: a column round 14 made (TestFlight build 41 and the website checked)
ALTER TABLE public.lounge_messages DROP COLUMN IF EXISTS carries_words_of;
