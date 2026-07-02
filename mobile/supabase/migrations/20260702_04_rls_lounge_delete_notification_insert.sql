-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS DRIFT — add two missing policies the app's operations require
-- ═══════════════════════════════════════════════════════════════════════════════
-- Schema audit (Query 5) found two client operations with no matching RLS policy,
-- so they silently fail:
--
--   • lounges DELETE — src/stores/lounge.ts deletes a lounge with
--     .eq('creator_id', user.id), but lounges had only INSERT/SELECT/UPDATE policies.
--     A creator could not delete their own lounge.
--   • notifications INSERT — src/services/StackService.ts inserts a "someone
--     commented on your stack" notification, but notifications had no INSERT policy.
--     The notification never saved.
--
-- Both policies are scoped tightly: a creator may only delete their own lounge, and
-- a user may only create a notification where they are the sender (from_user_id =
-- auth.uid()) — which prevents spoofing notifications as another user.
-- Server-created notifications (triggers / SECURITY DEFINER RPCs) bypass RLS and are
-- unaffected. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

DROP POLICY IF EXISTS "Creators can delete own lounges" ON public.lounges;
CREATE POLICY "Creators can delete own lounges" ON public.lounges
  FOR DELETE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Users can send notifications from themselves" ON public.notifications;
CREATE POLICY "Users can send notifications from themselves" ON public.notifications
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

COMMIT;
