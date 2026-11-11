-- ════════════════════════════════════════════════════════════════════════════
-- who_can_log_in_check.sql — every role that can log in to production. Read-only.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/read-only.cjs who_can_log_in_check.sql
--
-- Supabase support (SU-546605, 2026-11-10): pg_net's grants to PUBLIC cannot be changed per
-- project, so every role that can LOG IN may read net.http_request_queue, the headers of a request
-- queued there included. This lists those roles, and whether the clients' roles (anon,
-- authenticated) can log in, and whether net is a schema the Data API exposes.
-- ════════════════════════════════════════════════════════════════════════════
\pset format aligned
\pset tuples_only off
SELECT rolname, rolsuper, rolcanlogin, rolreplication, rolbypassrls
  FROM pg_roles WHERE rolcanlogin ORDER BY rolname;
SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'authenticator');
-- The schemas PostgREST serves (the authenticator's setting, or the default).
SELECT coalesce((SELECT string_agg(c, ',') FROM pg_db_role_setting s, unnest(s.setconfig) c
                  WHERE s.setrole = 'authenticator'::regrole AND c LIKE 'pgrst.db_schemas=%'), 'not set on the role') AS data_api_schemas;
