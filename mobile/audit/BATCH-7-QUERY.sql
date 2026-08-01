-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 7 · the one read-only query. Nothing is changed by this.
-- ═══════════════════════════════════════════════════════════════════════════════
-- #80 says ban policies cover ten tables and names two as uncovered. This checks
-- EVERY table both apps write to, and — the part the finding does not raise — it
-- also shows which tables let a member EDIT existing rows without a ban check.
-- Only `logs` and `dispatch_dossiers` have a ban policy on UPDATE, so a banned
-- member may still be able to rewrite an old list or comment into abuse.
-- Paste the whole thing; send back all three results.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1 · per table: is there a ban gate on INSERT, and on UPDATE? ─────────────
WITH targets(t) AS (
  VALUES ('logs'),('lists'),('list_items'),('list_comments'),('log_comments'),
         ('watchlists'),('interactions'),('dispatch_dossiers'),('dossier_comments'),
         ('dossier_certifications'),('lounges'),('lounge_members'),('lounge_messages'),
         ('lounge_message_reactions'),('physical_archive'),('profiles'),('programmes'),
         ('vaults'),('tickets'),('reports'),('user_reports'),('user_blocks'),
         ('notifications'),('push_tokens'),('analytics_events'),('error_logs'),
         ('log_private_notes')
),
pol AS (
  SELECT c.relname AS t, p.polname, p.polcmd, p.polpermissive,
         (p.polname ILIKE '%ban%'
          OR pg_get_expr(p.polqual, p.polrelid)      ILIKE '%not_banned%'
          OR pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%not_banned%') AS is_ban
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relnamespace = 'public'::regnamespace
)
SELECT
  tg.t AS table_name,
  CASE WHEN c.oid IS NULL THEN 'MISSING'
       WHEN NOT c.relrowsecurity THEN 'RLS OFF'
       ELSE 'on' END AS rls,
  CASE WHEN EXISTS (SELECT 1 FROM pol WHERE pol.t = tg.t AND pol.is_ban
                      AND pol.polcmd IN ('a') AND NOT pol.polpermissive)
       THEN 'yes' ELSE 'NO' END AS ban_gate_on_insert,
  CASE WHEN EXISTS (SELECT 1 FROM pol WHERE pol.t = tg.t AND pol.is_ban
                      AND pol.polcmd IN ('w') AND NOT pol.polpermissive)
       THEN 'yes' ELSE 'NO' END AS ban_gate_on_update,
  CASE WHEN EXISTS (SELECT 1 FROM pol WHERE pol.t = tg.t AND NOT pol.is_ban
                      AND pol.polcmd IN ('a','*'))
       THEN 'yes' ELSE 'no' END AS members_can_insert,
  CASE WHEN EXISTS (SELECT 1 FROM pol WHERE pol.t = tg.t AND NOT pol.is_ban
                      AND pol.polcmd IN ('w','*'))
       THEN 'yes' ELSE 'no' END AS members_can_edit
FROM targets tg
LEFT JOIN pg_class c ON c.relname = tg.t AND c.relnamespace = 'public'::regnamespace
ORDER BY ban_gate_on_insert, ban_gate_on_update, tg.t;


-- ── 2 · the helper every ban policy depends on ──────────────────────────────
SELECT
  p.proname                                 AS function_name,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  COALESCE(array_to_string(p.proconfig, ', '), '(no search_path pinned)') AS config,
  CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
       THEN 'yes' ELSE 'NO — every ban policy would fail' END AS authenticated_can_run,
  p.prosrc                                  AS body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_user_not_banned';


-- ── 3 · who is banned, and what sets a ban ──────────────────────────────────
SELECT 'banned members now' AS kind, count(*)::text AS value
  FROM public.profiles WHERE is_banned = true
UNION ALL
SELECT 'suspended (not expired)', count(*)::text
  FROM public.profiles WHERE suspended_until IS NOT NULL AND suspended_until > now()
UNION ALL
SELECT 'function that can set a ban: ' || p.proname,
       CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'invoker' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosrc ILIKE '%is_banned%'
   AND p.prosrc ILIKE '%update%'
ORDER BY 1;
