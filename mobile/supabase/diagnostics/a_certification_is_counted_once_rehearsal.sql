-- ════════════════════════════════════════════════════════════════════════════
-- a_certification_is_counted_once_rehearsal.sql — 20261023_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_certification_is_counted_once_rehearsal.sql --with-train
--
-- With with_train set, 20261023_01 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). A member certifies another member's
-- log and another member's stack, each twice, as a phone that did not know of
-- its first would. The second of each is refused, the log's count moves by one,
-- the stack holds one certification of theirs, and no certification in the
-- house is held twice. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261023_01_a_certification_is_counted_once.sql
\endif

-- The certifier: a member in good standing. The log and the stack: another member's each.
SELECT set_config('rehearsal.certifier', pg_temp.rh_found('a member in good standing who has written a log', (
  SELECT p.id FROM public.profiles p
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
     AND EXISTS (SELECT 1 FROM public.logs l WHERE l.user_id = p.id)
   ORDER BY p.created_at, p.id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.log', pg_temp.rh_found('a log by another member', (
  SELECT l.id FROM public.logs l WHERE l.user_id <> current_setting('rehearsal.certifier')::uuid
   ORDER BY l.created_at, l.id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.stack', pg_temp.rh_found('a stack by another member', (
  SELECT s.id FROM public.lists s WHERE s.user_id <> current_setting('rehearsal.certifier')::uuid
   ORDER BY s.created_at, s.id LIMIT 1))::text, true) AS done \gset rh_

-- Their owners let anyone certify, and the certifier has certified neither yet.
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) || '{"privacy_endorsements": "everyone"}'::jsonb
 WHERE id IN (SELECT user_id FROM public.logs WHERE id = current_setting('rehearsal.log')::uuid
              UNION SELECT user_id FROM public.lists WHERE id = current_setting('rehearsal.stack')::uuid);
DELETE FROM public.interactions
 WHERE user_id = current_setting('rehearsal.certifier')::uuid
   AND ((type = 'endorse_log' AND target_log_id = current_setting('rehearsal.log')::uuid)
     OR (type = 'endorse_list' AND target_list_id = current_setting('rehearsal.stack')::uuid));

CREATE TEMP TABLE cc_before ON COMMIT DROP AS
SELECT coalesce((SELECT certify_count FROM public.log_counts WHERE log_id = current_setting('rehearsal.log')::uuid), 0) AS log_count;
CREATE TEMP TABLE cc_out (k text, got text) ON COMMIT DROP;
GRANT ALL ON cc_out TO authenticated;

-- The first of each was given an hour ago, apart: a member's interactions are kept a
-- second apart (check_interaction_rate_limit), and inside one transaction now() stands still.
INSERT INTO public.interactions (user_id, target_log_id, type, created_at)
VALUES (current_setting('rehearsal.certifier')::uuid, current_setting('rehearsal.log')::uuid, 'endorse_log', now() - interval '61 minutes');
INSERT INTO public.interactions (user_id, target_list_id, type, created_at)
VALUES (current_setting('rehearsal.certifier')::uuid, current_setting('rehearsal.stack')::uuid, 'endorse_list', now() - interval '60 minutes');

-- The second of each, as the app writes it: a phone that knew nothing of the first.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.certifier'), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
BEGIN
  INSERT INTO public.interactions (user_id, target_log_id, type)
  VALUES (current_setting('rehearsal.certifier')::uuid, current_setting('rehearsal.log')::uuid, 'endorse_log');
  INSERT INTO cc_out VALUES ('log again', 'held');
EXCEPTION WHEN unique_violation THEN
  INSERT INTO cc_out VALUES ('log again', 'refused');
END $$;
DO $$
BEGIN
  INSERT INTO public.interactions (user_id, target_list_id, type)
  VALUES (current_setting('rehearsal.certifier')::uuid, current_setting('rehearsal.stack')::uuid, 'endorse_list');
  INSERT INTO cc_out VALUES ('stack again', 'held');
EXCEPTION WHEN unique_violation THEN
  INSERT INTO cc_out VALUES ('stack again', 'refused');
END $$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.rh_case('a second certification of a log is refused', 'refused', (SELECT got FROM cc_out WHERE k = 'log again'));
  PERFORM pg_temp.rh_case('a second certification of a stack is refused', 'refused', (SELECT got FROM cc_out WHERE k = 'stack again'));
  PERFORM pg_temp.rh_case('the log is counted one more, not two', '1',
    ((SELECT certify_count FROM public.log_counts WHERE log_id = current_setting('rehearsal.log')::uuid) - (SELECT log_count FROM cc_before))::text);
  PERFORM pg_temp.rh_case('the stack holds one certification of theirs', '1',
    (SELECT count(*)::text FROM public.interactions WHERE type = 'endorse_list'
       AND user_id = current_setting('rehearsal.certifier')::uuid AND target_list_id = current_setting('rehearsal.stack')::uuid));
  PERFORM pg_temp.rh_case('no certification in the house is held twice', '0',
    (SELECT count(*)::text FROM (
       SELECT 1 FROM public.interactions WHERE type = 'endorse_log' GROUP BY user_id, target_log_id HAVING count(*) > 1
       UNION ALL
       SELECT 1 FROM public.interactions WHERE type = 'endorse_list' GROUP BY user_id, target_list_id HAVING count(*) > 1) twice));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
