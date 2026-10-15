-- Before the read-only drift login is made: can the owner login make it as designed?
-- The login reads the public tables itself, and everything outside public only through
-- functions in its private schema, which run with postgres's rights. So postgres must be
-- able to hand on SELECT in public, and to read, itself, each table those functions read.
-- Every line reads the catalogue only. Each row is one need: 'yes', or 'NO' and what then.
--   node mobile/supabase/diagnostics/read-only.cjs drift_login_preflight_check.sql
WITH needs(need, ok, otherwise) AS (
  SELECT 'postgres may make a login that bypasses the row rules',
         (SELECT rolbypassrls AND rolcreaterole FROM pg_roles WHERE rolname = 'postgres'),
         'counts in public come from owner-rights functions too'
  UNION ALL
  SELECT 'postgres may hand on SELECT of every table in public',
         bool_and(has_table_privilege('postgres', format('%I.%I', schemaname, tablename), 'SELECT WITH GRANT OPTION')),
         'the schema check cannot lock those tables as the login'
  FROM pg_tables WHERE schemaname = 'public'
  UNION ALL
  SELECT 'postgres may set default privileges for new tables in public',
         (SELECT nspowner = 'postgres'::regrole FROM pg_namespace WHERE nspname = 'public')
           OR has_schema_privilege('postgres', 'public', 'CREATE'),
         'new tables are granted to the login by each migration instead'
  UNION ALL
  SELECT 'postgres may make a schema',
         has_database_privilege('postgres', current_database(), 'CREATE'),
         'the functions live in public, closed to everyone but the login'
  UNION ALL
  SELECT format('postgres itself enters schema %s', s),
         has_schema_privilege('postgres', s, 'USAGE'),
         'that schema''s check cannot run'
  FROM unnest(ARRAY['auth', 'storage', 'vault', 'cron', 'supabase_migrations']) AS s
  UNION ALL
  SELECT format('postgres itself reads %s(%s)', t, c),
         has_column_privilege('postgres', t, c, 'SELECT'),
         'that check cannot run'
  FROM (VALUES
    ('auth.users', 'email'), ('auth.mfa_factors', 'user_id'), ('auth.mfa_factors', 'status'),
    ('vault.secrets', 'name'), ('cron.job', 'command'), ('cron.job_run_details', 'status')
  ) AS cols(t, c)
  UNION ALL
  SELECT format('postgres itself reads %s', t),
         has_table_privilege('postgres', t, 'SELECT'),
         'that check cannot run'
  FROM unnest(ARRAY['storage.buckets', 'supabase_migrations.schema_migrations']) AS t
  UNION ALL
  SELECT 'no login of that name exists yet',
         NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'drift_reader'),
         'the existing role is read and judged before anything is made'
)
SELECT CASE WHEN ok THEN 'yes' ELSE 'NO ' END || ' | ' || need
       || CASE WHEN ok THEN '' ELSE ' | ' || otherwise END
FROM needs;
