-- ════════════════════════════════════════════════════════════════════════════
-- 20261122_20 — a member's films seen again are found by the month, never by their whole record.
-- ════════════════════════════════════════════════════════════════════════════
--   Built CONCURRENTLY, so members read and write on while it builds: applied alone, outside any
--   transaction, in its own turn by name; the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261122_20_a_members_viewings_again_are_found_by_the_month.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- ── the logs of films seen again, by the months of their earlier viewings ──
--   Each log that holds earlier viewings, under each of its keys (private.viewing_months,
--   20261122_19: `<member>/<YYYY-MM>`), so the logs a member saw again in a span are found by the
--   span's keys, as many as that span holds, however long the member's record. A log seen once holds
--   no earlier viewing and is not in it. calendar_days and year_viewings read by it from 20261122_21.
--   Built without holding the table (CONCURRENTLY), alone in its file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS logs_seen_again_by_month ON public.logs USING gin (private.viewing_months(user_id, viewing_history, created_at)) WHERE jsonb_typeof(viewing_history) = 'array' AND viewing_history <> '[]'::jsonb;
