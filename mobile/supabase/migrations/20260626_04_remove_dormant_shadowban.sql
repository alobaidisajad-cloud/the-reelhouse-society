-- ═══════════════════════════════════════════════════════════════════════════════
-- WAVE 1/2 — Remove the dormant auto-shadowban (SHADOWBAN-1) + clean logs SELECT
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit ref: BACKEND-SHADOWBAN-1 (real, currently inert) + supports HOOK-1
--
-- The 20260429 trust-and-safety engine added:
--   • an AFTER-INSERT trigger on user_reports that deducts trust_score -25 per
--     report with NO admin review (4 unique reporters → 0 → "shadowban"); and
--   • a logs SELECT policy "Elite Public Feed (Shadowban Enforced)" (visible if
--     author.trust_score > 0).
-- Today this is INERT: the shadowban policy is OR-combined with the later
-- can_view_user_data privacy policy (so public users stay visible at trust_score=0),
-- and trust_score is read nowhere. But it's a latent brigading/censorship landmine —
-- any future change to the privacy-OR interaction would suddenly activate mass
-- shadowbans from accumulated deductions, with no review/appeal/notification.
--
-- Decision (per MASTER_PLAN): remove the automated, unreviewed mechanism. Reports
-- are routed to the Tribunal (`reports`) instead (HOOK-1 client change), where a
-- human admin acts via the already-hardened resolve_moderation_report_v2. Logs
-- visibility is then governed solely by the correct privacy policy
-- (can_view_user_data) + the ban-enforcement RLS.
--
-- We KEEP the user_reports table and trust_score column (dropping them is more
-- destructive and unnecessary); we only remove the auto-action trigger and the
-- defeated shadowban SELECT policy. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Stop the unreviewed automatic trust_score deduction on every report.
DROP TRIGGER IF EXISTS trigger_process_user_report ON public.user_reports;

-- 2. Remove the defeated/dead shadowban SELECT policy on logs. After this, logs
--    SELECT is governed solely by "Logs viewable by authorized users"
--    (can_view_user_data, 20260613) — the correct privacy model.
DROP POLICY IF EXISTS "Elite Public Feed (Shadowban Enforced)" ON public.logs;

COMMIT;

-- Post-conditions:
--   • SELECT polname FROM pg_policy WHERE polrelid='public.logs'::regclass AND polcmd='r';
--     → should list the can_view_user_data policy, NOT the shadowban one.
--   • Submitting a report no longer mutates the target's trust_score.
-- Follow-up (client, HOOK-1): route PulseCardItem reports through reportStore.submitReport.
