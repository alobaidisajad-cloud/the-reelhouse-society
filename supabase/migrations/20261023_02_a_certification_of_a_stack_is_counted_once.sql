-- ════════════════════════════════════════════════════════════════════════════
-- 20261023_02 — a certification of a stack is counted once.
-- ════════════════════════════════════════════════════════════════════════════
--   As 20261023_01, for a stack: its certification leaves target_user_id empty,
--   so nothing refused a second. A phone that drew a stack's certification it
--   did not know of as not given (a stack whose own read failed) could write it
--   again: the stack read it twice, its owner was told twice. The app answers a
--   second as already given (23505); now the house refuses it.
--
--   Built CONCURRENTLY, so members write on while it builds. The house held no
--   stack's certification twice when this was written
--   (certifications_held_twice_check.sql, 2026-10-23); a build that meets one
--   fails, and the train stops and says so. Applied alone, with apply.cjs
--   --no-transaction, and the train checks it whole.
-- Rehearsal: mobile/supabase/diagnostics/a_certification_of_a_stack_is_counted_once_rehearsal.sql
-- Undo: mobile/supabase/migrations-down/20261023_02_a_certification_of_a_stack_is_counted_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- add-only (3): it only widens or fixes: every shipped client takes a refused second certification of a stack as given — the app (stores/domain/interactionSlice.ts, 23505), the website (src/stores/films.ts and src/utils/offlineQueue.ts, a duplicate taken as given). Replayed: a member's second certification of a stack in a_certification_of_a_stack_is_counted_once_rehearsal.sql, and e2e-old-clients.yml, which the train waits on
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS interactions_endorse_list_once ON public.interactions USING btree (user_id, target_list_id) WHERE (type = 'endorse_list'::text);
