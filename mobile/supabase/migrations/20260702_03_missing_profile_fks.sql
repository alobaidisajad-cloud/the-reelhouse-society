-- ═══════════════════════════════════════════════════════════════════════════════
-- FK DRIFT — add the two missing profiles foreign keys the app embeds rely on
-- ═══════════════════════════════════════════════════════════════════════════════
-- Schema audit (Query 3) cross-checked every PostgREST embed in the app against the
-- real FK catalog. Two embeds have no backing FK, so those selects 400:
--
--   • reports.reporter_id → profiles   — ModerationService.getPendingReports uses
--     `profiles!reporter_id(...)`. reports only had a FK on target_user_id.
--   • dossier_comments.user_id → profiles — DossierService.getComments/addComment
--     use `profiles!inner(...)`. dossier_comments only had a FK on dossier_id.
--
-- Added NOT VALID (usable immediately for embeds, non-destructive on legacy rows),
-- then best-effort validated. profiles.id is 1:1 with auth.users.id.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

-- reports.reporter_id → profiles.id  (nullable → keep report if reporter is deleted)
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;

-- dossier_comments.user_id → profiles.id  (NOT NULL → cascade with the author)
ALTER TABLE public.dossier_comments DROP CONSTRAINT IF EXISTS dossier_comments_user_id_fkey;
ALTER TABLE public.dossier_comments
  ADD CONSTRAINT dossier_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;

-- Best-effort validation (never aborts on legacy orphans).
DO $$
BEGIN
  BEGIN ALTER TABLE public.reports VALIDATE CONSTRAINT reports_reporter_id_fkey;
  EXCEPTION WHEN others THEN RAISE NOTICE 'reports FK left NOT VALID: %', SQLERRM; END;

  BEGIN ALTER TABLE public.dossier_comments VALIDATE CONSTRAINT dossier_comments_user_id_fkey;
  EXCEPTION WHEN others THEN RAISE NOTICE 'dossier_comments FK left NOT VALID: %', SQLERRM; END;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
