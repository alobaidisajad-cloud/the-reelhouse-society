-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS DRIFT (deep sweep) — UPDATE policies required by the app's upserts
-- ═══════════════════════════════════════════════════════════════════════════════
-- A Supabase .upsert() runs INSERT ... ON CONFLICT DO UPDATE, so it needs an UPDATE
-- policy for the conflict path. Two live upserts had none:
--
--   • user_blocks — ModerationService/blockStore upsert on (blocker_id, blocked_id)
--     to toggle block↔mute. Had INSERT/SELECT/DELETE only → the block↔mute change
--     (conflict → UPDATE type) was silently blocked.
--   • lounge_messages — sendMessage upserts on id for offline idempotency; a retry
--     that conflicts hits the UPDATE path. Had no UPDATE policy.
--
-- Both scoped to the owner. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

DROP POLICY IF EXISTS "users_update_own_blocks" ON public.user_blocks;
CREATE POLICY "users_update_own_blocks" ON public.user_blocks
  FOR UPDATE USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own messages" ON public.lounge_messages;
CREATE POLICY "Users can update own messages" ON public.lounge_messages
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMIT;
