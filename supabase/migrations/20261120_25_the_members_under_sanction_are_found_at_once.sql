-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_25 — the members under a ban or a suspension are found without reading every member.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261120_25_the_members_under_sanction_are_found_at_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-B2's index · the members under a ban or a suspension are found without reading every member (review round 14) ──
--   The Tribunal's SANCTIONS list (get_sanctioned_members) names the members a ban or a suspension holds
--   now, by handle, a page at a time, so an admin can lift one: a banned member may have no case open to
--   reach them by. Without an index every member's row is read for the few under sanction. This one holds
--   only the members ever banned or suspended (a lifted one leaves it: lift_sanction empties both), in
--   the list's own order. Built without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_under_sanction ON public.profiles (lower(coalesce(username, ''::text)), id) WHERE (is_banned OR (suspended_until IS NOT NULL));
