-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 30 · PART 1 — the indexes that are MISSING
-- ════════════════════════════════════════════════════════════════════════════
--
-- Runs BEFORE the drops deliberately: this file is purely additive, so if part 2
-- ever aborts the database is strictly better off than it was, never worse.
--
-- ── 12 unindexed foreign keys ───────────────────────────────────────────────
-- Batch 28 gave these ON DELETE CASCADE. PostgreSQL does not index a foreign key
-- automatically, and without an index every parent delete SCANS THE WHOLE CHILD
-- TABLE to find the rows to remove.
--
-- MEASURED, not assumed — 200,000 child rows, deleting one parent:
--     FK not indexed .... 27.401 ms   (cascade trigger)
--     FK indexed ........  0.192 ms
--     = 143x
-- request_account_deletion() cascades through about twelve of these, and account
-- deletion is an Apple review requirement. It is fast today only because the
-- tables are small; this is precisely the failure that appears with growth.
--
-- 19 foreign keys are unindexed in total. The 7 not listed here belong to the
-- dead cinema/ticket subsystem (showtimes, tickets, venues, tips, user_reports)
-- which batch 31 DROPS outright — indexing a table about to be deleted is waste.
--
-- Verified none of these twelve creates a fresh duplicate: zero existing indexes
-- begin with any of these columns.
--
-- ── 1 index for member discovery ────────────────────────────────────────────
-- MemberDiscoveryService sends, with no index behind it:
--     WHERE is_social_private = false AND is_banned = false AND username IS NOT NULL
--     ORDER BY followers_count DESC NULLS LAST LIMIT 24
--
-- BE CLEAR ABOUT THIS ONE: at today's 32 profiles the planner IGNORES this index
-- and sequential-scans, correctly. It will sit at zero reads and look exactly
-- like the dead indexes part 2 removes. It is added because the shape is proven
-- at scale — measured on 100,000 rows:
--     no index .... Seq Scan over 94,000 rows, cost 4628
--     with index .. Index Scan, cost 1.83   (reads only the 24 rows wanted)
-- The predicate mirrors the query exactly so the planner can use it, and it stays
-- small by indexing only the rows the registry can ever show.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: every table here is under 300 kB,
-- so the write lock lasts milliseconds, and running inside a transaction buys
-- atomicity and the guards below. CONCURRENTLY cannot run in a transaction and
-- would trade both away for nothing at this size.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  fk_before int;
  fk_after  int;
  n_made    int := 0;
  c         record;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '120s';

  SELECT count(*) INTO fk_before
  FROM pg_constraint con
  JOIN pg_namespace n ON n.oid = con.connamespace AND n.nspname = 'public'
  JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
  WHERE con.contype = 'f' AND array_length(con.conkey,1) = 1
    AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = con.conrelid AND i.indkey[0] = k.attnum);

  FOR c IN
    SELECT * FROM (VALUES
      ('dispatch_dossiers',        'user_id'),
      ('dossier_certifications',   'dossier_id'),
      ('dossier_comments',         'user_id'),
      ('list_comments',            'user_id'),
      ('lounge_members',           'user_id'),
      ('lounge_message_reactions', 'lounge_id'),
      ('lounge_message_reactions', 'user_id'),
      ('lounge_messages',          'user_id'),
      ('lounges',                  'creator_id'),
      ('notifications',            'from_user_id'),
      ('push_subscriptions',       'user_id'),
      ('warnings',                 'admin_id')
    ) AS t(tbl, col)
  LOOP
    -- Convergent: skip anything already covered, so a re-run is a no-op.
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class rel ON rel.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace AND ns.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = i.indkey[0]
      WHERE rel.relname = c.tbl AND a.attname = c.col
    ) THEN
      EXECUTE format('CREATE INDEX %I ON public.%I (%I)', 'idx_'||c.tbl||'_'||c.col, c.tbl, c.col);
      n_made := n_made + 1;
    END IF;
  END LOOP;

  -- Member discovery. Partial + ordered so it matches the query exactly.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_profiles_notable') THEN
    CREATE INDEX idx_profiles_notable ON public.profiles (followers_count DESC NULLS LAST)
      WHERE is_social_private = false AND is_banned = false AND username IS NOT NULL;
    n_made := n_made + 1;
  END IF;

  SELECT count(*) INTO fk_after
  FROM pg_constraint con
  JOIN pg_namespace n ON n.oid = con.connamespace AND n.nspname = 'public'
  JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
  WHERE con.contype = 'f' AND array_length(con.conkey,1) = 1
    AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = con.conrelid AND i.indkey[0] = k.attnum);

  IF fk_after > fk_before THEN
    RAISE EXCEPTION 'ABORTED — unindexed foreign keys went UP (% -> %). Nothing was applied.', fk_before, fk_after;
  END IF;

  RAISE NOTICE
    'OK — % index(es) created. Unindexed foreign keys % -> % (the remainder are the dead cinema/ticket tables, dropped in batch 31).',
    n_made, fk_before, fk_after;
END $$;
