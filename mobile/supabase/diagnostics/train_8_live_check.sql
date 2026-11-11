-- Read-only: what 20261111_01, 20261111_02, 20261111_03 and 20261111_04 leave on production, each as one line.
-- Run with: node mobile/supabase/diagnostics/read-only.cjs train_8_live_check.sql

-- 20261111_01
SELECT 'notifications.pushed_at: a timestamp, empty until a push claims it',
  (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'pushed_at');
SELECT 'a_keeps_what_it_is keeps pushed_at the house''s',
  (pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgrelid = 'public.notifications'::regclass AND tgname = 'a_keeps_what_it_is')) LIKE '%''pushed_at''%')::text;

-- 20261111_02 and 20261111_03
SELECT 'idx_lounge_members_faces: built, whole',
  coalesce((SELECT indisvalid::text FROM pg_index WHERE indexrelid = to_regclass('public.idx_lounge_members_faces')), 'missing');
SELECT 'idx_logs_user_highest_rated: built, whole',
  coalesce((SELECT indisvalid::text FROM pg_index WHERE indexrelid = to_regclass('public.idx_logs_user_highest_rated')), 'missing');

-- 20261111_04
SELECT 'get_salon_member_faces: each salon''s first three, in the order they joined',
  (SELECT prosrc LIKE '%LIMIT 3%' AND prosrc NOT LIKE '%PARTITION BY%' FROM pg_proc WHERE oid = 'public.get_salon_member_faces(uuid[])'::regprocedure)::text;
SELECT 'get_salon_member_faces: who may run it, as before it (authenticated|anon; anon is shown no face)',
  has_function_privilege('authenticated', 'public.get_salon_member_faces(uuid[])', 'EXECUTE')::text
  || '|' || has_function_privilege('anon', 'public.get_salon_member_faces(uuid[])', 'EXECUTE')::text;
