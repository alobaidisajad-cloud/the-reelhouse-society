-- Read-only: what 20261104_01 and 20261104_02 leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_5_live_check.sql

-- 20261104_01
SELECT 'the house feed''s last two columns', string_agg(a, ',' ORDER BY n)
  FROM (SELECT unnest(proargnames) AS a, generate_subscripts(proargnames, 1) AS n
          FROM pg_proc WHERE oid = 'public.get_community_feed_auth_cursor(integer,timestamptz,uuid)'::regprocedure) x
 WHERE a IN ('alt_poster', 'physical_media');
SELECT 'the following feed''s last two columns', string_agg(a, ',' ORDER BY n)
  FROM (SELECT unnest(proargnames) AS a, generate_subscripts(proargnames, 1) AS n
          FROM pg_proc WHERE oid = 'public.get_following_feed_auth_cursor(integer,timestamptz,uuid)'::regprocedure) x
 WHERE a IN ('alt_poster', 'physical_media');
SELECT 'the house feed runs with the reader''s rights, the following feed as the definer',
  (SELECT (NOT prosecdef)::text FROM pg_proc WHERE oid = 'public.get_community_feed_auth_cursor(integer,timestamptz,uuid)'::regprocedure)
  || '|' || (SELECT prosecdef::text FROM pg_proc WHERE oid = 'public.get_following_feed_auth_cursor(integer,timestamptz,uuid)'::regprocedure);
SELECT 'both feeds: anon and authenticated may run them', (has_function_privilege('anon', 'public.get_community_feed_auth_cursor(integer,timestamptz,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_community_feed_auth_cursor(integer,timestamptz,uuid)', 'EXECUTE')
  AND has_function_privilege('anon', 'public.get_following_feed_auth_cursor(integer,timestamptz,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_following_feed_auth_cursor(integer,timestamptz,uuid)', 'EXECUTE'))::text;

-- 20261104_02
SELECT 'get_salon_last_words: anon may run it, authenticated may', has_function_privilege('anon', 'public.get_salon_last_words(uuid[])', 'EXECUTE')::text
  || '|' || has_function_privilege('authenticated', 'public.get_salon_last_words(uuid[])', 'EXECUTE')::text;
SELECT 'get_salon_last_words runs as the definer', prosecdef::text FROM pg_proc WHERE oid = 'public.get_salon_last_words(uuid[])'::regprocedure;
