-- ═══════════════════════════════════════════════════════════════════════════════
-- BACK-PORT PACK — codify live-only security fixes so the repo can rebuild securely
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY. On the current live DB these are NO-OPS (already in this state,
--    verified 2026-07-17) — their purpose is REBUILD SAFETY: prior audits patched
--    these live and never committed the fix, so a fresh deploy / DR-restore from the
--    repo would silently reopen them (the audit's systemic meta-finding).
--
--   F-6  reporter-forge:  drop the permissive reports INSERT policy (with_check=true).
--   F-7  hardcoded admin:  drop the hardcoded-UUID reports policies (role-based ones remain).
--   F-16 list IDOR:        drop the dead, exploitable batch_insert_list_items SECURITY
--                          DEFINER function (missed by the 20260609/20260622 hardening;
--                          checked list-ownership vs a client param, not auth.uid()).
--   F-17 follow-count vandalism: revoke direct EXECUTE on the count helpers (trigger-only).
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── F-6 ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_insert_reports ON public.reports;

-- ── F-7 (role-based admins_select_all_reports / admins_update_reports stay) ──────
DROP POLICY IF EXISTS admin_select_reports ON public.reports;
DROP POLICY IF EXISTS admin_update_reports ON public.reports;

-- ── F-16 (dead client-side; the app uses direct upsert with list_items RLS) ──────
DROP FUNCTION IF EXISTS public.batch_insert_list_items(uuid, uuid, jsonb);

-- ── F-17 (handle_follow_count_change trigger runs as definer — unaffected) ───────
REVOKE EXECUTE ON FUNCTION public.increment_follow_counts(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_follow_counts(uuid, uuid) FROM anon, authenticated, PUBLIC;

COMMIT;

-- NOTE (F-10, F-13 — NOT included here, need live-exact detail):
--   • F-10 profiles role CHECK: live already permits 'admin' (Tribunal works). Reconciling
--     the repo constraint requires the EXACT live definition (it also permits 'venue_owner'
--     for the venue-signup path). Capture it before writing the back-port:
--       SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conrelid='public.profiles'::regclass AND contype='c';
--   • F-13 avatar storage policies are correct on live (owner-folder-scoped) but live in the
--     Storage dashboard, not SQL — export them and commit as a repo artifact.
