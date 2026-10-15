-- ════════════════════════════════════════════════════════════════════════════
-- 20261015_05 — a login the nightly checks read production with, and nothing more.
-- ════════════════════════════════════════════════════════════════════════════
-- drift_reader reads every row of the public tables (it passes the row rules,
-- so its counts are whole), and outside public it reads nothing directly: each
-- thing a check needs there is one function in the private schema drift that
-- returns a count, or the rows a snapshot already shows (bucket rules,
-- scheduled jobs, secret names). It never reads a password, a sign-in token, a
-- second factor's secret, a decrypted secret or a member's email, and of
-- push_subscriptions only id, user_id and created_at.
-- It holds no grant to write; every session it opens is read-only and bounded
-- in time; it may hold three at once; it lapses on 2027-04-01. It is made with
-- no password and cannot sign in until one is set with \password in psql.
-- Undo: mobile/supabase/migrations-down/20261015_05_a_read_only_login_for_the_nightly_checks.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE ROLE drift_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT BYPASSRLS
  CONNECTION LIMIT 3 VALID UNTIL '2027-04-01';
ALTER ROLE drift_reader SET default_transaction_read_only = on;
ALTER ROLE drift_reader SET statement_timeout = '120s';
ALTER ROLE drift_reader SET lock_timeout = '5s';
ALTER ROLE drift_reader SET idle_in_transaction_session_timeout = '60s';

-- ── public: every table, and the tables made from now on ─────────────────────
-- pg_dump locks each table it dumps, which needs table-level SELECT.
GRANT USAGE ON SCHEMA public TO drift_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO drift_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO drift_reader;

-- A push token's address and keys would let a thief send a notice to a
-- member's browser; the login keeps only which member has one, and since when.
-- add-only (1): no shipped client uses it: drift_reader is made in this file; neither TestFlight build 41 nor the website signs in as it
REVOKE SELECT ON public.push_subscriptions FROM drift_reader;
GRANT SELECT (id, user_id, created_at) ON public.push_subscriptions TO drift_reader;

-- The functions the checks call by name. None runs with its owner's rights;
-- each returns column names or a number.
GRANT EXECUTE ON FUNCTION
    public.viewing_fields(),
    public.viewing_fields_uncovered(),
    public.profile_tier_weight(p_tier text, p_role text, p_is_founding boolean),
    public.tier_weight(t text)
  TO drift_reader;

-- ── drift: what the checks need from outside public ──────────────────────────
CREATE SCHEMA drift;
GRANT USAGE ON SCHEMA drift TO drift_reader;

-- The upload rules of each bucket (storage.buckets holds no file).
CREATE FUNCTION drift.storage_buckets()
RETURNS TABLE (id text, name text, public boolean, file_size_limit bigint, allowed_mime_types text[], avif_autodetection boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types, b.avif_autodetection FROM storage.buckets b
$$;

-- The scheduled jobs, as the snapshot writes them.
CREATE FUNCTION drift.scheduled_jobs()
RETURNS TABLE (jobname text, schedule text, command text, database text, username text, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT j.jobname, j.schedule, j.command, j.database, j.username, j.active FROM cron.job j
$$;

-- How many scheduled runs failed since a moment.
CREATE FUNCTION drift.failed_job_runs_since(p_since timestamptz)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(*) FROM cron.job_run_details d WHERE d.status = 'failed' AND d.start_time >= p_since
$$;

-- The names of the Vault's secrets; never a value.
CREATE FUNCTION drift.vault_secret_names()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT s.name FROM vault.secrets s
$$;

-- How many rows the migration ledger holds.
CREATE FUNCTION drift.migration_ledger_rows()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(*) FROM supabase_migrations.schema_migrations
$$;

-- How many test accounts exist: the sealed world's (@e2e.test) or the old test@reelhouse.app.
CREATE FUNCTION drift.test_accounts()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(*) FROM auth.users u WHERE lower(u.email) LIKE '%@e2e.test' OR lower(u.email) = 'test@reelhouse.app'
$$;

-- How many admins have no verified second factor.
CREATE FUNCTION drift.admins_without_second_factor()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(*) FROM public.profiles p
  WHERE p.role = 'admin'
    AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified')
$$;

-- add-only (1): no shipped client uses them: each is made in this file; neither TestFlight build 41 nor the website calls them
REVOKE EXECUTE ON FUNCTION
    drift.storage_buckets(),
    drift.scheduled_jobs(),
    drift.failed_job_runs_since(timestamptz),
    drift.vault_secret_names(),
    drift.migration_ledger_rows(),
    drift.test_accounts(),
    drift.admins_without_second_factor()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    drift.storage_buckets(),
    drift.scheduled_jobs(),
    drift.failed_job_runs_since(timestamptz),
    drift.vault_secret_names(),
    drift.migration_ledger_rows(),
    drift.test_accounts(),
    drift.admins_without_second_factor()
  TO drift_reader;
