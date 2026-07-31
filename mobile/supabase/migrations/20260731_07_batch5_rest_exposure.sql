-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 5 · #7, #27, #34 — the anonymous REST exposure surface
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- Safe to run inside a transaction. Fully reversible (rollback at the bottom).
--
-- ── WHAT THE LIVE DATABASE ACTUALLY SHOWED (all three findings re-probed) ──────
--
-- The app curates a public profile surface: PUBLIC_PROFILE_COLUMNS in
-- src/services/ProfileDataService.ts:54 lists 16 columns + 3 specific JSONB keys.
-- Its own comment (line 7) says it exists "to avoid leaking preferences".
-- The DATABASE grants anon 29 columns. The app's curation is a client-side
-- convention the database never enforced.
--
-- Measured live 2026-07-31, as anon, against production:
--   readable: 29 columns   denied: email only
--   13 of those 29 are OUTSIDE the app's own public list, including the entire
--   moderation surface: is_banned, ban_reason, banned_at, suspended_until,
--   suspension_reason, warning_count.
--
-- All six moderation columns are ZERO/NULL on all 32 members today. Nothing has
-- leaked yet. The mechanism is fully open; it simply has nothing in it — the same
-- shape as batch 4's block graph. The first ban would publish its own reason,
-- worldwide, to anyone with the anon key.
--
-- ── #27 IS LARGELY INTENTIONAL, AND THE FINDING OVERSTATED IT ─────────────────
-- The finding reads as "anon can read 254 logs / 852 watchlist rows / all lists".
-- Re-probed: 255 / 852 / 9 — still true, but the REASON matters. RLS on those
-- tables is `USING (public.can_view_user_data(user_id))` (20260626_08), and ALL 32
-- members are public (is_social_private = true on ZERO profiles). Public members'
-- data being publicly readable is the product working as designed, and the
-- logged-out community feed depends on it.
-- Proven on a replica: a PRIVATE member is already correctly hidden from anon.
-- No change is made to those tables here. This part of #27 is NOT a defect.
--
-- ── #34 HAS NOT SPRUNG, BUT THE MECHANISM IS WORSE THAN FILED ─────────────────
-- 20260717_01 built its column list from information_schema at run time, so the
-- grant is a point-in-time snapshot. Verified live: only `email` is denied, so no
-- column is currently stranded. But the failure mode is harsher than "one unreadable
-- column": under a column-grant regime `SELECT *` FAILS ENTIRELY.
--     anon  GET /rest/v1/profiles?select=*   ->  42501 permission denied
-- The invariant is recorded at the bottom for batch 32. Nothing to repair today.
--
-- ── WHAT THIS MIGRATION CHANGES ───────────────────────────────────────────────
-- Nine columns lose their anon grant. `authenticated` is NOT touched, so every
-- signed-in path (the app, the web app, moderation tooling) is unaffected.
--
-- BLAST RADIUS — every one of the nine was traced through both codebases:
--   ban_reason         mobile 1 ref (a comment), web: written by TribunalPage only
--   banned_at          zero reads in either client
--   suspended_until    zero refs anywhere
--   suspension_reason  zero refs anywhere
--   warning_count      mobile ModerationService only (admin, authenticated)
--   badges             web useAchievements only, `.eq('id', userId)` and guarded by
--                      `if (!userId) return` — self, authenticated, never anon
--   current_streak     never read from this table; comes from the analytics RPC
--   longest_streak     never read from this table; same
--   last_log_date      zero references anywhere in either codebase
-- Selects AND filters were both checked: 0 uses of .eq/.neq/.gt/.is/.in/.order on
-- any of the nine. This matters because filtering on a column needs SELECT on it —
-- proven live: filtering profiles on `email` (not granted) returns 42501.
--
-- DELIBERATELY LEFT ALONE:
--   is_banned         MemberDiscoveryService.ts:33 does `.eq('is_banned', false)`.
--                     Revoking it would 42501 member discovery. The flag is not
--                     sensitive; the REASON is, and that is what this closes.
--   social_visibility web/src/api/supabase.ts:39 selects it as a real column.
--   updated_at        not sensitive; no security benefit to revoking.
--   preferences       CANNOT be closed server-side — see the note at the bottom.
--
-- PROVEN ON A REPLICA (PostgreSQL 18.4) before applying, reproducing the exact
-- 20260717_01 grant shape:
--   BEFORE  anon reads ban_reason/warning_count/badges; `SELECT *` -> 42501
--   AFTER   anon: those three -> 42501
--           anon: id, username -> still fine
--           anon: WHERE is_banned = false -> still fine (the filter still works)
--           anon: WHERE warning_count > 0 -> 42501 (fails closed, as intended)
--           authenticated: all three -> unchanged, still readable
--   ROLLBACK restored all three exactly.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 · take the moderation narrative away from anonymous callers
REVOKE SELECT (ban_reason)        ON public.profiles FROM anon;
REVOKE SELECT (banned_at)         ON public.profiles FROM anon;
REVOKE SELECT (suspended_until)   ON public.profiles FROM anon;
REVOKE SELECT (suspension_reason) ON public.profiles FROM anon;
REVOKE SELECT (warning_count)     ON public.profiles FROM anon;

-- 2 · and the gamification columns no anonymous path reads
REVOKE SELECT (badges)         ON public.profiles FROM anon;
REVOKE SELECT (current_streak) ON public.profiles FROM anon;
REVOKE SELECT (longest_streak) ON public.profiles FROM anon;
REVOKE SELECT (last_log_date)  ON public.profiles FROM anon;

-- 3 · close the fail-open in the privacy helper
--
-- The current body reads is_social_private into a variable; for a target_uid that
-- does not exist the variable stays NULL, COALESCE(NULL,false) is false, and the
-- function returns TRUE. Confirmed live against production:
--     POST /rest/v1/rpc/can_view_user_data {"target_uid":"<nonexistent>"} -> true
--
-- Today that grants access to nothing, because every caller passes a user_id taken
-- from an existing row. It matters only for ORPHANED rows — child rows whose
-- profile is gone — which batch 3 now prevents from being created. So this is
-- defence in depth against a state the schema should never reach, not a live hole.
-- Filed honestly: it is a robustness fix, not an exploit closure.
--
-- Proven on a replica across all six cases (anon/self/follower/stranger × public/
-- private): the ONLY behaviour that changes is the nonexistent target, true->false.
CREATE OR REPLACE FUNCTION public.can_view_user_data(target_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  is_private   boolean;
  profile_found boolean;
  is_following boolean;
BEGIN
  IF auth.uid() = target_uid THEN
    RETURN TRUE;
  END IF;

  SELECT is_social_private, TRUE
    INTO is_private, profile_found
    FROM public.profiles
   WHERE id = target_uid;

  -- No such member: fail CLOSED. Previously this fell through and returned TRUE.
  IF NOT COALESCE(profile_found, false) THEN
    RETURN FALSE;
  END IF;

  IF NOT COALESCE(is_private, false) THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.interactions
    WHERE type = 'follow'
      AND user_id = auth.uid()
      AND target_user_id = target_uid
  ) INTO is_following;

  RETURN COALESCE(is_following, false);
END $$;

COMMIT;

-- ── Verify (run after, as anon — use the anon key, no session) ─────────────────
--   GET /rest/v1/profiles?select=ban_reason&limit=1      -> 401 / 42501
--   GET /rest/v1/profiles?select=warning_count&limit=1   -> 401 / 42501
--   GET /rest/v1/profiles?select=badges&limit=1          -> 401 / 42501
--   GET /rest/v1/profiles?select=id,username&limit=1     -> 200 (unchanged)
--   GET /rest/v1/profiles?select=id&is_banned=eq.false   -> 200 (discovery intact)
--   POST /rest/v1/rpc/can_view_user_data {"target_uid":"<nonexistent uuid>"}
--                                                        -> false (was true)
--   and in the app, signed in: moderation queue still shows warning counts,
--   the profile screen still loads, the community feed still loads logged out.
--
-- ── Rollback (restores the previous exposure exactly) ─────────────────────────
-- GRANT SELECT (ban_reason, banned_at, suspended_until, suspension_reason,
--               warning_count, badges, current_streak, longest_streak,
--               last_log_date) ON public.profiles TO anon;
-- -- and restore the fail-open helper:
-- CREATE OR REPLACE FUNCTION public.can_view_user_data(target_uid uuid)
-- RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
-- AS $$
-- DECLARE is_private boolean; is_following boolean; BEGIN
--   IF auth.uid() = target_uid THEN RETURN TRUE; END IF;
--   SELECT is_social_private INTO is_private FROM public.profiles WHERE id = target_uid;
--   IF NOT COALESCE(is_private, false) THEN RETURN TRUE; END IF;
--   SELECT EXISTS (SELECT 1 FROM public.interactions
--     WHERE type='follow' AND user_id=auth.uid() AND target_user_id=target_uid)
--     INTO is_following;
--   RETURN COALESCE(is_following,false);
-- END $$;
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- INVARIANTS FOR THE LEDGER (batch 32)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. `profiles` and `logs` are both under COLUMN-level grants for `anon`. A new
--    column is NOT automatically readable. After any ALTER TABLE ... ADD COLUMN on
--    either table, decide explicitly and run:
--        GRANT SELECT (new_col) ON public.<table> TO anon;      -- public data
--        -- or grant to authenticated only, or to neither.
--    Skipping this does not fail loudly at deploy time; it fails later, as 42501,
--    only on the code path that reads the new column.
--
-- 2. `SELECT *` IS UNAVAILABLE to any role under a column-grant regime — it raises
--    42501 even for columns the role CAN read. Any client doing select('*') on
--    `profiles` or `logs` must name its columns instead. Known offenders, all
--    web-side and none fatal today:
--        web/src/pages/AuthPage.tsx:105    select('*') on profiles (verify poll)
--        web/src/pages/DebugPanel.tsx:34   select('*') on profiles
--        web/src/api/supabase.ts:55        select('*') on logs — DEAD CODE, 0 callers
--        web/src/components/profile/ProjectorRoom.tsx:28  select('*') on logs
--    AuthPage spreads the result with {...profile}; a null spread is a no-op, so
--    login degrades (profile fields missing) rather than breaking.
--
-- 3. Filtering or ordering on a column requires SELECT on that column. `is_banned`
--    is granted to anon ONLY because MemberDiscoveryService filters on it.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOT CLOSED HERE — #7 (`preferences`) REQUIRES THE LAUNCH BUILD
-- ═══════════════════════════════════════════════════════════════════════════════
-- CONFIRMED as a real leak, and MISFILED in the register as "deferred,
-- non-sensitive". Anon reads the raw `preferences` JSONB. Keys present live:
--     onboarded(19)  favorites(6)  notif_system(3)  notif_follows(3)
--     notif_comments(3)  notif_endorsements(3)  social_visibility(3)
--     privacy_annotations(3)  privacy_endorsements(3)  programmes(1)
-- The app exposes only programmes / favorites / hide_stats. Eight keys leak beyond
-- that, including the member's own PRIVACY settings — which is a targeting list.
--
-- IT CANNOT BE CLOSED WITH SQL ALONE. Three hard blockers, each verified:
--   (a) PUBLIC_PROFILE_COLUMNS extracts `preferences->programmes`. A JSONB path
--       still requires SELECT on the `preferences` COLUMN, so revoking it breaks
--       public profile viewing on the frozen TestFlight build.
--   (b) web FeedPage.tsx:31 and LogDetailPage.tsx:50 read OTHER members'
--       preferences.privacy_endorsements / privacy_annotations. Revoking breaks web.
--   (c) Moving the private keys to an owner-only table (the batch-1 private_notes
--       pattern) would make the frozen build show every notification and privacy
--       toggle as reset-to-default. A privacy setting that silently reverts is
--       WORSE than the leak. Rejected deliberately.
-- Correct fix, at the launch build: split `preferences` into a public JSONB
-- (programmes, favorites, hide_stats) and an owner-only table for the rest, and
-- ship the client change in the same release. Scheduled, not forgotten.
