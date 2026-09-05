-- ════════════════════════════════════════════════════════════════════════════
-- 20260905_03 — lists_user_id_idx, which another index has covered since August
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT ───────────────────────────────────────────────────────────────────
-- public.lists carries three indexes:
--     idx_lists_created_at_id_desc  (created_at DESC, id DESC) WHERE is_private = false
--     idx_lists_user_created_id     (user_id, created_at DESC, id DESC)
--     lists_user_id_idx             (user_id)
-- The third is a strict PREFIX of the second. Every lookup it can answer the
-- second answers, and every write to `lists` currently pays to maintain both.
--
-- ── WHY IT SURVIVED BATCH 30 ───────────────────────────────────────────────
-- It was not redundant then, and batch 30 part 2 (20260813_02) was right to
-- leave it. The index that now covers it, idx_lists_user_created_id, was created
-- ELEVEN DAYS LATER — 2026-08-24, by the room-paging migration in the OTHER
-- supabase tree. Two trees write to one database, so a drop can be correct on
-- the day it is written and wrong a fortnight on, and the reverse. That is why
-- the coverage below is re-derived at run time instead of trusted from a file.
--
-- ── WHAT JUSTIFIES A DROP — and what does NOT ──────────────────────────────
-- NOT usage counts. That reasoning is unsound and is proven both ways on this
-- very database: profiles has 32 rows and the planner IGNORES a perfectly good
-- index; notifications has 54 rows and the planner USES one. A scan count
-- reflects table size and query shape, not whether an index earns its place.
--
-- The justification is STRUCTURAL — prefix coverage, which holds at 32 rows and
-- at 32 million. Batch 30 measured the cost of reading through the wider index
-- at 300,000 rows rather than arguing it:
--     narrow (user_id) ............. 2072 kB, query cost 225.63
--     wide (user_id, created_at) ... 9264 kB, query cost 225.76 after the drop
--     = 0.06% more to read, one entire index less to write.
--
-- ── THE CLASS, NOT THE INSTANCE ────────────────────────────────────────────
-- All 84 indexes in the live schema were re-derived against the same rules.
-- This is the only one left. profiles_username_lower_unique is UNIQUE on an
-- EXPRESSION — lower(username) — and nothing covers an expression index, so it
-- stays and case-insensitive uniqueness stays with it.
--
-- ── SAFETY, ESTABLISHED BEFORE WRITING THIS ────────────────────────────────
--  · lists_user_id_idx is NOT unique and owns no constraint, so no rule is lost
--    with it. (Both re-checked at run time below, not taken from the dump.)
--  · lists_user_id_fkey (user_id -> profiles.id ON DELETE CASCADE) needs an
--    index on user_id or deleting an account scans the whole table — measured at
--    143x on 200k rows in batch 30. idx_lists_user_created_id LEADS with user_id
--    and serves the cascade. The guard counts unindexed foreign keys before and
--    after and aborts if the number moves at all.
--  · The covering index must be VALID and READY. A CREATE INDEX CONCURRENTLY
--    that failed part-way leaves an INVALID index that the planner will not use,
--    and such an index is NOT cover. idx_lists_user_created_id was in fact
--    created CONCURRENTLY, so this is checked rather than assumed — the live
--    posture check does not check it, which is the one gap this closes.
--  · Convergent. Running it a second time is a no-op, not an error.
--  · lock_timeout bounds the ACCESS EXCLUSIVE lock the drop needs. If it cannot
--    be taken within 5s the whole block aborts and NOTHING is applied, rather
--    than queueing every reader of `lists` behind it. Re-run later.
--  · DROP INDEX CONCURRENTLY would take a weaker lock, but it cannot run inside
--    a transaction and therefore cannot run inside these guards. On a table this
--    size a bounded lock WITH the guards is the better trade; the drop itself is
--    a catalog update, not a table rewrite.
--  · Every RAISE EXCEPTION below rolls the DROP back with it — the block is one
--    transaction, so it either lands whole or leaves the database untouched.
--  · Indexes are invisible to clients, so the shipped TestFlight build cannot
--    notice this at all.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--     CREATE INDEX CONCURRENTLY lists_user_id_idx
--       ON public.lists USING btree (user_id);
--   (CONCURRENTLY, and outside a transaction, so it cannot lock writers out.)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  fk_before int;
  fk_after  int;
  covered   boolean;
  n_left    int;
BEGIN
  SET LOCAL lock_timeout      = '5s';
  SET LOCAL statement_timeout = '120s';

  -- ── Unindexed single-column foreign keys, BEFORE ─────────────────────────
  SELECT count(*) INTO fk_before
  FROM pg_constraint con
  JOIN pg_namespace n ON n.oid = con.connamespace AND n.nspname = 'public'
  JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
  WHERE con.contype = 'f'
    AND array_length(con.conkey, 1) = 1
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = con.conrelid AND i.indkey[0] = k.attnum);

  -- ── Convergent: already gone is a success, not a failure ─────────────────
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class ic
    JOIN pg_namespace ns ON ns.oid = ic.relnamespace AND ns.nspname = 'public'
    WHERE ic.relname = 'lists_user_id_idx' AND ic.relkind = 'i')
  THEN
    RAISE NOTICE 'OK — lists_user_id_idx is already gone. Nothing to do.';
    RETURN;
  END IF;

  -- ── Re-derive the coverage AT RUN TIME ───────────────────────────────────
  -- A list of names decided days ago must never remove an index that has since
  -- become the only one covering a column. This asks the database as it is now.
  SELECT EXISTS (
    SELECT 1
    FROM pg_index me
    JOIN pg_class     mic ON mic.oid = me.indexrelid AND mic.relname = 'lists_user_id_idx'
    JOIN pg_namespace mns ON mns.oid = mic.relnamespace AND mns.nspname = 'public'
    JOIN pg_index   other ON other.indrelid   = me.indrelid
                         AND other.indexrelid <> me.indexrelid
    WHERE
      -- What is being dropped must carry nothing of its own:
          me.indnatts = me.indnkeyatts                 -- no INCLUDE payload
      AND NOT me.indisunique                           -- enforces no rule
      AND me.indpred IS NULL                           -- not partial
      AND NOT EXISTS (SELECT 1 FROM pg_constraint con
                      WHERE con.conindid = me.indexrelid)   -- backs no constraint
      -- What covers it must be able to, in fact and not just on paper:
      AND other.indpred IS NULL                        -- covers every row, not some
      AND other.indisvalid AND other.indisready        -- a failed CONCURRENTLY is NOT cover
      AND other.indkey[0:me.indnkeyatts - 1] = me.indkey[0:me.indnkeyatts - 1]
      AND ( other.indnkeyatts > me.indnkeyatts
            OR (other.indisunique AND other.indnkeyatts = me.indnkeyatts) )
  ) INTO covered;

  IF NOT covered THEN
    RAISE EXCEPTION
      'ABORTED — lists_user_id_idx is not covered by a valid, non-partial index on this database right now, so dropping it would lose coverage. Nothing was applied.';
  END IF;

  DROP INDEX public.lists_user_id_idx;

  -- ── Unindexed single-column foreign keys, AFTER ──────────────────────────
  SELECT count(*) INTO fk_after
  FROM pg_constraint con
  JOIN pg_namespace n ON n.oid = con.connamespace AND n.nspname = 'public'
  JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
  WHERE con.contype = 'f'
    AND array_length(con.conkey, 1) = 1
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = con.conrelid AND i.indkey[0] = k.attnum);

  IF fk_after > fk_before THEN
    RAISE EXCEPTION
      'ABORTED — the drop removed foreign-key coverage (% -> % unindexed). Nothing was applied.',
      fk_before, fk_after;
  END IF;

  -- ── And `lists` must still be reachable by user_id at all ────────────────
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid AND c.relname = 'lists'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'user_id'
    WHERE i.indkey[0] = a.attnum AND i.indisvalid AND i.indisready)
  THEN
    RAISE EXCEPTION
      'ABORTED — nothing indexes lists.user_id any more. Nothing was applied.';
  END IF;

  SELECT count(*) INTO n_left
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indrelid AND c.relname = 'lists'
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public';

  RAISE NOTICE
    'OK — lists_user_id_idx dropped. Unindexed foreign keys unchanged at %, lists keeps % index(es), and user_id is still led by a valid one.',
    fk_after, n_left;
END $$;
