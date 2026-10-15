-- ════════════════════════════════════════════════════════════════════════════
-- a_new_function_is_closed_until_granted_rehearsal.sql — 20261015_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_new_function_is_closed_until_granted_rehearsal.sql
--
-- 20261015_03 is applied on production; this shows it still holds there, and
-- on every sealed copy (db-integration.yml):
--   - a function made now can be run by no visitor and no member until granted;
--   - visitors run none of the salon channel's three functions; members keep them;
--   - the functions members and visitors call keep their grants.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

CREATE FUNCTION public.rh_made_now() RETURNS integer LANGUAGE sql AS 'SELECT 1';
DO $$ BEGIN
  PERFORM pg_temp.rh_case('a function made now: visitor|member may run it', 'false|false',
    has_function_privilege('anon', 'public.rh_made_now()', 'EXECUTE')::text || '|'
    || has_function_privilege('authenticated', 'public.rh_made_now()', 'EXECUTE')::text);
  PERFORM pg_temp.rh_case('visitors run none of the salon channel''s functions', 'false',
    (has_function_privilege('anon', 'public.salon_channel_readable(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.salon_channel_seated(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.send_salon_typing(uuid)', 'EXECUTE'))::text);
  PERFORM pg_temp.rh_case('members keep all three', 'true',
    (has_function_privilege('authenticated', 'public.salon_channel_readable(text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.salon_channel_seated(text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.send_salon_typing(uuid)', 'EXECUTE'))::text);
  PERFORM pg_temp.rh_case('every function anon or members could run before, they still can', '0',
    (SELECT count(*)::text FROM pg_proc p CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role)
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'rh_made_now'
        AND p.proname NOT IN ('salon_channel_readable', 'salon_channel_seated', 'send_salon_typing')
        AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = r.role::regrole AND a.privilege_type = 'EXECUTE')
        AND NOT has_function_privilege(r.role, p.oid, 'EXECUTE')));
  PERFORM pg_temp.rh_case('a visitor still reads a member''s counts; a member still opens a salon', 'true',
    (has_function_privilege('anon', 'public.get_profile_counts(uuid)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.create_lounge(text, text, boolean)', 'EXECUTE'))::text);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
