-- After train 0 is applied: is each of its rules there, and does each still let members do what they did?
--   node mobile/supabase/diagnostics/read-only.cjs train_0_live_check.sql
WITH checks(what, expected, got) AS (
  SELECT 'functions in public anyone may run without a grant', '0',
    (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
       AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'))
  UNION ALL
  SELECT 'new functions start closed to everyone', 'true',
    (EXISTS (SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace = 0 AND d.defaclrole = 'postgres'::regrole
       AND d.defaclobjtype = 'f'
       AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 0)))::text
  UNION ALL
  SELECT 'the three channel rules on realtime.messages', '3',
    (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages'
       AND policyname IN ('a salon''s readers receive its channel', 'a seated member shares their presence',
                          'members receive the notices channel'))
  UNION ALL
  SELECT 'members may send typing; visitors may not', 'true|false',
    has_function_privilege('authenticated', 'public.send_salon_typing(uuid)', 'EXECUTE')::text || '|'
    || has_function_privilege('anon', 'public.send_salon_typing(uuid)', 'EXECUTE')::text
  UNION ALL
  SELECT 'no client reads the typing clock', 'false',
    (has_table_privilege('authenticated', 'public.salon_typing_sent', 'SELECT')
     OR has_table_privilege('anon', 'public.salon_typing_sent', 'SELECT'))::text
  UNION ALL
  SELECT 'members still open, join and set preferences; visitors still read counts', 'true',
    (has_function_privilege('authenticated', 'public.create_lounge(text, text, boolean)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.join_public_lounge(uuid)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.update_my_preferences(jsonb)', 'EXECUTE')
     AND has_function_privilege('anon', 'public.get_profile_counts(uuid)', 'EXECUTE'))::text
)
SELECT CASE WHEN got = expected THEN 'ok  ' ELSE 'MISS' END || ' | ' || what || ' | expected ' || expected || ', got ' || got
FROM checks;
