-- ════════════════════════════════════════════════════════════════════════════
-- a_stack_entry_keeps_no_notes_rehearsal.sql — 20261003_06. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_stack_entry_keeps_no_notes_rehearsal.sql
--
-- Nothing is lost: every entry's notes are empty before the column goes, and
-- no view or function needed it (the drop would refuse). Without with_fix the
-- column is still there and the rehearsal says no.
-- Read each NOTICE as  case | expected | got.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE sn_before ON COMMIT DROP AS
SELECT count(*) AS entries, count(*) FILTER (WHERE notes IS NOT NULL) AS with_notes FROM public.list_items;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261003_06_a_stack_entry_keeps_no_notes.sql
\endif

DO $$
DECLARE failed integer := 0; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('entries with notes, before', '0', (SELECT with_notes::text FROM sn_before)),
    ('the column is gone', 'false', EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'list_items' AND column_name = 'notes')::text),
    ('every entry is still there', (SELECT entries::text FROM sn_before), (SELECT count(*)::text FROM public.list_items))
  ) AS t(label, expected, got) LOOP
    RAISE NOTICE '% | % | %', c.label, c.expected, c.got;
    IF c.got IS DISTINCT FROM c.expected THEN failed := failed + 1; END IF;
  END LOOP;
  RAISE NOTICE 'FAILED: %', failed;
END $$;

ROLLBACK;
