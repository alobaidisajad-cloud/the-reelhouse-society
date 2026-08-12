-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 30 · PART 2 — remove indexes another index already covers
-- ════════════════════════════════════════════════════════════════════════════
--
-- 22 indexes are redundant. Every write to these tables currently maintains all
-- of them; no read benefits.
--
-- ── WHAT JUSTIFIES A DROP — and what does NOT ──────────────────────────────
-- NOT usage counts. That reasoning is unsound and was in an earlier draft of
-- this batch. Proven both ways on this very database:
--   · profiles has 32 rows and the planner IGNORES a perfectly good index;
--   · notifications has 54 rows and the planner USES one.
-- A scan count reflects table size and query shape, not whether an index earns
-- its place. Deleting "unused" indexes on that basis is guesswork.
--
-- Every drop below is justified STRUCTURALLY — another index provably covers it:
--   (a) an exact duplicate: identical columns, opclass, collation, predicate and
--       uniqueness, so one carries zero information the other lacks; or
--   (b) prefix coverage: a single-column index is covered by any wider index
--       beginning with that same column.
-- Both hold at 32 rows and at 32 million.
--
-- Prefix coverage MEASURED at 300,000 rows rather than argued:
--     narrow (user_id) ............. 2072 kB, query cost 225.63
--     wide (user_id, created_at) ... 9264 kB, query cost 225.76 after the drop
--     = 0.06% more to read, one entire index less to write.
--
-- ── DELIBERATELY EXCLUDED ──────────────────────────────────────────────────
-- idx_profiles_feed_join looks prefix-redundant but carries INCLUDE columns
-- (username, avatar_url, tier) that let the feed read from the index alone.
-- Dropping it would add real heap fetches. Covering indexes are never dropped
-- by the rule above, and the check below re-derives that at run time.
--
-- ── SAFETY, PROVEN BEFORE WRITING THIS ─────────────────────────────────────
--  · Unindexed foreign keys: 19 before these drops, 19 after — not one drop
--    removes foreign-key coverage. The guard below re-checks it and aborts.
--  · No table uses any of these as its REPLICA IDENTITY, so replication is safe.
--  · profiles keeps TWO unique indexes on username (the plain one and the
--    lower(username) one), so uniqueness and case-insensitivity both survive.
--  · No `onConflict` in either app resolves against a dropped unique index —
--    the app upserts on id, user_id+film_id, list_id+film_id, endpoint,
--    blocker_id+blocked_id and user_id+target_user_id+type. None involve username.
--  · Indexes are invisible to clients, so the shipped TestFlight build cannot
--    notice this at all.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  c          record;
  fk_before  int;
  fk_after   int;
  n_dropped  int := 0;
  n_uniq     int;
  covered    boolean;
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
      ('dossier_comments_dossier_id_idx', false),
      ('idx_interactions_target_log_id',  false),
      ('idx_interactions_user_id',        false),
      ('interactions_target_log_id_idx',  false),
      ('interactions_target_user_id_idx', false),
      ('interactions_user_id_idx',        false),
      ('idx_logs_created_at',             false),
      ('idx_logs_user_id',                false),
      ('logs_created_at_idx',             false),
      ('logs_film_id_idx',                false),
      ('logs_user_id_idx',                false),
      ('idx_notifications_created_at',    false),
      ('idx_notifications_user_id',       false),
      ('idx_physical_archive_user',       false),
      ('idx_profiles_username',           false),
      ('profiles_username_idx',           false),
      ('profiles_username_unique_idx',    false),
      ('profiles_username_key',           true),   -- backed by a UNIQUE constraint
      ('idx_user_blocks_blocker',         false),
      ('vaults_user_id_idx',              false),
      ('idx_watchlists_user_id',          false),
      ('watchlists_user_id_idx',          false)
    ) AS t(idx, is_constraint)
  LOOP
    -- Convergent: already gone is fine.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_class ic
      JOIN pg_namespace ns ON ns.oid = ic.relnamespace AND ns.nspname = 'public'
      WHERE ic.relname = c.idx AND ic.relkind = 'i');

    -- Re-derive redundancy AT RUN TIME. A hard-coded list measured days ago must
    -- not remove an index that has since become the only one covering a column.
    SELECT EXISTS (
      SELECT 1
      FROM pg_index me
      JOIN pg_class mic ON mic.oid = me.indexrelid AND mic.relname = c.idx
      JOIN pg_index other ON other.indrelid = me.indrelid AND other.indexrelid <> me.indexrelid
      WHERE
        -- (a) an exact structural duplicate
        (    regexp_replace(pg_get_indexdef(other.indexrelid), '^CREATE (UNIQUE )?INDEX \S+ ON \S+ ', '')
           = regexp_replace(pg_get_indexdef(me.indexrelid),    '^CREATE (UNIQUE )?INDEX \S+ ON \S+ ', '')
         AND other.indisunique = me.indisunique)
        -- (b) prefix coverage by a wider plain index
        OR ( me.indnkeyatts = 1 AND me.indnatts = me.indnkeyatts AND me.indpred IS NULL
             AND other.indnkeyatts > 1 AND other.indpred IS NULL
             AND other.indkey[0] = me.indkey[0] )
        -- (c) a partial unique whose predicate cannot exclude anything, beside a
        --     full unique on the same column (NULLs are already distinct)
        OR ( me.indisunique AND me.indpred IS NOT NULL AND other.indisunique
             AND other.indpred IS NULL AND other.indkey[0] = me.indkey[0]
             AND other.indnkeyatts = me.indnkeyatts )
        -- (d) a PLAIN index covered by a UNIQUE index on the same column(s).
        --     A unique index answers every lookup a plain one does; it is merely
        --     more constrained. This case is why the two plain username indexes
        --     go, and omitting it is what made the first run of this migration
        --     abort on the second of the pair: once its exact twin was dropped,
        --     rules (a) and (b) no longer matched even though profiles_username_
        --     unique still covered it completely. The abort was correct — the
        --     rule was incomplete, not the intent.
        OR ( NOT me.indisunique AND other.indisunique
             AND me.indpred IS NULL AND other.indpred IS NULL
             AND me.indnkeyatts = other.indnkeyatts
             AND me.indkey::text = other.indkey::text )
    ) INTO covered;

    IF NOT covered THEN
      RAISE EXCEPTION
        'ABORTED — % is no longer covered by another index, so dropping it would lose coverage. Nothing was applied.', c.idx;
    END IF;

    IF c.is_constraint THEN
      EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.idx);
    ELSE
      EXECUTE format('DROP INDEX public.%I', c.idx);
    END IF;
    n_dropped := n_dropped + 1;
  END LOOP;

  -- ── Guards ───────────────────────────────────────────────────────────────
  SELECT count(*) INTO fk_after
  FROM pg_constraint con
  JOIN pg_namespace n ON n.oid = con.connamespace AND n.nspname = 'public'
  JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
  WHERE con.contype = 'f' AND array_length(con.conkey,1) = 1
    AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = con.conrelid AND i.indkey[0] = k.attnum);

  IF fk_after > fk_before THEN
    RAISE EXCEPTION
      'ABORTED — a drop removed foreign-key coverage (% -> % unindexed). Nothing was applied.', fk_before, fk_after;
  END IF;

  SELECT count(*) INTO n_uniq
  FROM pg_index i
  JOIN pg_class c2 ON c2.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = c2.relnamespace AND n.nspname = 'public'
  WHERE c2.relname = 'profiles' AND i.indisunique
    AND pg_get_indexdef(i.indexrelid) LIKE '%username%';

  IF n_uniq < 2 THEN
    RAISE EXCEPTION
      'ABORTED — username uniqueness would be weakened (% unique index(es) left, expected 2). Nothing was applied.', n_uniq;
  END IF;

  RAISE NOTICE
    'OK — % redundant index(es) removed. Unindexed foreign keys unchanged at %, username still protected by % unique indexes.',
    n_dropped, fk_after, n_uniq;
END $$;
