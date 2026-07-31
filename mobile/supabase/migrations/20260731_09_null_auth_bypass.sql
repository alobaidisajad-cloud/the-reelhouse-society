-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 5 · CRITICAL — "only the host" checks let ANONYMOUS callers through
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NOT IN THE 124-FINDING REGISTER. Found 2026-07-31 by the SECURITY DEFINER
--    sweep that batch 2 started and never finished.
--
-- ── THE BUG ───────────────────────────────────────────────────────────────────
-- Six functions guard themselves like this:
--       IF auth.uid() <> v_creator THEN RAISE EXCEPTION 'Only the host ...'
-- For a caller with no session, auth.uid() is NULL. In SQL, `NULL <> anything` is
-- NULL — not TRUE. PL/pgSQL treats an IF on NULL as FALSE, so the exception NEVER
-- FIRES and execution continues into the mutation.
--
-- Confirmed on a replica:
--     IF NULL::uuid != '1111...'::uuid THEN ... -> "LET THROUGH"
--
-- Every one of these functions is SECURITY DEFINER, so RLS does not catch what the
-- guard missed. And while 20260627_01 line 227 grants EXECUTE `TO authenticated`,
-- Postgres ALSO grants EXECUTE to PUBLIC by default and nothing ever revoked it —
-- the same trap batch 2 hit with get_user_blocks. So `anon` reaches them.
--
-- ── CONFIRMED LIVE AGAINST PRODUCTION (fake UUIDs, nothing real touched) ───────
-- POSTed as anon with only the public API key:
--     remove_lounge_member      -> 204
--     decline_lounge_member     -> 204
--     approve_lounge_member     -> 204
--     set_lounge_member_status  -> 204
--     withdraw_lounge_message   -> 204
-- 204 means it ran and returned cleanly. Nothing was destroyed only because the
-- IDs were fake. With real IDs, a stranger holding the anon key — which ships
-- inside both apps and is therefore public — could:
--     • remove any member from any lounge
--     • ban or mute any member of any lounge
--     • admit anybody (including themselves) into any PRIVATE lounge
--     • delete any member's messages
--
-- This is remote, unauthenticated and destructive. It is the most serious thing
-- found in batch 5, and it is worse than the three findings the batch was about.
--
-- ── WHY THE JOIN FUNCTIONS ARE FINE ───────────────────────────────────────────
-- join_public_lounge, request_lounge_membership and create_lounge all open with
--     IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
-- which is correct. The same file wrote the host checks the unsafe way. This fix
-- makes the host checks match the ones that were already right.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────────
-- Two changes per function, belt and braces:
--   1. An explicit `auth.uid() IS NULL` rejection, so a session is required.
--   2. `IS DISTINCT FROM` instead of `<>` — the NULL-safe comparison. Even if the
--      first check were ever removed, this one cannot silently pass on NULL.
-- Then EXECUTE is revoked from PUBLIC and from anon. All three layers must fail
-- before this can reopen.
--
-- Signatures and behaviour for legitimate callers are UNCHANGED. All five have
-- real call sites in the app (withdraw_lounge_message has 9), so none is dropped.
--
-- ── PROVEN ON A REPLICA (PostgreSQL 18.4) ─────────────────────────────────────
--   BEFORE  anon removes a real member from a real lounge -> SUCCEEDS, row gone
--   AFTER   anon                                          -> 'Not authenticated'
--           a non-host member                             -> 'Only the host ...'
--           the actual host                               -> still works
--           the host cannot be removed                    -> still enforced
--           message author withdraws own message          -> still works
--           host withdraws someone else's message         -> still works
--           a stranger withdraws someone else's message   -> refused
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 · admit a pending member
CREATE OR REPLACE FUNCTION public.approve_lounge_member(p_lounge_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() IS DISTINCT FROM (SELECT creator_id FROM public.lounges WHERE id = p_lounge_id) THEN
    RAISE EXCEPTION 'Only the host can admit members'; END IF;
  UPDATE public.lounge_members SET status = 'approved'
   WHERE lounge_id = p_lounge_id AND user_id = p_user_id AND status = 'pending';
  IF FOUND THEN
    SELECT name INTO v_lname FROM public.lounges WHERE id = p_lounge_id;
    INSERT INTO public.notifications (user_id, type, from_user_id, message, related_lounge_id)
    VALUES (p_user_id, 'system', auth.uid(), 'You were admitted to ' || COALESCE(v_lname,'the lounge') || '.', p_lounge_id);
  END IF;
END $$;

-- 2 · decline a pending request
CREATE OR REPLACE FUNCTION public.decline_lounge_member(p_lounge_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() IS DISTINCT FROM (SELECT creator_id FROM public.lounges WHERE id = p_lounge_id) THEN
    RAISE EXCEPTION 'Only the host can decline requests'; END IF;
  DELETE FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = p_user_id AND status = 'pending';
END $$;

-- 3 · approve / mute / ban a member
CREATE OR REPLACE FUNCTION public.set_lounge_member_status(p_lounge_id uuid, p_user_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_creator uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT creator_id INTO v_creator FROM public.lounges WHERE id = p_lounge_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF auth.uid() IS DISTINCT FROM v_creator THEN RAISE EXCEPTION 'Only the host can do this'; END IF;
  IF p_user_id IS NOT DISTINCT FROM v_creator THEN RAISE EXCEPTION 'The host cannot be changed'; END IF;
  IF p_status NOT IN ('approved','muted','banned') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.lounge_members SET status = p_status WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
END $$;

-- 4 · remove a member
CREATE OR REPLACE FUNCTION public.remove_lounge_member(p_lounge_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_creator uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT creator_id INTO v_creator FROM public.lounges WHERE id = p_lounge_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF auth.uid() IS DISTINCT FROM v_creator THEN RAISE EXCEPTION 'Only the host can remove members'; END IF;
  IF p_user_id IS NOT DISTINCT FROM v_creator THEN RAISE EXCEPTION 'The host cannot be removed'; END IF;
  DELETE FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = p_user_id;
END $$;

-- 5 · withdraw a message (author OR host)
CREATE OR REPLACE FUNCTION public.withdraw_lounge_message(p_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author uuid; v_lounge uuid; v_creator uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT user_id, lounge_id INTO v_author, v_lounge FROM public.lounge_messages WHERE id = p_message_id;
  IF v_author IS NULL THEN RETURN; END IF;
  SELECT creator_id INTO v_creator FROM public.lounges WHERE id = v_lounge;
  IF auth.uid() IS DISTINCT FROM v_author AND auth.uid() IS DISTINCT FROM v_creator THEN
    RAISE EXCEPTION 'You can only withdraw your own dispatch'; END IF;
  UPDATE public.lounge_messages SET content = '', deleted_at = now() WHERE id = p_message_id;
END $$;

-- 6 · the same NULL bug in the analytics RPC — closed by REVOKE ALONE (step 7).
--
-- `IF auth.uid() != p_user_id THEN RAISE ...` is self-only by design, but NULL-blind,
-- so an anonymous caller sailed past it. Confirmed live: anon POSTed a real member's
-- id and received their full analytics — total logs, average rating, rating
-- distribution, monthly activity and streaks.
--
-- ⚠️ THE BODY IS DELIBERATELY NOT REWRITTEN HERE. It is 109 lines and contains two
-- non-trivial gap-and-island streak calculations. An earlier draft of this migration
-- rebuilt it from a partial read and silently replaced both streaks with literal 0 —
-- which would have broken the profile's streak display for every member. Rewriting
-- 109 lines of working logic to fix a guard is the wrong trade.
--
-- The revoke in step 7 closes this completely, because the NULL bug is ONLY
-- reachable by an anonymous caller:
--   • anon           -> no EXECUTE at all, so the guard is never even reached
--   • authenticated  -> auth.uid() is non-NULL, so `!=` behaves correctly and the
--                       self-only rule has always been enforced properly
-- Nothing legitimate changes. An authenticated member viewing SOMEONE ELSE already
-- gets this exception and the client falls back (fetchAnalyticsSummary returns null
-- on error; fetchAnalyticsLogs then returns [] for a non-self, non-Auteur target).
-- After this fix an anonymous viewer simply takes the path an authenticated
-- stranger already takes.
--
-- The NULL-blind comparison itself should still be corrected when that function is
-- next touched for another reason — noted for the batch 32 ledger, not forced here.

-- 7 · defence in depth — take the door away from anonymous callers entirely.
--
-- ⚠️ BOTH revokes are required on every line. Postgres grants EXECUTE to PUBLIC by
-- default, so `REVOKE ... FROM anon` alone is silently useless — anon still executes
-- via PUBLIC. This is the same trap batch 2 documented for get_user_blocks, and it
-- is precisely why the `GRANT ... TO authenticated` at 20260627_01:227 did not make
-- these functions authenticated-only.
REVOKE EXECUTE ON FUNCTION public.approve_lounge_member(uuid,uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decline_lounge_member(uuid,uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_lounge_member_status(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_lounge_member(uuid,uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_lounge_message(uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_analytics(uuid)                 FROM PUBLIC, anon;

-- and make sure the real callers still hold it
GRANT EXECUTE ON FUNCTION
  public.approve_lounge_member(uuid,uuid), public.decline_lounge_member(uuid,uuid),
  public.set_lounge_member_status(uuid,uuid,text), public.remove_lounge_member(uuid,uuid),
  public.withdraw_lounge_message(uuid), public.get_user_analytics(uuid)
TO authenticated;

COMMIT;

-- ── Verify (run after, as anon with only the public key) ──────────────────────
--   POST /rest/v1/rpc/remove_lounge_member     {"p_lounge_id":"<fake>","p_user_id":"<fake>"}
--   POST /rest/v1/rpc/approve_lounge_member    {...}
--   POST /rest/v1/rpc/set_lounge_member_status {...}
--   POST /rest/v1/rpc/decline_lounge_member    {...}
--   POST /rest/v1/rpc/withdraw_lounge_message  {"p_message_id":"<fake>"}
--   POST /rest/v1/rpc/get_user_analytics       {"p_user_id":"<real member>"}
--     -> every one must be 401/403, NOT 204/200.
--   In the app, signed in as a lounge host: admit, decline, mute, remove and
--   withdraw must all still work. As a non-host member: withdrawing your OWN
--   message must still work.
--
-- ── NOTE: the membership trigger ──────────────────────────────────────────────
-- protect_lounge_member_status() guards with `AND auth.uid() IS NOT NULL AND ...`,
-- so it deliberately SKIPS its check when there is no session. That is intentional
-- (service-role maintenance must not be blocked) and is now unreachable from
-- outside: anon can no longer call the functions, and no RLS policy lets anon
-- UPDATE lounge_members directly. Left as-is on purpose.
--
-- ── Rollback (restores the vulnerable behaviour — use only if a host action breaks)
-- GRANT EXECUTE ON FUNCTION public.approve_lounge_member(uuid,uuid)         TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.decline_lounge_member(uuid,uuid)         TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.set_lounge_member_status(uuid,uuid,text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.remove_lounge_member(uuid,uuid)          TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.withdraw_lounge_message(uuid)            TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_user_analytics(uuid)                 TO PUBLIC;
-- (The NULL-safe guards can stay; they are strictly safer and break nothing.)
