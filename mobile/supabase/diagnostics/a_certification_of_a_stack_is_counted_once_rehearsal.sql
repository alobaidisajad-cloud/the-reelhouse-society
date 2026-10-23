-- ════════════════════════════════════════════════════════════════════════════
-- a_certification_of_a_stack_is_counted_once_rehearsal.sql — 20261023_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_certification_of_a_stack_is_counted_once_rehearsal.sql
--
-- A key built CONCURRENTLY cannot be built inside this file's transaction, so
-- the train builds it alone first and then runs this: the key is there and
-- whole, and a member who certifies another member's stack a second time, as a
-- phone that did not know of the first would, is refused; the stack holds one
-- certification of theirs, and no stack's certification in the house is held
-- twice. Read each NOTICE as case|expected|got ; the last line is the verdict,
-- and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT pg_temp.rh_case('the key is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.interactions_endorse_list_once')), 'missing')) AS done \gset rh_

-- The certifier: a member in good standing. The stack: another member's.
SELECT set_config('rehearsal.certifier', pg_temp.rh_found('a member in good standing', (
  SELECT p.id FROM public.profiles p
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY p.created_at, p.id LIMIT 1))::text, true) AS done \gset rh_
SELECT set_config('rehearsal.stack', pg_temp.rh_found('a stack by another member', (
  SELECT s.id FROM public.lists s WHERE s.user_id <> current_setting('rehearsal.certifier')::uuid
   ORDER BY s.created_at, s.id LIMIT 1))::text, true) AS done \gset rh_

-- Its owner lets anyone certify, and the certifier has not certified it yet.
UPDATE public.profiles SET preferences = coalesce(preferences, '{}'::jsonb) || '{"privacy_endorsements": "everyone"}'::jsonb
 WHERE id = (SELECT user_id FROM public.lists WHERE id = current_setting('rehearsal.stack')::uuid);
DELETE FROM public.interactions
 WHERE user_id = current_setting('rehearsal.certifier')::uuid
   AND type = 'endorse_list' AND target_list_id = current_setting('rehearsal.stack')::uuid;

CREATE TEMP TABLE cc_out (k text, got text) ON COMMIT DROP;
GRANT ALL ON cc_out TO authenticated;

-- The first was given an hour ago: a member's interactions are kept a second apart
-- (check_interaction_rate_limit), and inside one transaction now() stands still.
INSERT INTO public.interactions (user_id, target_list_id, type, created_at)
VALUES (current_setting('rehearsal.certifier')::uuid, current_setting('rehearsal.stack')::uuid, 'endorse_list', now() - interval '60 minutes');

-- The second, as the app writes it: a phone that knew nothing of the first.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('rehearsal.certifier'), 'role', 'authenticated')::text, true) AS done \gset rh_
DO $$
BEGIN
  INSERT INTO public.interactions (user_id, target_list_id, type)
  VALUES (current_setting('rehearsal.certifier')::uuid, current_setting('rehearsal.stack')::uuid, 'endorse_list');
  INSERT INTO cc_out VALUES ('again', 'held');
EXCEPTION WHEN unique_violation THEN
  INSERT INTO cc_out VALUES ('again', 'refused');
END $$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.rh_case('a second certification of a stack is refused', 'refused', (SELECT got FROM cc_out WHERE k = 'again'));
  PERFORM pg_temp.rh_case('the stack holds one certification of theirs', '1',
    (SELECT count(*)::text FROM public.interactions WHERE type = 'endorse_list'
       AND user_id = current_setting('rehearsal.certifier')::uuid AND target_list_id = current_setting('rehearsal.stack')::uuid));
  PERFORM pg_temp.rh_case('no stack''s certification in the house is held twice', '0',
    (SELECT count(*)::text FROM (
       SELECT 1 FROM public.interactions WHERE type = 'endorse_list' GROUP BY user_id, target_list_id HAVING count(*) > 1) twice));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
