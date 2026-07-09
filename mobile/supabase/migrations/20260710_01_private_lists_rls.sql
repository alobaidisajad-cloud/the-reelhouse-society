-- ═══════════════════════════════════════════════════════════════════════════════
-- Private stacks — honor lists.is_private at the RLS boundary
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- The SELECT policies on lists / list_items / list_comments gated only on
-- ACCOUNT privacy (can_view_user_data) and never on the stack's own is_private
-- flag. So a PUBLIC member's PRIVATE stack was fetchable by anyone holding its
-- id (an old lounge share, a link from before it was sealed) — the feeds filter
-- it, but the detail page fetches directly by id. Found during the stack-detail
-- redesign's reliability pass.
--
-- New rule everywhere: the owner always sees their own; everyone else needs the
-- account visible AND the stack not private. Blast radius verified safe: the
-- stacks feed RPC and the profile lists tab already filter is_private=false;
-- own-profile/export/import hit the owner branch; get_profile_counts is
-- SECURITY DEFINER; replace_list_items is owner-gated.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS lists_select_authorized ON public.lists;
CREATE POLICY lists_select_authorized ON public.lists
  FOR SELECT USING (
    auth.uid() = user_id
    OR (public.can_view_user_data(user_id) AND COALESCE(is_private, false) = false)
  );

DROP POLICY IF EXISTS list_items_select_authorized ON public.list_items;
CREATE POLICY list_items_select_authorized ON public.list_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = list_items.list_id
        AND (
          auth.uid() = l.user_id
          OR (public.can_view_user_data(l.user_id) AND COALESCE(l.is_private, false) = false)
        )
    )
  );

DROP POLICY IF EXISTS list_comments_select_authorized ON public.list_comments;
CREATE POLICY list_comments_select_authorized ON public.list_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = list_comments.list_id
        AND (
          auth.uid() = l.user_id
          OR (public.can_view_user_data(l.user_id) AND COALESCE(l.is_private, false) = false)
        )
    )
  );

COMMIT;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
-- All three policies should reference is_private:
--   SELECT tablename, policyname, qual FROM pg_policies
--   WHERE schemaname='public' AND policyname LIKE '%_select_authorized'
--     AND tablename IN ('lists','list_items','list_comments');
