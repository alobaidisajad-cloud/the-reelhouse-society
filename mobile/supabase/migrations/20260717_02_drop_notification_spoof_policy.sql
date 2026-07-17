-- ═══════════════════════════════════════════════════════════════════════════════
-- F-4 (HIGH) — remove the notification-spoofing INSERT policy
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor.
--
-- Verified live 2026-07-17: policy "Users can send notifications from themselves"
--   (FOR INSERT WITH CHECK (from_user_id = auth.uid())) is present on public.notifications.
--   Its WITH CHECK only constrains the SENDER, not the recipient (user_id), message,
--   from_username, or type — so any authenticated user can insert a notification to
--   ANY recipient with a spoofed display name, and the AFTER INSERT push webhook
--   (tg_notify_push) then delivers a real push. This re-opened the NOTIF-SPOOF-1 hole
--   that 20260626_01 closed; it was added by 20260702_04 for a client stack-comment
--   insert that has since been removed (StackService SVC-1). No client code inserts
--   into notifications anymore — they come only from SECURITY DEFINER triggers, which
--   bypass RLS. So dropping this policy restores the deny-by-default secure state and
--   breaks nothing.
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can send notifications from themselves" ON public.notifications;

-- Post-condition: as a normal authed user, INSERT INTO notifications(...) must FAIL;
-- follow/endorse/comment/moderation notifications still appear (created by triggers).
