-- ════════════════════════════════════════════════════════════════════════════
-- the_house_remembers_each_push_rehearsal.sql — 20261117_00. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_house_remembers_each_push_rehearsal.sql --with-train
--
-- The train applies 20261117_00 here (with_train); a sealed copy already holds it. Then the house finds
-- the table there, its rows keyed to members' accounts, and closed to every client. It reads the
-- catalogue alone, so the keys' hold on auth.users ends with a few milliseconds of cases. Read each
-- NOTICE as  case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- The train applies it here first (with_train), on production as the cars before it left it; a
-- sealed copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261117_00_the_house_remembers_each_push.sql
\endif

-- ── F11 table rehearsal · the memory of the pushes is there, the house's alone (review round 11) ──
-- Run inside the car's rehearsal transaction, after rehearsal_kit.sql and the car. The table is there,
-- keyed by the member who acted and the thing, its rows going with either member's account; row
-- security is on with no rule, and neither a visitor nor a member may read or write it.

SELECT pg_temp.rh_case('the memory of the pushes is there', 'true',
  (to_regclass('public.certifications_pushed') IS NOT NULL)::text) AS done \gset rh_
SELECT pg_temp.rh_case('its rows go with either member''s account', '2',
  (SELECT count(*)::text FROM pg_constraint
    WHERE conrelid = to_regclass('public.certifications_pushed') AND contype = 'f'
      AND confrelid = 'auth.users'::regclass AND confdeltype = 'c')) AS done \gset rh_
SELECT pg_temp.rh_case('row security is on, with no rule', 'true|0',
  (SELECT c.relrowsecurity::text || '|' || (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'certifications_pushed')::text
     FROM pg_class c WHERE c.oid = to_regclass('public.certifications_pushed'))) AS done \gset rh_
SELECT pg_temp.rh_case('no visitor or member may read or write it', 'false|false|false|false',
  (SELECT has_table_privilege('anon', c.oid, 'SELECT')::text || '|' || has_table_privilege('anon', c.oid, 'INSERT')::text || '|'
       || has_table_privilege('authenticated', c.oid, 'SELECT')::text || '|' || has_table_privilege('authenticated', c.oid, 'INSERT')::text
     FROM pg_class c WHERE c.oid = to_regclass('public.certifications_pushed'))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
