-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_02 — a member's push tokens are found by their member.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261119_02_the_tokens_are_found_by_their_member.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── B1's index · a member's tokens are found by their member (review round 13) ──
--   push_tokens had no index but its id and its token: every notice notify-push sends read the whole
--   table for its member's tokens, and register_push_token's ten-device rule did too. push_tokens_of
--   now reads and prunes them on every notice, so they are found by the member. Built without holding
--   the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS push_tokens_user_id ON public.push_tokens USING btree (user_id);
