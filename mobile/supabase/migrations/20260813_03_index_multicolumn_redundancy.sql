-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 30 · PART 3 — the redundancy my own rule was too narrow to see
-- ════════════════════════════════════════════════════════════════════════════
--
-- Part 2 removed 22 indexes using a rule that only examined SINGLE-COLUMN
-- indexes. That was too narrow. The same logic applies at any width:
--
--   (user_id, film_id) is redundant beside (user_id, film_id, created_at DESC)
--   (user_id, film_id) is redundant beside a UNIQUE (user_id, film_id)
--
-- Two indexes survived part 2 purely because of that blind spot:
--
--   idx_logs_composite_user_film            (user_id, film_id)
--     covered TWICE — by logs_user_id_film_id_key, a UNIQUE index on exactly
--     those columns, and by logs_user_film_idx, which starts with them.
--     logs is the hottest write table in the app.
--
--   idx_dossier_certifications_user_dossier (user_id, dossier_id)
--     covered by dossier_certifications_user_id_dossier_id_key, a UNIQUE index
--     on exactly those columns.
--
-- Neither backs a constraint. Neither is unique, so no upsert can resolve
-- against it. Verified by comparing the full set of indexed column-combinations
-- before and after: combinations losing all coverage = NONE.
--
-- The live checker's detector has been widened to the same rule, so a
-- multi-column duplicate cannot hide there again either.
--
-- Found by re-auditing a finished batch rather than trusting it — the same way
-- part 2's run-time guard caught a bug in part 2's own drop list.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  c         record;
  n_dropped int := 0;
  n_left    int;
  covered   boolean;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '60s';

  FOR c IN
    SELECT unnest(ARRAY[
      'idx_logs_composite_user_film',
      'idx_dossier_certifications_user_dossier'
    ]) AS idx
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_class ic
      JOIN pg_namespace ns ON ns.oid = ic.relnamespace AND ns.nspname = 'public'
      WHERE ic.relname = c.idx AND ic.relkind = 'i');

    -- Re-derive coverage at run time, at ANY width. Same discipline as part 2:
    -- a list written earlier must never remove an index that has since become
    -- the only one covering a column combination.
    SELECT EXISTS (
      SELECT 1
      FROM pg_index me
      JOIN pg_class mic ON mic.oid = me.indexrelid AND mic.relname = c.idx
      JOIN pg_index other ON other.indrelid = me.indrelid AND other.indexrelid <> me.indexrelid
      WHERE NOT me.indisunique
        AND me.indpred IS NULL AND other.indpred IS NULL
        AND me.indnatts = me.indnkeyatts
        AND other.indkey[0:me.indnkeyatts-1] = me.indkey[0:me.indnkeyatts-1]
        AND ( other.indnkeyatts > me.indnkeyatts
              OR (other.indisunique AND other.indnkeyatts = me.indnkeyatts) )
    ) INTO covered;

    IF NOT covered THEN
      RAISE EXCEPTION
        'ABORTED — % is no longer covered by another index. Nothing was applied.', c.idx;
    END IF;

    EXECUTE format('DROP INDEX public.%I', c.idx);
    n_dropped := n_dropped + 1;
  END LOOP;

  -- Nothing redundant may remain, at any width.
  SELECT count(DISTINCT me.relname) INTO n_left
  FROM pg_index i1
  JOIN pg_class me ON me.oid = i1.indexrelid
  JOIN pg_class c1 ON c1.oid = i1.indrelid
  JOIN pg_namespace n1 ON n1.oid = c1.relnamespace AND n1.nspname = 'public'
  JOIN pg_index i2 ON i2.indrelid = i1.indrelid AND i2.indexrelid <> i1.indexrelid
  WHERE NOT i1.indisunique
    AND i1.indpred IS NULL AND i2.indpred IS NULL
    AND i1.indnatts = i1.indnkeyatts
    AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i1.indexrelid)
    AND i2.indkey[0:i1.indnkeyatts-1] = i1.indkey[0:i1.indnkeyatts-1]
    AND ( i2.indnkeyatts > i1.indnkeyatts
          OR (i2.indisunique AND i2.indnkeyatts = i1.indnkeyatts) );

  IF n_left > 0 THEN
    RAISE EXCEPTION 'ABORTED — % redundant index(es) still present. Nothing was applied.', n_left;
  END IF;

  RAISE NOTICE 'OK — % multi-column redundant index(es) removed. Nothing redundant remains at any width.', n_dropped;
END $$;
