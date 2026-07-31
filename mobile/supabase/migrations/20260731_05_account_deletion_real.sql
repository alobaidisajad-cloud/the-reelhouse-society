-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 3 · finding #42 — make "Delete Account" actually delete the account
-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ APPLIED TO PRODUCTION 2026-07-31 — verified on the LIVE database inside a
--    rolled-back transaction: a throwaway member with a log and an inbound follow
--    was deleted through the real function; auth user, profile, logs and follows
--    all 0 afterwards, and all 32 real members untouched.
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ TAKE A DATABASE SNAPSHOT FIRST. Deleted rows do not come back.
--
-- THE PROBLEM. The app tells the member "This will permanently destroy your
-- dossier, all logs, stacks, and critiques. This action is irreversible", gates it
-- behind an email OTP, then signs them out and wipes local storage — so it looks
-- completely deleted. Server-side, request_account_deletion only ran:
--     UPDATE profiles SET is_banned = TRUE, ban_reason = 'USER_REQUESTED_DELETION'
-- Nothing was deleted. USER_REQUESTED_DELETION appears exactly ONCE in the whole
-- repo — in the line that writes it. No purge job, no cron, nothing reads it.
-- App Store Guideline 5.1.1(v) requires real in-app deletion and reviewers test it;
-- GDPR Art. 17 erasure was recorded and never honoured.
--
-- WHAT THE LIVE DATABASE ACTUALLY SHOWED (the schema dump was stale on all three):
--   • handle_user_deletion IS wired — trigger on_auth_user_deleted, BEFORE DELETE
--     on auth.users. The audit finding said it was fired by nothing.
--   • 13 foreign keys have no ON DELETE rule, not 11.
--   • request_account_deletion is owned by `postgres`, and postgres HAS DELETE on
--     auth.users — so this fix needs no Edge Function and no app update.
--
-- WHY IT STILL FAILED. Reproduced on a replica: even with the trigger wired,
--     DELETE FROM auth.users
--   raises
--     violates foreign key constraint "interactions_target_user_id_fkey"
--   because the trigger clears interactions the member AUTHORED but not rows
--   pointing AT them. Any member with a single follower could not be deleted.
--
-- WHAT THIS FIXES. Seven of the thirteen blockers are already handled by the
-- trigger. The six it does not handle are cleared here first:
--     interactions.target_user_id · venues.owner_id · reports.target_user_id
--     mod_actions.admin_id · mod_actions.target_user_id · warnings.admin_id
-- (`venues` is the one the finding missed.)
--
-- MODERATION HISTORY IS ANONYMISED, NOT DELETED — a deliberate decision. If a
-- deletion erased complaint history, deletion becomes a laundering tool: harass,
-- delete, re-register, clean slate. GDPR Art. 17(3) permits retention for legal
-- claims. mod_actions.admin_id, mod_actions.target_user_id and warnings.admin_id
-- are NOT NULL today, so they are made nullable — all three tables are empty
-- (0 rows live), so this costs nothing now and is impossible later once populated.
--
-- PROVEN ON A REPLICA before applying, with two members and every table type:
--   BEFORE  DELETE FROM auth.users -> FK violation (reproduced exactly)
--   AFTER   the deleted member: 0 rows in auth.users, profiles, logs, lists,
--           watchlists, tickets, vaults, notifications, log_comments, push_tokens,
--           interactions (BOTH directions), venues
--           the other member: completely untouched
--           moderation rows: KEPT, with the identity nulled and the other
--           member's side preserved
--   FAILURE MODES
--           no session                  -> raises 'Not authenticated'
--           an unknown blocking table   -> ENTIRE delete rolls back; the member is
--                                          left fully intact, never half-deleted
--           the freed email             -> can register again
--
-- NO APP UPDATE NEEDED. The client already calls rpc('request_account_deletion'),
-- and both call sites (SettingsScreen.tsx:108 and :356) wrap it in try/catch and
-- return WITHOUT logging out — so a raise surfaces as an honest "Deletion failed"
-- and the account survives.
--
-- ⚠️ INVARIANT FOR THE LEDGER (batch 32): a NEW table with a foreign key to
-- profiles or auth.users that has no ON DELETE rule will make deletion fail. That
-- is the intended failure mode — it fails closed, not half-done — but whoever adds
-- such a table must also clear it here.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1 · let moderation history outlive the member, without their identity
ALTER TABLE public.mod_actions ALTER COLUMN admin_id       DROP NOT NULL;
ALTER TABLE public.mod_actions ALTER COLUMN target_user_id DROP NOT NULL;
ALTER TABLE public.warnings    ALTER COLUMN admin_id       DROP NOT NULL;

-- 2 · make deletion real
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Follows and endorsements pointing AT this member. The BEFORE DELETE trigger
  -- clears only rows they authored, which is why deletion fails today for anyone
  -- who has even one follower.
  DELETE FROM public.interactions WHERE target_user_id = uid;

  -- Anything they own that has no ON DELETE rule.
  DELETE FROM public.venues WHERE owner_id = uid;

  -- Moderation history: keep the record, drop the identity.
  UPDATE public.reports     SET target_user_id = NULL WHERE target_user_id = uid;
  UPDATE public.mod_actions SET admin_id       = NULL WHERE admin_id       = uid;
  UPDATE public.mod_actions SET target_user_id = NULL WHERE target_user_id = uid;
  UPDATE public.warnings    SET admin_id       = NULL WHERE admin_id       = uid;

  -- Fires on_auth_user_deleted (BEFORE DELETE), which purges the profile and the
  -- rows they authored; auth.users then cascades log_comments, notifications,
  -- physical_archive, push_tokens, tips, video_reviews and the rest.
  DELETE FROM auth.users WHERE id = uid;
END $$;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
-- Use a THROWAWAY test account, never a real member.
--   1. Register it, write a log, a list, a watchlist entry, follow someone, and
--      have someone follow it back.
--   2. Delete it through the app's own Settings flow.
--   3. SELECT count(*) FROM auth.users  WHERE id = '<test id>';   -- 0
--      SELECT count(*) FROM public.profiles WHERE id = '<test id>'; -- 0
--      SELECT count(*) FROM public.logs  WHERE user_id = '<test id>'; -- 0
--      SELECT count(*) FROM public.interactions
--        WHERE user_id = '<test id>' OR target_user_id = '<test id>'; -- 0
--   4. Confirm the OTHER member's feed and profile still render.
--   5. Confirm the freed email can register again.
--
-- ── Rollback ───────────────────────────────────────────────────────────────────
-- Restores the previous (ban-only) behaviour. It cannot bring back rows already
-- deleted — take a snapshot before the first live run.
--
-- CREATE OR REPLACE FUNCTION public.request_account_deletion() RETURNS void
--   LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $$
-- BEGIN
--   UPDATE public.profiles
--   SET is_banned = TRUE, ban_reason = 'USER_REQUESTED_DELETION'
--   WHERE id = auth.uid();
-- END $$;
--
-- The three ALTERs are reversible only while those columns contain no NULLs:
-- ALTER TABLE public.mod_actions ALTER COLUMN admin_id       SET NOT NULL;
-- ALTER TABLE public.mod_actions ALTER COLUMN target_user_id SET NOT NULL;
-- ALTER TABLE public.warnings    ALTER COLUMN admin_id       SET NOT NULL;
