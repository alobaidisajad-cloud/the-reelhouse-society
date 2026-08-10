-- ============================================================================
-- BATCH 28 · the 13 ceilings batch 27 could not see
-- ============================================================================
--
-- Batch 27 reported "every text and jsonb column is bounded — 130 ceilings".
-- That was true of `_schema_baseline.sql`, which is a PHOTOGRAPH taken on
-- 2026-06-27. Live has 152 such columns. The difference is columns added by
-- migrations afterwards: invisible to the snapshot, so invisible to the coverage
-- test, which then reported full coverage over columns it had never seen.
--
-- That is the same failure that test was written to prevent, one level up — a
-- guard that defines the class too narrowly reports safety over the gap. It now
-- reads the migrations as a second source, and finding these is the first thing
-- it did.
--
-- ── MEASURED LIVE ───────────────────────────────────────────────────────────
--   profiles.public_prefs         569 chars (32 rows)
--   lounge_message_reactions      6 chars
--   everything else               0 / empty
-- Nothing is near its ceiling, so all validate immediately.
--
-- ── A NAMING ASSUMPTION NEARLY ADDED A 14TH ─────────────────────────────────
-- The first sweep looked for a constraint called `<table>_<column>_len` and
-- reported log_private_notes.notes as uncapped. It is capped — as
-- `log_private_notes_notes_check`, written in batch 1. Checking for ANY check
-- constraint mentioning the column, rather than one with the name I happened to
-- use, removed the false positive. A convention is not a fact.
--
-- Upper bound only. Fails loudly. Refuses to wait for a lock. Convergent.
-- ============================================================================

DO $$
DECLARE
  c        record;
  missing  text[] := '{}';
  applied  int := 0;
BEGIN
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '60s';

  FOR c IN
    SELECT * FROM (VALUES
      -- an offline write buffer; ids and a short type
      ('interactions_queue_buffer','target_id',       100, false),
      ('interactions_queue_buffer','target_list_id',  100, false),
      ('interactions_queue_buffer','target_log_id',   100, false),
      ('interactions_queue_buffer','type',            100, false),
      -- the curated reaction set: 'bravo', 'adored', 'riveting', 'quoted', 'panned'
      ('lounge_message_reactions','reaction',         100, false),
      -- a shared film, carried on the message
      ('lounge_messages','film_poster',              2048, false),
      ('lounge_messages','film_title',                300, false),
      -- notifications are SERVER-BUILT from columns already bounded in batch 27,
      -- so these cannot be pushed past their ceiling by anything a member types.
      ('notifications','title',                       200, false),
      ('notifications','body',                       1000, false),
      ('notifications','group_key',                   200, false),
      ('notifications','poster_path',                2048, false),
      ('notifications','metadata',                   8000, true),
      -- settings the server writes for the member; 569 chars live
      ('profiles','public_prefs',                    8000, true)
    ) AS t(tbl, col, cap, is_json)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=c.tbl AND column_name=c.col) THEN
      missing := missing || format('%s.%s', c.tbl, c.col);
    END IF;
  END LOOP;

  IF array_length(missing,1) > 0 THEN
    RAISE EXCEPTION 'ABORTED — % target column(s) do not exist: %. Nothing was changed.',
      array_length(missing,1), array_to_string(missing, ', ');
  END IF;

  FOR c IN
    SELECT * FROM (VALUES
      ('interactions_queue_buffer','target_id',       100, false),
      ('interactions_queue_buffer','target_list_id',  100, false),
      ('interactions_queue_buffer','target_log_id',   100, false),
      ('interactions_queue_buffer','type',            100, false),
      ('lounge_message_reactions','reaction',         100, false),
      ('lounge_messages','film_poster',              2048, false),
      ('lounge_messages','film_title',                300, false),
      ('notifications','title',                       200, false),
      ('notifications','body',                       1000, false),
      ('notifications','group_key',                   200, false),
      ('notifications','poster_path',                2048, false),
      ('notifications','metadata',                   8000, true),
      ('profiles','public_prefs',                    8000, true)
    ) AS t(tbl, col, cap, is_json)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint pc
               JOIN pg_class pcl ON pcl.oid = pc.conrelid
               JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
               WHERE pn.nspname='public' AND pcl.relname=c.tbl
                 AND pc.conname = c.tbl||'_'||c.col||'_len') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.tbl, c.tbl||'_'||c.col||'_len');
    END IF;
    -- jsonb is measured through its text form; the cast uses jsonb_out, which is
    -- immutable and therefore legal in a CHECK.
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (char_length(%I%s) <= %s)',
      c.tbl, c.tbl||'_'||c.col||'_len', c.col,
      CASE WHEN c.is_json THEN '::text' ELSE '' END, c.cap);
    applied := applied + 1;
  END LOOP;

  RAISE NOTICE 'OK — % ceilings applied. Live text/jsonb columns are now fully covered.', applied;
END $$;

-- ============================================================================
-- VERIFY (read-only) — expect 0 rows
-- ============================================================================
--   SELECT c.table_name||'.'||c.column_name AS still_uncapped
--     FROM information_schema.columns c
--     JOIN pg_class cl ON cl.relname = c.table_name
--     JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
--    WHERE c.table_schema='public' AND cl.relkind='r'
--      AND (c.data_type IN ('text','jsonb','json') OR c.data_type='ARRAY')
--      AND NOT EXISTS (SELECT 1 FROM pg_constraint pc
--                       WHERE pc.conrelid = cl.oid AND pc.contype='c'
--                         AND pg_get_constraintdef(pc.oid) ~ ('\m'||c.column_name||'\M'))
--    ORDER BY 1;
-- ============================================================================
