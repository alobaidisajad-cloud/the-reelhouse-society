-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 29 · PART 4 — the loose end, closed
-- ════════════════════════════════════════════════════════════════════════════
--
-- Part 3 removed TRUNCATE, REFERENCES and TRIGGER. It left MAINTAIN, a
-- PostgreSQL 17 privilege that Supabase's default GRANT ALL also hands to `anon`
-- and `authenticated` (37 and 38 tables respectively). MAINTAIN permits VACUUM,
-- ANALYZE, CLUSTER, REINDEX and REFRESH MATERIALIZED VIEW.
--
-- It exposes no data and is not reachable — PostgREST answers those verbs with
-- 501 and no function performs them — so this is the same defence-in-depth as
-- the rest of part 3. It is removed for the same reason: nothing needs it.
-- `postgres` and `service_role` keep it, which is what the cron jobs run as.
--
-- ── The two cron-only maintenance RPCs ──────────────────────────────────────
-- public.refresh_global_feed() and public.sweep_interaction_buffer() exist to be
-- called by pg_cron as `postgres`, once a minute. Both are granted EXECUTE to
-- `anon` and `authenticated`, so any stranger with the public key could POST to
-- them. refresh_global_feed runs REFRESH MATERIALIZED VIEW CONCURRENTLY over the
-- whole feed — an expensive full rebuild, on demand, unauthenticated, as fast as
-- requests can be sent. Part 3 incidentally blocked it (the matview grant is
-- gone, so it now returns 401), but a privilege that only fails because of a
-- second, unrelated privilege is not a closed door. Neither is called by any
-- client at any commit; both are absent from backend-contract.json.
--
-- Revoking EXECUTE does not affect pg_cron: those jobs run as `postgres`, which
-- owns both functions. Verified in cron.job — `refresh-global-feed` and
-- `sweep-interaction-buffer`, both `username = postgres`.
--
-- ── NOT fixed here, deliberately — see the report ───────────────────────────
-- `sweep_interaction_buffer` has failed on EVERY run since it was created:
-- 171,883 failures, 0 successes, once a minute. It inserts
-- interactions_queue_buffer.target_log_id (text) into interactions.target_log_id
-- (uuid) with no cast. Nothing has been lost — no client writes to that buffer at
-- any commit in history, and it holds 0 rows — so this is dead infrastructure
-- failing loudly, not data loss. Repairing a sweep for a buffer nothing fills
-- would be polishing dead code; it belongs with the batch 31 removal. Recorded
-- here so the next reader does not rediscover it.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r          record;
  before_rw  int;
  after_rw   int;
  n_rel      int := 0;
  n_left     int;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '120s';

  -- The four privileges the app needs must not move.
  SELECT count(*) INTO before_rw
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role)
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS pp(priv)
  WHERE c.relkind IN ('r','p') AND has_table_privilege(rr.role, c.oid, pp.priv);

  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','m')
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE MAINTAIN ON TABLE %s FROM anon, authenticated', r.rel);
    n_rel := n_rel + 1;
  END LOOP;

  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE MAINTAIN ON TABLES FROM anon, authenticated;

  -- Cron-only maintenance RPCs. pg_cron runs them as postgres, which owns them,
  -- so this cannot stop the schedule.
  REVOKE ALL ON FUNCTION public.refresh_global_feed()      FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.sweep_interaction_buffer() FROM PUBLIC, anon, authenticated;

  -- ── Guards ───────────────────────────────────────────────────────────────
  SELECT count(*) INTO after_rw
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role)
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS pp(priv)
  WHERE c.relkind IN ('r','p') AND has_table_privilege(rr.role, c.oid, pp.priv);

  IF after_rw <> before_rw THEN
    RAISE EXCEPTION
      'ABORTED — read/write privileges changed (% -> %). This migration must only remove MAINTAIN. Nothing was applied.',
      before_rw, after_rw;
  END IF;

  IF NOT (has_table_privilege('postgres','public.logs','MAINTAIN')
      AND has_function_privilege('postgres','public.refresh_global_feed()','EXECUTE')) THEN
    RAISE EXCEPTION
      'ABORTED — postgres lost a privilege the cron jobs depend on. Nothing was applied.';
  END IF;

  SELECT count(*) INTO n_left
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role)
  WHERE c.relkind IN ('r','p','m') AND has_table_privilege(rr.role, c.oid, 'MAINTAIN');

  IF n_left > 0 THEN
    RAISE EXCEPTION 'ABORTED — MAINTAIN still held on % relation/role pair(s). Nothing was applied.', n_left;
  END IF;

  RAISE NOTICE
    'OK — MAINTAIN removed from anon and authenticated on % relations and from the default privileges; the two cron-only RPCs are no longer callable by them. Read/write pairs unchanged at %.',
    n_rel, after_rw;
END $$;

NOTIFY pgrst, 'reload schema';
