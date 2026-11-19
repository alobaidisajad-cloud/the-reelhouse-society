-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_26 — the house's moderators are found without reading every member.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261120_26_the_moderators_are_found_at_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── H-B2's second index · the house's moderators are found without reading every member (review round 14) ──
--   Whether any moderator may hear an appeal (private.an_appeal_may_be_heard, H-B2) asks the house's
--   moderators, a handful among every member: without an index every member's row is read each time a
--   verdict or the appeals docket is read. This one holds the moderators alone. Built without holding the
--   table (CONCURRENTLY), alone in its file, a car after H-B2 (whose function runs without it meanwhile).
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_admins ON public.profiles (id) WHERE (role = 'admin'::text);
