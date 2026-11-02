-- Read-only: what 20261028_01, 20261028_02, 20261101_01 and 20261102_01 leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_4_live_check.sql

-- 20261028_01
SELECT 'the house''s settings: rows, floors, switches', count(*)::text || '|' || string_agg(min_build_ios || ',' || min_build_android || ',' || pushes_sent || ',' || films_synced, ';')
  FROM public.house_settings;
SELECT 'the switches anon or authenticated may read', count(*)::text
  FROM unnest(ARRAY['anon', 'authenticated']) AS r, unnest(ARRAY['pushes_sent', 'films_synced']) AS c
 WHERE has_column_privilege(r, 'public.house_settings', c, 'SELECT');
SELECT 'the floors anon may read', (has_column_privilege('anon', 'public.house_settings', 'min_build_ios', 'SELECT')
  AND has_column_privilege('anon', 'public.house_settings', 'min_build_android', 'SELECT'))::text;
SELECT 'the house''s settings anon or authenticated may write', count(*)::text
  FROM unnest(ARRAY['anon', 'authenticated']) AS r, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS w
 WHERE has_table_privilege(r, 'public.house_settings', w);
SELECT 'a notice''s push reads the switch first', (pg_get_functiondef('public.tg_notify_push()'::regprocedure) LIKE '%pushes_sent FROM public.house_settings%')::text;

-- 20261028_02
SELECT 'a filing is dated by the house', (pg_get_functiondef('public.dispatch_posts_pin_columns()'::regprocedure) LIKE '%NEW.updated_at := now()%NEW.edited_at := now()%')::text;
SELECT 'a critique is dated by the house', (pg_get_functiondef('public.dispatch_comments_pin_columns()'::regprocedure) LIKE '%NEW.edited_at := now()%')::text;
SELECT 'a salon''s read is dated by the house, enabled', count(*)::text
  FROM pg_trigger WHERE tgname = 'a_read_is_dated_by_the_house' AND tgrelid = 'public.lounge_members'::regclass AND NOT tgisinternal AND tgenabled = 'O';

-- 20261101_01
SELECT 'a stack''s three film triggers, enabled', count(*)::text
  FROM pg_trigger WHERE tgrelid = 'public.list_items'::regclass AND NOT tgisinternal AND tgenabled = 'O'
   AND tgname IN ('a_film_added_touches_the_stack', 'a_film_moved_touches_the_stack', 'a_film_taken_out_touches_the_stack');
SELECT 'save_stack: the old one, still there', (to_regprocedure('public.save_stack(uuid,text,text,boolean,boolean,jsonb,boolean)') IS NOT NULL)::text;
SELECT 'save_stack refuses an edit older than the stack', (pg_get_functiondef('public.save_stack(uuid,text,text,boolean,boolean,jsonb,boolean,timestamptz)'::regprocedure) LIKE '%PT412%')::text;
SELECT 'save_stack: anon may run it, authenticated may', has_function_privilege('anon', 'public.save_stack(uuid,text,text,boolean,boolean,jsonb,boolean,timestamptz)', 'EXECUTE')::text
  || '|' || has_function_privilege('authenticated', 'public.save_stack(uuid,text,text,boolean,boolean,jsonb,boolean,timestamptz)', 'EXECUTE')::text;

-- 20261102_01
SELECT 'calendar_days: anon and authenticated may run it', (has_function_privilege('anon', 'public.calendar_days(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.calendar_days(uuid)', 'EXECUTE'))::text;
SELECT 'calendar_days runs with the caller''s rights', (NOT prosecdef)::text FROM pg_proc WHERE oid = 'public.calendar_days(uuid)'::regprocedure;
