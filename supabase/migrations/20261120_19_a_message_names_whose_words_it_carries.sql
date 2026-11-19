-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_19 — a salon message names whose words it carries, and the hiding rule reads it.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A member's words reached the members hidden from them through another member's reply or card:
--      each message names whose words it carries besides its writer's (carries_words_of), its writer
--      cannot change it, and the hiding rule leaves out a message carrying the words of one hidden from
--      the reader (review round 14).
--   A car of its own, before 20261120_20, which fills the column: a column with no default, a trigger and a
--   rule, so lounge_messages is held only for the instant the catalogue changes; no row is read or
--   rewritten.
-- Undo: mobile/supabase/migrations-down/20261120_19_a_message_names_whose_words_it_carries.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B3's column · a salon message names whose words it carries, and the hiding rule reads it (review round 14) ──
--   A car of its own, BEFORE H-B3's functions (H-B3.up.sql writes the column when a message is sent,
--   and fills it once for the messages already written). Every statement here is brief: the table is
--   held only while the catalogue changes; no row is read or rewritten.
--   A member's words reached the members who blocked or muted them, and the members they blocked,
--   through another member's message: a reply carries the words it answers (the house copies them into
--   the reply, a_reply_quotes_its_message) and a shared card carries its piece's headline and its
--   author's handle. The hiding rule (lounge_messages_hide_blocked) hid a message by its writer alone,
--   so C's reply quoting B, or C's card of B's essay, showed B's words in full to the one B is hidden
--   from, over every read and every live message alike. Now:
--   1. each message names the members whose words it carries besides its writer's (carries_words_of):
--      the one it answers, the author of the piece its card shows, and the author of a card it answers;
--   2. a member never reads a message carrying the words of one hidden from them (the same rule as a
--      message by them: blocked, muted, or blocking the reader), unless the message is their own;
--      Realtime asks the same rule of every live message, so none reaches the phone either;
--   3. a member cannot change what their own message names (a_keeps_what_it_is keeps it, as it keeps
--      the words themselves); the house's own writes may.
--   Until H-B3.up.sql fills it, the column is empty for every message and the rule reads as before.

-- add-only (3): it only widens: a column no shipped client names, empty for every row until the house fills it; TestFlight build 41 and the website read lounge_messages by named columns, replayed as the members themselves (H-B3.column rehearsal)
ALTER TABLE public.lounge_messages ADD COLUMN IF NOT EXISTS carries_words_of uuid[];

COMMENT ON COLUMN public.lounge_messages.carries_words_of IS 'The members whose words this message carries besides its writer''s: the author of the message it answers (its quote), the author of the piece its card shows, the author of a card it answers. Written by the house alone (a_reply_quotes_its_message on insert; a_keeps_what_it_is keeps it from its writer). NULL: none. lounge_messages_hide_blocked hides a message carrying the words of one hidden from the reader, unless it is the reader''s own.';

-- As 20261015_06 made it, the message's new column kept with the rest: its writer may not change whom it names.
-- add-only (3): it only fixes: an update of one's own message keeps every column it kept, and the new one too; TestFlight build 41 and the website never write the column, replayed as the members themselves (H-B3.column rehearsal)
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.lounge_messages FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('lounge_id', 'user_id', 'content', 'type', 'metadata', 'reply_to_id', 'reply_to_content', 'reply_to_username', 'film_id', 'film_title', 'film_poster', 'created_at', 'deleted_at', 'carries_words_of');

-- As 20261015_07 wrote it, widened: a message carrying the words of one hidden from the reader is hidden
-- as theirs is, unless it is the reader's own. Each list asked once per statement.
-- add-only (3): it only fixes: every message read as before but one carrying a hidden member's words, empty for every row until H-B3 fills them; TestFlight build 41 and the website read the salon through this rule, replayed as the members themselves (H-B3.column and H-B3 rehearsals)
ALTER POLICY lounge_messages_hide_blocked ON public.lounge_messages
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false))
     AND ((user_id = ( SELECT auth.uid() AS uid))
       OR (NOT COALESCE((carries_words_of && (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false))));
