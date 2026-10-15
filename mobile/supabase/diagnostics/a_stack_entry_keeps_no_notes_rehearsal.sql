-- ════════════════════════════════════════════════════════════════════════════
-- a_stack_entry_keeps_no_notes_rehearsal.sql — 20261003_06. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_stack_entry_keeps_no_notes_rehearsal.sql
--
-- A stack's entry keeps no notes: the column is gone, so no client can write
-- one again. Production runs it by hand; db-integration.yml runs it on the
-- sealed copy (e2e/db/rehearsals.mjs). Read each NOTICE as  case|expected|got ;
-- the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

DO $$ BEGIN
  PERFORM pg_temp.rh_case('the column is gone', 'false', EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'list_items' AND column_name = 'notes')::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
