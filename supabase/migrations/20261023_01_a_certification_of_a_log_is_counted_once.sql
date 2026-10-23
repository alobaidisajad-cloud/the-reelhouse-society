-- ════════════════════════════════════════════════════════════════════════════
-- 20261023_01 — a certification of a log is counted once.
-- ════════════════════════════════════════════════════════════════════════════
--   interactions holds one key, (user_id, target_user_id, type): a certification
--   of a log leaves target_user_id empty, so nothing refused a second row of it.
--   A phone that drew a certification it did not know of as not given (a log
--   drawn from what the phone held offline, an offline queue replayed) could
--   write it again: log_counts_keep_certify counted it again, its owner was told
--   twice, and taking it back took both. The app answers a second as already
--   given (23505); now the house refuses it.
--
--   Built CONCURRENTLY, so members write on while it builds: on the load test's
--   100,000 members (two million certifications) a key built inside a
--   transaction held their writes a second and a half. The house held no
--   certification twice when this was written (certifications_held_twice_check.sql,
--   2026-10-23); a build that meets one fails, and the train stops and says so.
--   Applied alone, with apply.cjs --no-transaction, and the train checks it whole.
-- Rehearsal: mobile/supabase/diagnostics/a_certification_of_a_log_is_counted_once_rehearsal.sql
-- Undo: mobile/supabase/migrations-down/20261023_01_a_certification_of_a_log_is_counted_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- add-only (3): it only widens or fixes: every shipped client takes a refused second certification as given — the app (stores/domain/interactionSlice.ts, 23505; utils/offlineQueue.ts, a duplicate is delivered), the website (src/stores/films.ts, a "duplicate" refusal; src/utils/offlineQueue.ts, 23505 discarded). Replayed: a member's second certification in a_certification_of_a_log_is_counted_once_rehearsal.sql, and the builds in members' hands against the train (e2e-old-clients.yml, which the train waits on)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS interactions_endorse_log_once ON public.interactions USING btree (user_id, target_log_id) WHERE (type = 'endorse_log'::text);
