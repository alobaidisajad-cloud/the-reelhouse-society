-- ════════════════════════════════════════════════════════════════════════════
-- a_card_is_found_by_its_owner_rehearsal.sql — 20261022_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_card_is_found_by_its_owner_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction,
-- so the train builds it alone first and then runs this: the index is there and
-- whole, and the read that takes a departing member's handle from every card
-- (request_account_deletion) is planned through it. Sequential scans are
-- switched off for the plan alone, so a plan that cannot use the index shows the
-- scan it would fall back to. Read each NOTICE as case|expected|got ; any miss
-- makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT pg_temp.rh_case('the index is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.lounge_messages_card_names')), 'missing')) AS done \gset rh_

SET LOCAL enable_seqscan = off;
CREATE TEMP TABLE rh_plan (line text) ON COMMIT DROP;
DO $$
DECLARE l text;
BEGIN
  FOR l IN EXPLAIN UPDATE public.lounge_messages SET metadata = (metadata - 'owner_username') - 'author_username'
             WHERE metadata <> '{}'::jsonb
               AND (metadata @> jsonb_build_object('owner_username', 'rh_departed')
                 OR metadata @> jsonb_build_object('author_username', 'rh_departed')) LOOP
    INSERT INTO rh_plan VALUES (l);
  END LOOP;
END $$;
SELECT pg_temp.rh_case('a departing member''s cards are found by the index', 'true',
  (SELECT bool_or(line LIKE '%lounge_messages_card_names%') FROM rh_plan)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
