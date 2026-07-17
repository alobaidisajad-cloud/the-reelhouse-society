-- ═══════════════════════════════════════════════════════════════════════════════
-- LOW-severity hardening — F-18, F-8
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY.
--
--   F-18 (verified live): increment_video_views(uuid) is anon-callable → a raw RPC
--        inflates any video's view count. video_reviews is a dormant feature. Revoke
--        anon EXECUTE (view-counting, if ever activated, should go through a
--        deduped/rate-limited path, not an open increment).
--   F-8  (verified live): error_logs INSERT policy 'authed_insert_error_logs' has
--        WITH CHECK (true) — any authenticated user can insert unbounded rows with
--        arbitrary content. No client writes error_logs; scope inserts to own rows.
--        (service_role bypasses RLS, so server-side error capture is unaffected.)
--        REBUILD-SAFETY: on live the open policy is named 'authed_insert_error_logs',
--        but the repo baseline names the wide-open policies "Anyone can insert error
--        logs" / "Anyone can insert error logs." (WITH CHECK true). Dropping only the
--        live name leaves the baseline-named policies in place on a rebuild-from-repo,
--        re-opening the hole. Drop all three names so repo == live in every path.
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── F-18 ────────────────────────────────────────────────────────────────────────
-- FROM PUBLIC too: functions get a default EXECUTE grant to PUBLIC that anon/authenticated
-- inherit, so revoking from anon alone is insufficient. (Not client-called — grep-verified.)
REVOKE EXECUTE ON FUNCTION public.increment_video_views(uuid) FROM PUBLIC, anon, authenticated;

-- ── F-8 ─────────────────────────────────────────────────────────────────────────
-- Drop every wide-open INSERT policy by ALL names it has carried (live + baseline),
-- then re-create a single own-row-scoped policy.
DROP POLICY IF EXISTS authed_insert_error_logs ON public.error_logs;
DROP POLICY IF EXISTS "Anyone can insert error logs"  ON public.error_logs;
DROP POLICY IF EXISTS "Anyone can insert error logs." ON public.error_logs;
CREATE POLICY authed_insert_error_logs ON public.error_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

COMMIT;
