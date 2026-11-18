-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_01 — a phone's push token names the session it was registered under.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A phone signed out elsewhere kept getting its member's pushes: a token now keeps its session, so
--      the functions of 20261119_12 send only to a token whose session still stands (review round 13).
--   A column with no default and no rule: push_tokens is held only for the instant the catalogue changes.
-- Undo: mobile/supabase/migrations-down/20261119_01_a_token_names_its_session.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B1's column · a phone's token names the session it was registered under (review round 13) ──
--   A car of its own, before B1's functions (B1.up.sql read and write it when they run). A new column
--   with no default and no rule: the table is held (ACCESS EXCLUSIVE) only for the instant the
--   catalogue changes; no row is read or rewritten. Every token already registered holds no session
--   (NULL): no row can be tied to its session after the fact (the token was registered under a JWT
--   the house never kept). Such a token is tied to its session the next time its phone opens the app or
--   comes back to the front a day after its last registration (AppBootstrapper); until then it is sent to
--   only while a session that could have registered it stands, claimed by no other phone, and for
--   at most 30 days from its last registration (push_tokens_of, B8); "Sign out of every other
--   device" takes it at once (forget_other_devices).
-- add-only (3): it only widens: a column no shipped client names, empty for every row; TestFlight build 41 and the website read push_tokens by named columns or not at all, replayed as the members themselves (B1 rehearsal)
ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS session_id uuid;

COMMENT ON COLUMN public.push_tokens.session_id IS 'The session (auth.sessions.id, the JWT''s session_id) the token was last registered under, by register_push_token. NULL: registered before round 13. push_tokens_of sends only to a token whose session still stands.';
