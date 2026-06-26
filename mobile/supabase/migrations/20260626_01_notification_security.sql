-- ═══════════════════════════════════════════════════════════════════════════════
-- WAVE 1 — Notification security: close NOTIF-SPOOF-1
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit ref: BACKEND-NOTIF-SPOOF-1 (HIGH)
--
-- NOTIF-SPOOF-1: the permissive INSERT policy "Authenticated users can insert
--   notifications" (WITH CHECK auth.role()='authenticated') was confirmed LIVE →
--   any authenticated user could insert spoofed/phishing notifications to anyone.
--   Fix: drop it. Notifications are created only by SECURITY DEFINER triggers
--   (notify_on_interaction etc.), which bypass RLS — so clients need no direct
--   INSERT. With no INSERT policy, client inserts are denied by default; the
--   explicit deny below just documents the intent.
--
-- WAVE 0 NOTE (verified against the live DB 2026-06-26): the NOTIF-DUP-1 fix that
--   previously lived here (DROP TRIGGER tr_notify_interaction) was REMOVED. On the
--   live database the two interaction triggers are NOT duplicates — notify_on_interaction
--   (notifications) and handle_follow_count_change (counts) do different jobs, and
--   `on_interaction_created` does not exist. Dropping tr_notify_interaction would have
--   removed the ONLY notification trigger. NOTIF-DUP-1 is not a live problem.
--
-- Idempotent. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop the still-live permissive policy by its real name (no trailing period),
-- and also the period-typo name in case it was ever created literally.
DROP POLICY IF EXISTS "Authenticated users can insert notifications"  ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications." ON public.notifications;

-- Explicit, documented deny for client INSERTs. SECURITY DEFINER triggers (the
-- only legitimate writers) bypass RLS and are unaffected. service_role bypasses RLS.
DROP POLICY IF EXISTS "No direct client notification inserts" ON public.notifications;
CREATE POLICY "No direct client notification inserts" ON public.notifications
  FOR INSERT TO authenticated, anon
  WITH CHECK (false);

COMMIT;

-- Post-condition: as a normal authed user, INSERT INTO notifications(...) for ANY
-- user_id must FAIL; follow/endorse still produce notifications via the triggers.
