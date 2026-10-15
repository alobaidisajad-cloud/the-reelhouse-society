-- ════════════════════════════════════════════════════════════════════════════
-- a_read_only_login_for_the_nightly_checks_rehearsal.sql — 20261015_05. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_read_only_login_for_the_nightly_checks_rehearsal.sql --with-train
--
-- With with_train set, 20261015_05 is applied first, inside this transaction
-- (production, before the apply); without it, it must already be applied
-- (db-integration.yml, after up-down-up). Then, read from the catalogue and
-- tried as the login itself:
--   - it is a login with its limits, that passes the row rules and lapses;
--   - it reads every public table, and a table made later, and writes none;
--   - of push_subscriptions it reads only id, user_id and created_at;
--   - it enters no schema but public and drift: not auth, storage, vault,
--     cron, net or supabase_migrations, and it cannot decrypt;
--   - its seven functions answer, and no one else may run them.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\if :{?with_train}
\ir ../../../supabase/migrations/20261015_05_a_read_only_login_for_the_nightly_checks.sql
\endif

-- ── read from the catalogue ───────────────────────────────────────────────────
CREATE TABLE public.rh_made_later (id integer);
DO $$ BEGIN
  PERFORM pg_temp.rh_case('a login that passes the row rules, and nothing more', 'true|true|false|false|false|false|3',
    (SELECT concat_ws('|', r.rolcanlogin, r.rolbypassrls, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication,
       r.rolconnlimit) FROM pg_roles r WHERE r.rolname = 'drift_reader'));
  PERFORM pg_temp.rh_case('it lapses on 2027-04-01', '2027-04-01',
    (SELECT (r.rolvaliduntil AT TIME ZONE 'UTC')::date::text FROM pg_roles r WHERE r.rolname = 'drift_reader'));
  PERFORM pg_temp.rh_case('each session it opens is read-only and bounded', 'true',
    (SELECT s.setconfig @> ARRAY['default_transaction_read_only=on', 'statement_timeout=120s', 'lock_timeout=5s',
       'idle_in_transaction_session_timeout=60s']
     FROM pg_db_role_setting s WHERE s.setrole = 'drift_reader'::regrole AND s.setdatabase = 0)::text);
  PERFORM pg_temp.rh_case('public tables it cannot read (push_subscriptions aside)', '0',
    (SELECT count(*)::text FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
       AND c.relname <> 'push_subscriptions' AND NOT has_table_privilege('drift_reader', c.oid, 'SELECT')));
  PERFORM pg_temp.rh_case('a table made later is read too', 'true',
    has_table_privilege('drift_reader', 'public.rh_made_later', 'SELECT')::text);
  PERFORM pg_temp.rh_case('public tables it may write to, in any way', '0',
    (SELECT count(*)::text FROM pg_class c CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) w(p)
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
        AND has_table_privilege('drift_reader', c.oid, w.p)));
  PERFORM pg_temp.rh_case('push tokens: id, user_id, created_at | endpoint, p256dh, auth', 'true|false',
    (has_column_privilege('drift_reader', 'public.push_subscriptions', 'id', 'SELECT')
     AND has_column_privilege('drift_reader', 'public.push_subscriptions', 'user_id', 'SELECT')
     AND has_column_privilege('drift_reader', 'public.push_subscriptions', 'created_at', 'SELECT'))::text || '|'
    || (has_column_privilege('drift_reader', 'public.push_subscriptions', 'endpoint', 'SELECT')
     OR has_column_privilege('drift_reader', 'public.push_subscriptions', 'p256dh', 'SELECT')
     OR has_column_privilege('drift_reader', 'public.push_subscriptions', 'auth', 'SELECT'))::text);
  PERFORM pg_temp.rh_case('schemas it enters, besides public and drift', '',
    coalesce((SELECT string_agg(n.nspname, ',' ORDER BY n.nspname) FROM pg_namespace n
      WHERE n.nspname IN ('auth', 'storage', 'vault', 'cron', 'net', 'supabase_migrations', 'realtime', 'pgsodium')
        AND has_schema_privilege('drift_reader', n.oid, 'USAGE')), ''));
  PERFORM pg_temp.rh_case('it cannot decrypt', 'false',
    has_table_privilege('drift_reader', 'vault.decrypted_secrets', 'SELECT')::text);
  PERFORM pg_temp.rh_case('drift functions it runs | anyone else may run', '7|0',
    (SELECT count(*) FILTER (WHERE has_function_privilege('drift_reader', p.oid, 'EXECUTE'))::text || '|'
       || count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
                             OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text
     FROM pg_proc p WHERE p.pronamespace = 'drift'::regnamespace));
END $$;

-- ── tried as the login ────────────────────────────────────────────────────────
-- Whether a statement is let through, run as whoever is playing.
CREATE FUNCTION pg_temp.rh_try(statement text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RETURN 'allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'refused';
END $$;
GRANT drift_reader TO postgres;
GRANT EXECUTE ON FUNCTION pg_temp.rh_try(text) TO drift_reader;
SET LOCAL ROLE drift_reader;
SELECT
  pg_temp.rh_try('SELECT count(*) FROM public.profiles') AS profiles,
  pg_temp.rh_try('SELECT count(id) FROM public.push_subscriptions') AS push_ids,
  pg_temp.rh_try('SELECT endpoint FROM public.push_subscriptions LIMIT 1') AS push_endpoint,
  pg_temp.rh_try('SELECT count(*) FROM auth.users') AS auth_users,
  pg_temp.rh_try('SELECT cron.schedule(''rh'', ''* * * * *'', ''SELECT 1'')') AS cron_schedule,
  pg_temp.rh_try('UPDATE public.profiles SET bio = bio WHERE false') AS writes,
  pg_temp.rh_try('SELECT drift.test_accounts(), drift.admins_without_second_factor(), drift.migration_ledger_rows()')
    AS counts,
  pg_temp.rh_try('SELECT count(*) FROM drift.storage_buckets()') AS buckets,
  pg_temp.rh_try('SELECT count(*) FROM drift.scheduled_jobs()') AS jobs,
  pg_temp.rh_try('SELECT count(*) FROM drift.vault_secret_names()') AS secret_names,
  pg_temp.rh_try('SELECT drift.failed_job_runs_since(now() - interval ''1 day'')') AS failed_runs
\gset as_
RESET ROLE;
SELECT pg_temp.rh_case('as the login: every public table, and push ids', 'allowed|allowed',
  :'as_profiles' || '|' || :'as_push_ids') AS done \gset rh_
SELECT pg_temp.rh_case('as the login: a push address, a sign-in, a new job, a write', 'refused|refused|refused|refused',
  concat_ws('|', :'as_push_endpoint', :'as_auth_users', :'as_cron_schedule', :'as_writes')) AS done \gset rh_
SELECT pg_temp.rh_case('as the login: each of its functions answers', 'allowed|allowed|allowed|allowed|allowed',
  concat_ws('|', :'as_counts', :'as_buckets', :'as_jobs', :'as_secret_names', :'as_failed_runs')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
