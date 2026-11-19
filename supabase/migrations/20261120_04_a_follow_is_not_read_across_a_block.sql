-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_04 — a member's follows, and the blocker's page and salons, are not read across a block.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A member the blocker had blocked read whom the blocker follows, and who follows them, through the
--      other end's open file: the follows rule reads a follow with one end open only when no block
--      stands with either end, on the functions of 20261120_03 (review round 14).
--   2. To the member blocked, the blocker's profile, salons, seats, reactions and old dossiers are rows
--      that do not exist: one restrictive rule on each table (review round 14).
--   Alone, so interactions, profiles, lounges, lounge_members, lounge_message_reactions and the two
--   old dossier tables are each held only for the instant its rule changes, to the end of this car.
-- Undo: mobile/supabase/migrations-down/20261120_04_a_follow_is_not_read_across_a_block.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A2 (the rule) · a member's follows are not read across a block (review round 14) ─────────────
--   A follow is seen when either end's file is open, as a follower list is: a member the blocker had
--   blocked still read whom the blocker follows and who follows them, through the other end's open
--   file. private.can_view_user_data now closes a file across a block (the car before this one), so a
--   follow whose two files are both open to the reader has no block at either end and reads as
--   before, at the same two questions; one with only one end open is read only when no block stands
--   between the reader and either end (private.no_block_stands_with). A member reads their own rows,
--   and a request stays its two members' alone, as before. The rule names the tests where they live
--   (private): public.can_view_user_data is the house's alone, and no member may run it.

-- add-only (3): it only fixes: the reads replayed as the members themselves, every follow as before and none with a member across a block at either end (H-A2.locks rehearsal)
ALTER POLICY interactions_select_authorized ON public.interactions
  USING (((auth.uid() = user_id) OR (auth.uid() = target_user_id)
          OR ((type <> 'follow_request'::text)
              AND ((private.can_view_user_data(user_id) AND private.can_view_user_data(target_user_id))
                   OR ((private.can_view_user_data(user_id) OR private.can_view_user_data(target_user_id))
                       AND private.no_block_stands_with(user_id, target_user_id))))));

-- ── The blocker is no one to the member they blocked (review round 14) ──────────────────────────────
--   To the member blocked, the blocker's profile row, salons, seats, reactions and old
--   dossiers are rows that do not exist, as an id no member holds: their member page says what it says
--   of a handle no one has, and nothing they read names the blocker. One more rule on each table,
--   restrictive, asking private.members_blocking_me once a statement (an InitPlan), so every row read
--   costs one array test, never a call. The blocker reads the member they blocked as before; an admin
--   and a visitor read everyone as before (the function answers none for them).
-- add-only (3): it only fixes: the reads replayed as the members themselves, every row as before and none of a member who blocked the reader (H-A2.locks rehearsal)
DROP POLICY IF EXISTS profiles_hide_from_the_blocked ON public.profiles;
-- add-only (3): it only fixes: the reads replayed as the members themselves, every row as before and none of a member who blocked the reader (H-A2.locks rehearsal)
CREATE POLICY profiles_hide_from_the_blocked ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT COALESCE((id = ANY (( SELECT private.members_blocking_me() AS members_blocking_me)::uuid[])), false)));
-- add-only (3): it only fixes: the reads replayed as the members themselves, every salon as before and none a member who blocked the reader hosts (H-A2.locks rehearsal)
DROP POLICY IF EXISTS lounges_hide_from_the_blocked ON public.lounges;
-- add-only (3): it only fixes: the reads replayed as the members themselves, every salon as before and none a member who blocked the reader hosts (H-A2.locks rehearsal)
CREATE POLICY lounges_hide_from_the_blocked ON public.lounges AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT COALESCE((creator_id = ANY (( SELECT private.members_blocking_me() AS members_blocking_me)::uuid[])), false)));
-- add-only (3): it only fixes: the reads replayed as the members themselves, every seat as before and none of a member who blocked the reader (H-A2.locks rehearsal)
DROP POLICY IF EXISTS lounge_members_hide_from_the_blocked ON public.lounge_members;
-- add-only (3): it only fixes: the reads replayed as the members themselves, every seat as before and none of a member who blocked the reader (H-A2.locks rehearsal)
CREATE POLICY lounge_members_hide_from_the_blocked ON public.lounge_members AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.members_blocking_me() AS members_blocking_me)::uuid[])), false)));
-- add-only (3): it only fixes: the reads replayed as the members themselves, every reaction as before and none of a member who blocked the reader (H-A2.locks rehearsal)
DROP POLICY IF EXISTS lounge_message_reactions_hide_from_the_blocked ON public.lounge_message_reactions;
-- add-only (3): it only fixes: the reads replayed as the members themselves, every reaction as before and none of a member who blocked the reader (H-A2.locks rehearsal)
CREATE POLICY lounge_message_reactions_hide_from_the_blocked ON public.lounge_message_reactions AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.members_blocking_me() AS members_blocking_me)::uuid[])), false)));
-- add-only (3): it only fixes: the reads replayed as the members themselves, every old dossier as before and none of a member who blocked the reader (H-A2.locks rehearsal)
DROP POLICY IF EXISTS dispatch_dossiers_legacy_hide_from_the_blocked ON public.dispatch_dossiers_legacy;
-- add-only (3): it only fixes: the reads replayed as the members themselves, every old dossier as before and none of a member who blocked the reader (H-A2.locks rehearsal)
CREATE POLICY dispatch_dossiers_legacy_hide_from_the_blocked ON public.dispatch_dossiers_legacy AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.members_blocking_me() AS members_blocking_me)::uuid[])), false)));
-- add-only (3): it only fixes: the reads replayed as the members themselves, every old certification as before and none of a member who blocked the reader (H-A2.locks rehearsal)
DROP POLICY IF EXISTS dossier_certifications_legacy_hide_from_the_blocked ON public.dossier_certifications_legacy;
-- add-only (3): it only fixes: the reads replayed as the members themselves, every old certification as before and none of a member who blocked the reader (H-A2.locks rehearsal)
CREATE POLICY dossier_certifications_legacy_hide_from_the_blocked ON public.dossier_certifications_legacy AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.members_blocking_me() AS members_blocking_me)::uuid[])), false)));
