-- Read-only: what 20261105_02 leaves on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_6_live_check.sql

-- 20261105_02
SELECT 'create_lounge: one, and it takes the form''s id',
  (SELECT string_agg(pg_get_function_identity_arguments(oid), ' | ') FROM pg_proc
    WHERE proname = 'create_lounge' AND pronamespace = 'public'::regnamespace);
SELECT 'create_lounge: the id is at its default, so an older call founds as before',
  pg_get_function_arguments('public.create_lounge(text,text,boolean,uuid)'::regprocedure);
SELECT 'create_lounge runs as the definer, its search path set', prosecdef::text || '|' || array_to_string(proconfig, ',')
  FROM pg_proc WHERE oid = 'public.create_lounge(text,text,boolean,uuid)'::regprocedure;
SELECT 'create_lounge: anon may run it, authenticated may (the gate inside refuses a visitor)',
  has_function_privilege('anon', 'public.create_lounge(text,text,boolean,uuid)', 'EXECUTE')::text
  || '|' || has_function_privilege('authenticated', 'public.create_lounge(text,text,boolean,uuid)', 'EXECUTE')::text;
SELECT 'create_lounge founds once per id (ON CONFLICT on the key)',
  (pg_get_functiondef('public.create_lounge(text,text,boolean,uuid)'::regprocedure) LIKE '%ON CONFLICT (id) DO NOTHING%')::text;
