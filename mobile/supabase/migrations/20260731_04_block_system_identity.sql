-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 2 · finding #23 — the block system must not trust a caller-supplied identity
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- THE LEAK. Three SECURITY DEFINER functions take the *viewer* as a PARAMETER
-- instead of reading auth.uid(), and all three are granted to `anon`. Because
-- SECURITY DEFINER bypasses RLS on user_blocks, they answer questions about
-- anybody's blocks for anybody. Verified live against production:
--     user_blocks direct SELECT (anon)          -> []        RLS correctly blocks
--     is_hidden_by(<any>, <any>)   (anon)       -> false 200  answers anyway
--     is_blocked_by(<any>, <any>)  (anon)       -> false 200  answers anyway
--     get_user_blocks(<any user>)  (anon)       -> 200        returns THEIR LIST
-- Profile ids are anon-readable (32 returned in one call), so the whole block
-- graph is enumerable. Blocking is designed to be invisible; this made it
-- observable — and get_user_blocks does not merely answer yes/no, it dumps the
-- list.
--
-- CURRENT EXPOSURE, MEASURED: all 32 profiles answered anonymously, but no member
-- has blocked anyone yet, so 0 rows are exposed TODAY. The mechanism is fully
-- open; it simply has nothing in it. The first block would be world-readable.
--
-- ⚠️ TWO OF THESE ARE NOT IN THE FINDING. #23 names only is_hidden_by. Sweeping
-- every SECURITY DEFINER function that takes an identity parameter found
-- is_blocked_by (identical shape) and get_user_blocks (worse — it returns the
-- list). Fixing is_hidden_by alone would leave two identical doors open.
--
-- THE FIX. Ignore the caller-supplied id; read auth.uid() inside. Signatures are
-- unchanged, so nothing breaks. Every legitimate caller already passes its own
-- id, so results are identical:
--   • is_hidden_by  — 3 SQL callers, ALL pass auth.uid():
--       get_community_feed_auth_cursor, get_filtered_stacks_auth_cursor,
--       get_following_feed_auth_cursor. No client caller. No RLS policy uses it.
--   • get_user_blocks — 1 live client caller, blockStore.syncFromServer, called
--       from app/_layout.tsx:93 with useAuthStore.getState().user?.id — the
--       session user's own id. (ModerationService.getBlockList also calls it but
--       is itself never called.)
--   • is_blocked_by — ZERO callers anywhere: no SQL, no mobile, no web, no
--       policy. Fixed rather than dropped, because "it looked dead" has been
--       wrong before in this audit. Dropping belongs in a dead-code batch.
--
-- WHY anon KEEPS EXECUTE ON is_hidden_by. The three feed functions are
-- LANGUAGE sql STABLE — NOT SECURITY DEFINER — so they run with the caller's
-- privileges. A logged-out visitor browsing the community feed needs EXECUTE, or
-- the feed breaks. Verified against the deployed definitions.
--
-- WHY anon LOSES EXECUTE on the other two. get_user_blocks is only ever called by
-- an authenticated client, and is_blocked_by is called by nothing. Defence in
-- depth: if a future change reintroduces a caller-supplied identity, anon cannot
-- reach either one.
--
-- ALSO FIXES: none of the three set search_path. #23 called is_hidden_by "the only
-- unhardened SECURITY DEFINER left"; all three are hardened here.
--
-- PROVEN ON A REPLICA before applying — vulnerability reproduced, then closed:
--   BEFORE  anon: did ALICE block BOB?            -> true
--           anon: dump ALICE's list               -> 1 row
--           CAROL asks about ALICE                -> true
--   AFTER   all of the above                      -> false / 0 rows
--           ALICE: have I blocked BOB?            -> true   (unchanged)
--           ALICE: have I blocked CAROL?          -> false  (unchanged)
--           ALICE syncs her own list              -> 1 row  (unchanged)
--           feed shape as ALICE                   -> BOB hidden (unchanged)
--           feed shape as anon                    -> row shown (unchanged)
-- auth.uid() was confirmed to work correctly inside SECURITY DEFINER — that is
-- the semantic the whole fix rests on.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1 · the block/mute check used by all three feeds
CREATE OR REPLACE FUNCTION public.is_hidden_by(viewer_id uuid, author_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- viewer_id is deliberately ignored; the session decides who the viewer is.
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE blocker_id = auth.uid() AND blocked_id = author_id
  );
$$;

-- 2 · block-only variant (no callers today; hardened rather than dropped)
CREATE OR REPLACE FUNCTION public.is_blocked_by(viewer_id uuid, author_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE blocker_id = auth.uid() AND blocked_id = author_id AND type = 'block'
  );
$$;

-- 3 · the full list — this one returned data, not just a yes/no
CREATE OR REPLACE FUNCTION public.get_user_blocks(p_user_id uuid)
RETURNS TABLE(blocked_id uuid, type text, created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- p_user_id is deliberately ignored; a member may only sync their own list.
  SELECT ub.blocked_id, ub.type, ub.created_at
  FROM public.user_blocks ub
  WHERE ub.blocker_id = auth.uid()
  ORDER BY ub.created_at DESC;
$$;

-- 4 · defence in depth: anon needs only is_hidden_by (for the feeds).
--
-- ⚠️ BOTH revokes are required. Postgres grants EXECUTE to PUBLIC by default on
-- every function, so `REVOKE ... FROM anon` alone is silently useless — anon still
-- executes via PUBLIC. Proven on a replica: revoking only from anon left it able
-- to call both; revoking PUBLIC as well produced "permission denied for function"
-- while authenticated and service_role kept working.
-- is_hidden_by is deliberately NOT touched here — anon must keep it for the feeds.
REVOKE EXECUTE ON FUNCTION public.get_user_blocks(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_blocks(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_blocked_by(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_blocked_by(uuid, uuid) FROM anon;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
--   as anon:
--     POST /rest/v1/rpc/is_hidden_by  {"viewer_id":"<any>","author_id":"<any>"}
--        -> false, always (anon has no auth.uid())
--     POST /rest/v1/rpc/get_user_blocks {"p_user_id":"<any>"}   -> 401/403
--     POST /rest/v1/rpc/is_blocked_by   {...}                   -> 401/403
--   in the app (authenticated):
--     block someone, reopen the app -> they stay blocked (syncFromServer works)
--     the community feed, stacks feed and following feed all still load
--
-- ── Rollback (restores the vulnerable behaviour — use only if a feed breaks) ────
-- CREATE OR REPLACE FUNCTION public.is_hidden_by(viewer_id uuid, author_id uuid)
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
--   SELECT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = viewer_id AND blocked_id = author_id); $$;
-- CREATE OR REPLACE FUNCTION public.is_blocked_by(viewer_id uuid, author_id uuid)
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
--   SELECT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = viewer_id AND blocked_id = author_id AND type = 'block'); $$;
-- CREATE OR REPLACE FUNCTION public.get_user_blocks(p_user_id uuid)
-- RETURNS TABLE(blocked_id uuid, type text, created_at timestamp with time zone)
-- LANGUAGE sql STABLE SECURITY DEFINER AS $$
--   SELECT ub.blocked_id, ub.type, ub.created_at FROM user_blocks ub
--   WHERE ub.blocker_id = p_user_id ORDER BY ub.created_at DESC; $$;
-- GRANT EXECUTE ON FUNCTION public.get_user_blocks(uuid) TO anon, PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.is_blocked_by(uuid, uuid) TO anon, PUBLIC;
