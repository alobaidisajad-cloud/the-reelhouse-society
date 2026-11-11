-- ════════════════════════════════════════════════════════════════════════════
-- the_faces_are_found_in_order_rehearsal.sql — 20261111_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/the_faces_are_found_in_order_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction,
-- so the train builds it alone, and this checks it holds: the index is there and
-- whole, and a salon's first three approved members, in the order they joined
-- (get_salon_member_faces, 20261111_04), are read through it. Sequential scans
-- are switched off for the plan alone, so a plan that cannot use the index shows
-- the scan it would fall back to. Read each NOTICE as case|expected|got ; any
-- miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT pg_temp.rh_case('the index is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.idx_lounge_members_faces')), 'missing')) AS done \gset rh_

SET LOCAL enable_seqscan = off;
CREATE TEMP TABLE rh_plan (line text) ON COMMIT DROP;
DO $$
DECLARE l text;
BEGIN
  FOR l IN EXPLAIN SELECT lm.user_id FROM public.lounge_members lm
             WHERE lm.lounge_id = '00000000-0000-4000-8000-000000000000'::uuid AND lm.status = 'approved'
             ORDER BY lm.joined_at ASC, lm.user_id ASC LIMIT 3 LOOP
    INSERT INTO rh_plan VALUES (l);
  END LOOP;
END $$;
SELECT pg_temp.rh_case('a salon''s first three are read through the index', 'true',
  (SELECT bool_or(line LIKE '%idx_lounge_members_faces%') FROM rh_plan)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
