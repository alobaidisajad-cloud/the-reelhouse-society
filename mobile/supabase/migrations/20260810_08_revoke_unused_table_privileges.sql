-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 29 · PART 3 — take away privileges nothing uses
-- ════════════════════════════════════════════════════════════════════════════
--
-- `anon` and `authenticated` hold TRUNCATE, REFERENCES and TRIGGER on ~38 of 38
-- public tables. These are Supabase's default `GRANT ALL`, not a decision anyone
-- made here.
--
-- WHY IT MATTERS: **TRUNCATE IS NOT SUBJECT TO RLS.** Every other write is —
-- a DELETE with the anon key returns 204 and removes nothing, because the row
-- policies filter it. TRUNCATE has no rows to filter; it empties the table.
-- So the one privilege RLS cannot defend is the one nothing needs.
--
-- HONEST SEVERITY: not reachable today. Verified live —
--   · PostgREST answers the TRUNCATE verb with 501; its vocabulary is
--     GET/POST/PATCH/DELETE and there is no route that emits TRUNCATE;
--   · zero functions in public contain TRUNCATE or CREATE TRIGGER;
--   · no client code references it (the three `truncate` hits in the web app
--     are a `truncateReview()` text helper);
--   · neither role holds CREATE on any schema.
-- This is defence-in-depth, exactly like the pg_temp pin in part 2. It is closed
-- because nothing needs it, not because something is exploiting it.
--
-- REFERENCES and TRIGGER go with it: REFERENCES lets a role point a foreign key
-- at a table, TRIGGER lets it attach a trigger — and an attached trigger can
-- call an existing SECURITY DEFINER function. Both are useless to a PostgREST
-- client and neither is used.
--
-- WHAT IS DELIBERATELY KEPT: SELECT, INSERT, UPDATE, DELETE. The app needs all
-- four and RLS gates every one of them. The guard at the end aborts the whole
-- migration if any of those four moved by even a single table.
--
-- THE HALF THAT MATTERS MOST: default privileges. Without the ALTER DEFAULT
-- PRIVILEGES below, the very next `CREATE TABLE` hands TRUNCATE straight back
-- and this migration becomes a snapshot rather than a rule. All 38 existing
-- tables are owned by `postgres`, and new ones are created as `postgres` through
-- the SQL editor, so that is the role whose defaults govern.
--
-- KNOWN LIMIT, stated rather than hidden: `supabase_admin` also carries default
-- privileges granting the same three. That role's defaults CANNOT be changed
-- from here — `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` fails with
-- "permission denied to change default privileges", and `postgres` is not a
-- member of it. It only applies to tables created BY supabase_admin, which is
-- Supabase's own tooling, not this project. If Supabase ever creates a table in
-- `public` on our behalf, the live checker's grant assertion will catch it.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r            record;
  before_rw    int;
  after_rw     int;
  before_cols  int;
  after_cols   int;
  n_tables     int := 0;
  n_left       int;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '120s';

  -- Baseline for the four privileges that MUST NOT move.
  SELECT count(*) INTO before_rw
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role)
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS pp(priv)
  WHERE c.relkind IN ('r','p') AND has_table_privilege(rr.role, c.oid, pp.priv);

  -- profiles is protected by COLUMN-level SELECT grants (the email-harvest fix):
  -- anon cannot see email, ban_reason, warning_count, suspension_reason and more.
  -- A table-level REVOKE must not disturb them, so they are counted too.
  SELECT count(*) INTO before_cols
  FROM information_schema.columns c
  CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role)
  WHERE c.table_schema = 'public'
    AND has_column_privilege(rr.role, 'public.' || quote_ident(c.table_name), c.column_name, 'SELECT');

  FOR r IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM anon, authenticated', r.tbl);
    n_tables := n_tables + 1;
  END LOOP;

  -- The rule, not just the snapshot.
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

  -- ── Guards ───────────────────────────────────────────────────────────────
  SELECT count(*) INTO after_rw
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role)
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS pp(priv)
  WHERE c.relkind IN ('r','p') AND has_table_privilege(rr.role, c.oid, pp.priv);

  IF after_rw <> before_rw THEN
    RAISE EXCEPTION
      'ABORTED — read/write privileges changed (% -> %). This migration must only remove TRUNCATE/REFERENCES/TRIGGER. Nothing was applied.',
      before_rw, after_rw;
  END IF;

  SELECT count(*) INTO after_cols
  FROM information_schema.columns c
  CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role)
  WHERE c.table_schema = 'public'
    AND has_column_privilege(rr.role, 'public.' || quote_ident(c.table_name), c.column_name, 'SELECT');

  IF after_cols <> before_cols THEN
    RAISE EXCEPTION
      'ABORTED — column-level SELECT visibility changed (% -> %). The email-harvest lockdown must not move. Nothing was applied.',
      before_cols, after_cols;
  END IF;

  SELECT count(*) INTO n_left
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'),('authenticated')) AS rr(role)
  CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS pp(priv)
  WHERE c.relkind IN ('r','p') AND has_table_privilege(rr.role, c.oid, pp.priv);

  IF n_left > 0 THEN
    RAISE EXCEPTION 'ABORTED — % table/privilege pair(s) still held. Nothing was applied.', n_left;
  END IF;

  RAISE NOTICE
    'OK — TRUNCATE/REFERENCES/TRIGGER removed from anon and authenticated on % tables, and from the default privileges for future ones. Read/write pairs unchanged at %, column visibility unchanged at %.',
    n_tables, after_rw, after_cols;
END $$;
