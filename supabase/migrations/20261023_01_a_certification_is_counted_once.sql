-- ════════════════════════════════════════════════════════════════════════════
-- 20261023_01 — a certification is counted once.
-- ════════════════════════════════════════════════════════════════════════════
--   interactions holds one key, (user_id, target_user_id, type): a certification
--   of a log or a stack leaves target_user_id empty, so nothing refused a second
--   row of it. A phone that drew a certification it did not know of as not given
--   (a stack whose own read failed, a log drawn from what the phone held offline,
--   an offline queue replayed) wrote it again: log_counts_keep_certify counted it
--   again, a stack's count read it twice, its owner was told twice, and taking
--   it back took both. The app answers a second as already given (23505); now
--   the house refuses it.
--
--   The certifications already held twice keep their first: the later go, and
--   log_counts_keep_certify takes each from its log's count as it goes. Then the
--   keys. One transaction: no second can be written between the two. A unique
--   index on interactions builds in a moment at this size; lock_timeout lets it
--   give way rather than wait behind members' writes.
-- Rehearsal: mobile/supabase/diagnostics/a_certification_is_counted_once_rehearsal.sql
-- Undo: mobile/supabase/migrations-down/20261023_01_a_certification_is_counted_once.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DELETE FROM public.interactions
 WHERE id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (PARTITION BY user_id, target_log_id ORDER BY created_at NULLS LAST, id) AS nth
       FROM public.interactions WHERE type = 'endorse_log'
   ) held WHERE held.nth > 1);

DELETE FROM public.interactions
 WHERE id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (PARTITION BY user_id, target_list_id ORDER BY created_at NULLS LAST, id) AS nth
       FROM public.interactions WHERE type = 'endorse_list'
   ) held WHERE held.nth > 1);

-- add-only (3): it only widens or fixes: every shipped client takes a refused second certification as given — the app (stores/domain/interactionSlice.ts, 23505; utils/offlineQueue.ts, a duplicate is delivered), the website (src/stores/films.ts, a "duplicate" refusal; src/utils/offlineQueue.ts, 23505 discarded). Replayed: a member's second certification in a_certification_is_counted_once_rehearsal.sql, and the builds in members' hands against the train (e2e-old-clients.yml, which the train waits on)
CREATE UNIQUE INDEX IF NOT EXISTS interactions_endorse_log_once
  ON public.interactions USING btree (user_id, target_log_id) WHERE (type = 'endorse_log'::text);
-- add-only (3): it only widens or fixes: as above, for a stack's (interactionSlice.ts, 23505; the website's films.ts and offlineQueue.ts, a duplicate taken as given). Replayed: the rehearsal's second certification of a stack, and e2e-old-clients.yml
CREATE UNIQUE INDEX IF NOT EXISTS interactions_endorse_list_once
  ON public.interactions USING btree (user_id, target_list_id) WHERE (type = 'endorse_list'::text);
