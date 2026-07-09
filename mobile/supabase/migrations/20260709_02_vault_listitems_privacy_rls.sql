-- ═══════════════════════════════════════════════════════════════════════════════
-- Privacy RLS — close the Vault + list_items read leaks
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- Verified live (pg_policies): both tables still carry a `USING (true)` SELECT
-- policy, so a PRIVATE member's physical archive (Vault) and the contents of ANY
-- list are world-readable — bypassing can_view_user_data entirely. The 06-26
-- privacy migration gated logs/lists/watchlists/comments but skipped these two.
--
-- Fix: drop the world-readable reads and replace with the same can_view_user_data
-- gate used everywhere else. list_items inherits its parent list's visibility.
-- Owner access is preserved: can_view_user_data returns TRUE for auth.uid() = self,
-- and physical_archive's "Users can read own archive" policy remains as well.
-- Legitimate reads (own data, public members, approved-followed members) are
-- unaffected — only private non-followers are cut off, which is the point.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Vault (physical_archive): stop world-reading private archives ──
DROP POLICY IF EXISTS "Anyone can read archives" ON public.physical_archive;
DROP POLICY IF EXISTS physical_archive_select_authorized ON public.physical_archive;
CREATE POLICY physical_archive_select_authorized ON public.physical_archive
  FOR SELECT USING (public.can_view_user_data(user_id));

-- ── list_items: contents inherit the parent list's visibility ──
DROP POLICY IF EXISTS "Users can select list items" ON public.list_items;
DROP POLICY IF EXISTS list_items_select_authorized ON public.list_items;
CREATE POLICY list_items_select_authorized ON public.list_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = list_items.list_id
        AND public.can_view_user_data(l.user_id)
    )
  );

COMMIT;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
-- No SELECT policy should have qual = true on either table anymore:
--   SELECT tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('physical_archive','list_items') AND cmd='SELECT'
--   ORDER BY tablename;
