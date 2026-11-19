-- Undo of 20261120_04: a member's follows, and the blocker's page and salons, are not read across a block, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A2 (the rule) undone · a follow is seen when either end's file is open, blocks unasked ───────
--   Named where the test still is (private) while this undoes: H-A2.down.sql then moves it back to
--   public, and the rule with it, as it stood.
ALTER POLICY interactions_select_authorized ON public.interactions
  USING (((auth.uid() = user_id) OR (auth.uid() = target_user_id)
          OR ((type <> 'follow_request'::text)
              AND (private.can_view_user_data(user_id) OR private.can_view_user_data(target_user_id)))));

-- The blocker is read by the member they blocked again, as every member is.
DROP POLICY IF EXISTS profiles_hide_from_the_blocked ON public.profiles;
DROP POLICY IF EXISTS lounges_hide_from_the_blocked ON public.lounges;
DROP POLICY IF EXISTS lounge_members_hide_from_the_blocked ON public.lounge_members;
DROP POLICY IF EXISTS lounge_message_reactions_hide_from_the_blocked ON public.lounge_message_reactions;
DROP POLICY IF EXISTS dispatch_dossiers_legacy_hide_from_the_blocked ON public.dispatch_dossiers_legacy;
DROP POLICY IF EXISTS dossier_certifications_legacy_hide_from_the_blocked ON public.dossier_certifications_legacy;
