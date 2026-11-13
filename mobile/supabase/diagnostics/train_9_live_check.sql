-- Read-only: what 20261112_01 and 20261112_02 leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_9_live_check.sql

-- 20261112_01
SELECT 'get_public_profile_analytics: the films joined once, the genres grouped, not sorted',
  (SELECT prosrc LIKE '%films_read AS MATERIALIZED%' AND prosrc LIKE '%GROUP BY g%' AND prosrc NOT LIKE '%COUNT(DISTINCT g%'
     FROM pg_proc WHERE oid = 'public.get_public_profile_analytics(uuid)'::regprocedure)::text;
SELECT 'get_public_profile_analytics: who may run it, as before it (authenticated|anon)',
  has_function_privilege('authenticated', 'public.get_public_profile_analytics(uuid)', 'EXECUTE')::text
  || '|' || has_function_privilege('anon', 'public.get_public_profile_analytics(uuid)', 'EXECUTE')::text;

-- 20261112_02
SELECT 'get_filtered_stacks_auth_cursor_v2: a search of few read by its matches, of many walked',
  (SELECT prosrc LIKE '%many AS MATERIALIZED%' AND prosrc LIKE '%matched AS MATERIALIZED%'
     FROM pg_proc WHERE oid = 'public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamptz, uuid, integer)'::regprocedure)::text;
SELECT 'get_filtered_stacks_auth_cursor_v2: who may run it, as before it (authenticated|anon)',
  has_function_privilege('authenticated', 'public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamptz, uuid, integer)', 'EXECUTE')::text
  || '|' || has_function_privilege('anon', 'public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamptz, uuid, integer)', 'EXECUTE')::text;
SELECT 'lists_title_trigram: the index the search reads, built, whole',
  coalesce((SELECT indisvalid::text FROM pg_index WHERE indexrelid = to_regclass('public.lists_title_trigram')), 'missing');
