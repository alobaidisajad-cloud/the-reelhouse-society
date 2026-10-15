-- Read-only: what 20261015_02, _03, _04 and _06 leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_1_live_check.sql

SELECT 'public functions PUBLIC may run (not an extension''s)', count(*)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
   AND has_function_privilege('public', p.oid, 'EXECUTE');

SELECT 'public functions anon may run (not an extension''s)', count(*)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
   AND has_function_privilege('anon', p.oid, 'EXECUTE');

SELECT 'the three salon functions anon may run', count(*)
  FROM unnest(ARRAY['public.salon_channel_readable(text)', 'public.salon_channel_seated(text)', 'public.send_salon_typing(uuid)']) AS f
 WHERE has_function_privilege('anon', f::regprocedure, 'EXECUTE');

SELECT 'functions postgres makes in public, given by default to anon or authenticated', count(*)
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace, aclexplode(d.defaclacl) a
 WHERE d.defaclrole = 'postgres'::regrole AND n.nspname = 'public' AND d.defaclobjtype = 'f'
   AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole);

SELECT 'tables with a_keeps_what_it_is, enabled, before update, per row', count(*)
  FROM pg_trigger t
 WHERE t.tgname = 'a_keeps_what_it_is' AND NOT t.tgisinternal AND t.tgenabled = 'O'
   AND (t.tgtype & 2) <> 0 AND (t.tgtype & 16) <> 0 AND (t.tgtype & 1) <> 0;

SELECT 'a_row_keeps_what_it_is runnable by anon or authenticated', count(*)
  FROM unnest(ARRAY['anon', 'authenticated']) AS r
 WHERE has_function_privilege(r, 'public.a_row_keeps_what_it_is()', 'EXECUTE');

SELECT 'the history job, scheduled and active', count(*)
  FROM cron.job WHERE jobname = 'the-job-history-is-kept-two-weeks' AND active;

SELECT 'runs in the history older than 15 days', count(*)
  FROM cron.job_run_details WHERE start_time < now() - interval '15 days';
