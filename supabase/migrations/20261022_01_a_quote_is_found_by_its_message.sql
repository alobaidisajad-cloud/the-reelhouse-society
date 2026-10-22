-- ════════════════════════════════════════════════════════════════════════════
-- 20261022_01 — a quote is found by the message it quotes.
-- ════════════════════════════════════════════════════════════════════════════
--   A salon message's quotes are found by reply_to_id: when a message is
--   withdrawn its quotes are blanked (a_withdrawn_message_leaves_its_quotes,
--   20261016_01), and when a member leaves their name is taken from every
--   quote of their words (request_account_deletion, 20261016_02). With no
--   index each of those read every message of every salon: on the load test's
--   100,000 members, a closing account held the train's locks a second.
--   Built CONCURRENTLY, so members write on while it builds: it is applied
--   alone, with apply.cjs --no-transaction, and the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261022_01_a_quote_is_found_by_its_message.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS lounge_messages_reply_to_id ON public.lounge_messages USING btree (reply_to_id);
