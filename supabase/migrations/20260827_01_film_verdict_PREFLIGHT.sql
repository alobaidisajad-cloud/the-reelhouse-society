-- ════════════════════════════════════════════════════════════════════════════
-- PRE-FLIGHT — read-only. Changes nothing. Run this FIRST.
-- ════════════════════════════════════════════════════════════════════════════
-- Every assumption the migration makes, checked against the live database
-- rather than against the repo. The repo and the database have drifted before.
--
-- Every row must say PASS. Anything else, stop and send me the output.

SELECT check_name, result, detail FROM (

  -- The table the columns are added to.
  SELECT 1 AS ord, 'films table exists' AS check_name,
    CASE WHEN to_regclass('public.films') IS NOT NULL THEN 'PASS' ELSE 'STOP' END AS result,
    coalesce(to_regclass('public.films')::text, 'not found') AS detail

  UNION ALL
  -- The table the trigger is attached to.
  SELECT 2, 'logs table exists',
    CASE WHEN to_regclass('public.logs') IS NOT NULL THEN 'PASS' ELSE 'STOP' END,
    coalesce(to_regclass('public.logs')::text, 'not found')

  UNION ALL
  -- The columns the aggregate reads.
  SELECT 3, 'logs has film_id and rating',
    CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'STOP' END,
    string_agg(column_name || ' ' || data_type, ', ' ORDER BY column_name)
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'logs'
    AND column_name IN ('film_id', 'rating')

  UNION ALL
  -- films.id must be a primary key: the whole thing is ON CONFLICT (id).
  SELECT 4, 'films.id is a primary key',
    CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'STOP' END,
    coalesce(string_agg(conname, ', '), 'none')
  FROM pg_constraint
  WHERE conrelid = 'public.films'::regclass AND contype = 'p'

  UNION ALL
  -- FORCE would subject even the table's OWNER to RLS, and there is no write
  -- policy on films. The SECURITY DEFINER trigger would start failing and take
  -- every log insert with it. This is the single most dangerous condition here.
  SELECT 5, 'films does NOT force RLS',
    CASE WHEN relforcerowsecurity THEN 'STOP' ELSE 'PASS' END,
    CASE WHEN relforcerowsecurity
         THEN 'FORCE RLS is on — the trigger would fail and break logging'
         ELSE 'force=off, owner bypasses RLS as required' END
  FROM pg_class WHERE oid = 'public.films'::regclass

  UNION ALL
  -- The existing trigger the new one is named to sort after. Its absence is
  -- not fatal (the upsert covers it) but it means the repo and the database
  -- disagree, which is worth knowing before changing anything.
  SELECT 6, 'trg_note_film_logs is present',
    CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'CHECK' END,
    CASE WHEN count(*) = 1 THEN 'present — new trigger sorts after it'
         ELSE 'MISSING from the live database' END
  FROM pg_trigger
  WHERE tgrelid = 'public.logs'::regclass AND tgname = 'trg_note_film_logs'

  UNION ALL
  -- The recompute is one index scan per film. Without this it is a sequential
  -- scan of every log in the database on every single log written.
  SELECT 7, 'logs.film_id is indexed',
    CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'STOP' END,
    coalesce(string_agg(indexname, ', '), 'NO INDEX — the trigger would scan all logs')
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'logs' AND indexdef LIKE '%film_id%'

  UNION ALL
  -- Nothing already owns these names.
  SELECT 8, 'no name collisions',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'CHECK' END,
    CASE WHEN count(*) = 0 THEN 'clear'
         ELSE 'already exists (the migration replaces it): ' || string_agg(proname, ', ') END
  FROM pg_proc
  WHERE proname IN ('refresh_film_verdict', 'note_film_verdict')

  UNION ALL
  -- How much work the backfill is, so a timeout is a surprise and not a shock.
  SELECT 9, 'backfill size',
    'INFO',
    (SELECT count(*)::text || ' logs across '
       || count(DISTINCT film_id)::text || ' films' FROM public.logs WHERE film_id > 0)

  UNION ALL
  -- `logs.rating` carries no CHECK constraint. If anything outside 0-5 is in
  -- there the average will be odd — the column is unbounded so nothing FAILS,
  -- and the app clamps the display to 5, but you should know it is there.
  SELECT 10, 'ratings are within 0-5',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'CHECK' END,
    CASE WHEN count(*) = 0 THEN 'all within range'
         ELSE count(*)::text || ' rows outside 0-5 (stored fine; display clamps to 5)' END
  FROM public.logs WHERE rating IS NOT NULL AND (rating < 0 OR rating > 5)

  UNION ALL
  -- Anything holding a lock on `logs` right now would make the migration wait,
  -- and the lock_timeout inside it would then abort the whole thing harmlessly.
  -- Better to see it here and wait a minute.
  SELECT 11, 'nothing is holding logs open',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WAIT' END,
    CASE WHEN count(*) = 0 THEN 'no blocking locks'
         ELSE count(*)::text || ' transaction(s) hold locks on logs — run again shortly' END
  FROM pg_locks l
  JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE l.relation = 'public.logs'::regclass
    AND a.pid <> pg_backend_pid()
    AND a.state <> 'idle'

) checks ORDER BY ord;
