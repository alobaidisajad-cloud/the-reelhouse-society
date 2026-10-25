-- ════════════════════════════════════════════════════════════════════════════
-- a_quote_is_found_by_its_message_rehearsal.sql — 20261022_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_quote_is_found_by_its_message_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction,
-- so the train built it alone on production (2026-10-25), and this checks it still holds: the index is there and
-- whole, and the two reads that find a message's quotes (a withdrawn message's,
-- in its trigger; a departing member's, in request_account_deletion) are planned
-- through it. Sequential scans are switched off for the plan alone, so a plan
-- that cannot use the index shows the scan it would fall back to. Read each
-- NOTICE as case|expected|got ; any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT pg_temp.rh_case('the index is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.lounge_messages_reply_to_id')), 'missing')) AS done \gset rh_

SET LOCAL enable_seqscan = off;
CREATE TEMP TABLE rh_plan (what text, line text) ON COMMIT DROP;
DO $$
DECLARE l text;
BEGIN
  FOR l IN EXPLAIN UPDATE public.lounge_messages SET reply_to_content = NULL
             WHERE reply_to_id = '00000000-0000-4000-8000-000000000001' AND reply_to_content IS NOT NULL LOOP
    INSERT INTO rh_plan VALUES ('withdrawn', l);
  END LOOP;
  FOR l IN EXPLAIN UPDATE public.lounge_messages SET reply_to_username = '[deleted]'
             WHERE reply_to_id IN (SELECT id FROM public.lounge_messages WHERE user_id = '00000000-0000-4000-8000-000000000002') LOOP
    INSERT INTO rh_plan VALUES ('departed', l);
  END LOOP;
END $$;
SELECT pg_temp.rh_case('a withdrawn message''s quotes are found by the index', 'true',
  (SELECT bool_or(line LIKE '%lounge_messages_reply_to_id%') FROM rh_plan WHERE what = 'withdrawn')::text) AS done \gset rh_
SELECT pg_temp.rh_case('a departing member''s quotes are found by the index', 'true',
  (SELECT bool_or(line LIKE '%lounge_messages_reply_to_id%') FROM rh_plan WHERE what = 'departed')::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
