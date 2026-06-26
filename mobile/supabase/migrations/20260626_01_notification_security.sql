-- ═══════════════════════════════════════════════════════════════════════════════
-- WAVE 1 — Notification security: close NOTIF-SPOOF-1 + NOTIF-DUP-1
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit refs: BACKEND-NOTIF-SPOOF-1 (HIGH), BACKEND-NOTIF-DUP-1 (MEDIUM)
--
-- NOTIF-SPOOF-1: 0002_rls_hardening tried to remove the baseline's permissive
--   INSERT policy but the DROP named it "...notifications." (trailing period) vs
--   the real "...notifications" (no period) → the DROP was a silent no-op and the
--   permissive `WITH CHECK (auth.role()='authenticated')` policy is still live →
--   any authenticated user can insert spoofed/phishing notifications to anyone.
--   Fix: drop it by the CORRECT name. Notifications are created only by the
--   SECURITY DEFINER triggers (handle_interaction_notification / notify_on_*),
--   which bypass RLS — so clients need no direct INSERT. An explicit deny makes
--   the intent unambiguous and prevents accidental re-introduction.
--
-- NOTIF-DUP-1: two AFTER INSERT triggers on `interactions` both insert a
--   notification — `tr_notify_interaction`→notify_on_interaction (no counts) and
--   `on_interaction_created`→handle_interaction_notification (also maintains
--   follower counts). Every follow/follow_request/endorse double-notifies. Keep
--   the count-bearing one; drop the other.
--
-- Idempotent. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── NOTIF-SPOOF-1 ──────────────────────────────────────────────────────────────
-- Drop the still-live permissive policy by its real name (no trailing period),
-- and also drop the period-typo name in case it was ever created literally.
DROP POLICY IF EXISTS "Authenticated users can insert notifications"  ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications." ON public.notifications;

-- Explicit, documented deny for client INSERTs. SECURITY DEFINER triggers (the
-- only legitimate writers) bypass RLS and are unaffected. service_role bypasses RLS.
DROP POLICY IF EXISTS "No direct client notification inserts" ON public.notifications;
CREATE POLICY "No direct client notification inserts" ON public.notifications
  FOR INSERT TO authenticated, anon
  WITH CHECK (false);

-- ── NOTIF-DUP-1 ────────────────────────────────────────────────────────────────
-- Remove the duplicate (count-less) notification trigger; keep on_interaction_created.
DROP TRIGGER IF EXISTS tr_notify_interaction ON public.interactions;

COMMIT;

-- Post-conditions to verify after COMMIT:
--   • As a normal authed user: INSERT INTO notifications(...) for ANY user_id must FAIL.
--   • A follow still produces exactly ONE notification row (from on_interaction_created)
--     and increments followers_count/following_count once.
