-- ═══════════════════════════════════════════════════════════════════════════════
-- Interactions (follow-graph) privacy RLS — APPLIED MANUALLY 2026-06-26
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ do NOT `supabase db push` — see WAVE0_LIVE_NOTES.md. Applied via SQL editor.
--
-- The live interactions SELECT policy was "Interactions viewable by everyone."
-- USING (true) → the entire follow graph was public. Replaced with a privacy-aware
-- policy (matches the never-deployed 20260613 intent). Requires can_view_user_data
-- (created in 20260626_08). Owner manage/insert/delete policies left intact.
--
-- Effect: you can read an interaction if you're a party to it OR either party's
-- data is visible to you (public, or you follow them). Own-follows (the following
-- feed) and public users' follower lists stay visible; interactions strictly
-- between two private users you're not part of become hidden.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT pol.polname FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
           WHERE c.relname = 'interactions' AND pol.polcmd = 'r'
             AND pg_get_expr(pol.polqual, pol.polrelid) = 'true' LOOP
    EXECUTE format('DROP POLICY %I ON public.interactions', p.polname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS interactions_select_authorized ON public.interactions;
CREATE POLICY interactions_select_authorized ON public.interactions
FOR SELECT USING (
  auth.uid() = user_id
  OR auth.uid() = target_user_id
  OR public.can_view_user_data(user_id)
  OR public.can_view_user_data(target_user_id)
);

COMMIT;
