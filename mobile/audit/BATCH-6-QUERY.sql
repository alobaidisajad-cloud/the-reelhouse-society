-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 6 · the one read-only query. Nothing is changed by this.
-- ═══════════════════════════════════════════════════════════════════════════════
-- Both findings (#123, #125) end with the same admission: "I examined policies,
-- not triggers, and that must be settled before this is applied." This settles it,
-- for every paid surface at once — not just the two the findings name.
--
-- Paste the whole thing. It returns three result sets; send back all three.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1 · every RLS policy on every paid surface ────────────────────────────────
SELECT
  c.relname                                   AS table_name,
  c.relrowsecurity                            AS rls_enabled,
  pol.polname                                 AS policy_name,
  CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                  WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                  ELSE 'ALL' END              AS command,
  pg_get_expr(pol.polqual,      pol.polrelid) AS using_expr,
  pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('dispatch_dossiers','lounges','lounge_members',
                    'physical_archive','log_private_notes','logs')
ORDER BY c.relname, command, pol.polname;


-- ── 2 · every TRIGGER on those same tables (the gap the findings left open) ───
SELECT
  c.relname            AS table_name,
  t.tgname             AS trigger_name,
  CASE WHEN t.tgtype::int & 1  = 1 THEN 'ROW' ELSE 'STATEMENT' END AS level,
  CASE WHEN t.tgtype::int & 2  = 2 THEN 'BEFORE'
       WHEN t.tgtype::int & 64 = 64 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
  concat_ws(',',
    CASE WHEN t.tgtype::int & 4  = 4  THEN 'INSERT' END,
    CASE WHEN t.tgtype::int & 8  = 8  THEN 'DELETE' END,
    CASE WHEN t.tgtype::int & 16 = 16 THEN 'UPDATE' END,
    CASE WHEN t.tgtype::int & 32 = 32 THEN 'TRUNCATE' END)          AS events,
  p.proname            AS function_name,
  pg_get_expr(t.tgqual, t.tgrelid) AS when_clause,
  p.prosrc             AS function_body
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p      ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN ('dispatch_dossiers','lounges','lounge_members',
                    'physical_archive','log_private_notes','logs')
ORDER BY c.relname, t.tgname;


-- ── 3 · does a tier helper already exist, and what tier values are really in use?
SELECT 'existing tier function' AS kind,
       p.proname                AS name,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosrc                 AS body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname ILIKE '%tier%' OR p.proname ILIKE '%entitle%'
       OR p.prosrc ILIKE '%is_founding%')
UNION ALL
SELECT 'tier value in use', coalesce(tier,'<null>'), count(*)::text, ''
  FROM public.profiles GROUP BY tier
UNION ALL
SELECT 'role value in use', coalesce(role,'<null>'), count(*)::text, ''
  FROM public.profiles GROUP BY role
UNION ALL
SELECT 'is_founding in use', coalesce(is_founding::text,'<null>'), count(*)::text, ''
  FROM public.profiles GROUP BY is_founding
ORDER BY 1, 2;
