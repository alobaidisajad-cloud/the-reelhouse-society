-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 5 · finishing the SECURITY DEFINER sweep (the other nine functions)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- Batch 2 started this sweep and stopped after three functions. Batch 5 finished it.
-- That is how the anonymous lounge-takeover bypass (20260731_09) was found. This
-- migration closes what remained, and — just as importantly — records the ones that
-- turned out to be FINE, so nobody re-audits them from scratch.
--
-- ── PROBED LIVE AGAINST PRODUCTION, ALL NINE ──────────────────────────────────
-- Every probe used fake or zero-valued arguments and was chosen so the function's
-- own guard runs BEFORE any mutation. Nothing real was written.
--
--   get_user_analytics       ❌ LEAKED — anon received a real member's full
--                               analytics. FIXED in 20260731_09 (revoke).
--   claim_founding_seat      ✅ SAFE — 401 permission denied. The 20260622
--                               hardening ("revoke from PUBLIC, grant service_role
--                               only") is genuinely live.
--   replace_list_items       ✅ SAFE — live signature is (p_list_id, p_items) and it
--                               answers "Not authenticated". The REPO file is STALE:
--                               it shows an older (p_list_id, p_user_id, p_items)
--                               taking a caller-supplied identity. That version is
--                               NOT what is deployed. Do not "fix" from the file.
--   process_secure_tip       ⚠️ NOT REACHABLE with the documented signature
--                               (PGRST202 for p_to_user_id/p_amount/p_message).
--                               Repo body checks auth.uid() first and raises. Left
--                               alone — see the open item at the bottom.
--   batch_insert_list_items  ⚠️ DOES NOT EXIST on the live database, under any
--                               signature tried, including the exact parameter names
--                               the web app uses. Not a security issue — a BROKEN
--                               FEATURE. See the open item at the bottom.
--   get_lounge_unread_counts ⚠️ callable by anon; returns [] for a real member id.
--                               Consistent with reading auth.uid(), but NOT PROVEN.
--                               See the open item at the bottom.
--   get_profile_counts       ❌ no privacy gate at all — fixed below.
--   increment_dossier_views  ❌ no search_path; anon can call it — hardened below.
--   toggle_dossier_certify   ❌ no auth check, no search_path — fixed below.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1 · get_profile_counts — a private member's counts leaked to everyone ──────
--
-- SECURITY DEFINER, so it bypasses the RLS that protects logs, watchlists and
-- physical_archive, and it had NO privacy check. Only `lists_count` respected
-- anything (`is_private = false OR user_id = auth.uid()`). So for a member who sets
-- their profile private, a total stranger could still read how many films they have
-- logged, how big their watchlist is and how large their physical archive is.
--
-- LATENT TODAY, NOT EXPLOITED: `is_social_private` is true on ZERO of the 32
-- members, so nothing leaks right now. The same shape as batch 4's block graph —
-- the mechanism is fully open, it simply has nothing in it yet. It would start
-- leaking the moment one member chooses privacy, which is exactly when they are
-- relying on it.
--
-- WHY followers/following ARE NOT GATED: both already exist as anon-readable
-- COLUMNS on public.profiles (followers_count, following_count) and the public
-- profile renders them. Hiding them here while the column publishes them would be
-- theatre. Only the CONTENT counts — the ones RLS actually protects — are gated,
-- so this function now matches the privacy model the rest of the database enforces.
--
-- A blocked viewer gets zeros rather than an error, because the profile screen
-- renders a sealed profile for a private member; an exception would break it.
CREATE OR REPLACE FUNCTION public.get_profile_counts(p_user_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'logs_count',      CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id)
                            ELSE 0 END,
    'ledger_count',    CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id
                                    AND (rating > 0 OR COALESCE(review, '') <> ''))
                            ELSE 0 END,
    'watchlist_count', CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id)
                            ELSE 0 END,
    'vault_count',     CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id)
                            ELSE 0 END,
    'lists_count',     CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM lists WHERE user_id = p_user_id
                                    AND (is_private = false OR user_id = auth.uid()))
                            ELSE 0 END,
    -- already public via profiles.followers_count / profiles.following_count
    'followers_count', (SELECT COUNT(*) FROM interactions WHERE target_user_id = p_user_id AND type = 'follow'),
    'following_count', (SELECT COUNT(*) FROM interactions WHERE user_id = p_user_id AND type = 'follow')
  );
$$;

-- ── 2 · toggle_dossier_certify — no auth check whatsoever ─────────────────────
--
-- SECURITY DEFINER with no `SET search_path` and no check on auth.uid(). Probed
-- live as anon: it RAN, reached the INSERT, and was stopped only by
--     dossier_certifications.user_id ... NOT NULL
-- returning 23502. So the data is safe today BY ACCIDENT — a column constraint,
-- not a decision. If that column were ever made nullable, anonymous callers could
-- forge certifications and inflate certify_count at will.
--
-- Certifying is an account action by definition, so requiring a session is correct
-- and matches every call site (both apps only offer it to signed-in members).
CREATE OR REPLACE FUNCTION public.toggle_dossier_certify(dossier_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  already_certified boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.dossier_certifications
    WHERE user_id = v_uid AND dossier_id = dossier_uuid
  ) INTO already_certified;

  IF already_certified THEN
    DELETE FROM public.dossier_certifications
     WHERE user_id = v_uid AND dossier_id = dossier_uuid;
    UPDATE public.dispatch_dossiers
       SET certify_count = GREATEST(0, COALESCE(certify_count, 0) - 1)
     WHERE id = dossier_uuid;
    RETURN FALSE;
  ELSE
    INSERT INTO public.dossier_certifications (user_id, dossier_id)
    VALUES (v_uid, dossier_uuid);
    UPDATE public.dispatch_dossiers
       SET certify_count = COALESCE(certify_count, 0) + 1
     WHERE id = dossier_uuid;
    RETURN TRUE;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.toggle_dossier_certify(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.toggle_dossier_certify(uuid) TO authenticated;

-- ── 3 · increment_dossier_views — hardened, but deliberately still open ───────
--
-- SECURITY DEFINER with no `SET search_path` — that is the real defect and it is
-- fixed here. Every other SECURITY DEFINER function in this database pins it.
--
-- ⚠️ ANONYMOUS ACCESS IS KEPT ON PURPOSE. Dossiers are publicly readable
-- (dispatch_dossiers returns 200 to anon) and both clients call this the moment a
-- dossier is opened — mobile app/dossier/[id].tsx:158 and
-- ArticleReaderModal.tsx:98, web DispatchPage.tsx:224. The mobile app is browsable
-- logged out, so requiring a session would silently stop counting real readers.
--
-- HONEST LIMITATION: anyone can still inflate a view count by calling this
-- repeatedly. That is true of essentially any public view counter — a reader can
-- reload the page — and requiring a session would not stop a signed-in spammer
-- either. The real fix is de-duplication (one view per reader per dossier), which
-- needs a viewer table and client work. Recorded, not pretended away. `views` is a
-- vanity metric with no entitlement attached to it, so this is not gated on launch.
CREATE OR REPLACE FUNCTION public.increment_dossier_views(dossier_uuid uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.dispatch_dossiers
     SET views = COALESCE(views, 0) + 1
   WHERE id = dossier_uuid;
END $$;

COMMIT;

-- ── Verify (run after) ────────────────────────────────────────────────────────
--   as anon:
--     POST /rest/v1/rpc/toggle_dossier_certify  {"dossier_uuid":"<fake>"} -> 401/403
--     POST /rest/v1/rpc/increment_dossier_views {"dossier_uuid":"<fake>"} -> 204 (kept)
--     POST /rest/v1/rpc/get_profile_counts      {"p_user_id":"<real>"}
--        -> unchanged for today's members (all 32 are public)
--   in the app, signed in:
--     open a dossier            -> the view count still rises
--     tap certify / un-certify  -> still works, count moves by exactly 1
--     open any profile          -> all counts render as before
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
-- GRANT EXECUTE ON FUNCTION public.toggle_dossier_certify(uuid) TO PUBLIC;
-- (and restore the previous bodies from
--  supabase/migrations/20260713_02_fix_profile_counts.sql and
--  ../supabase/migrations/archive/dossier_engagement_migration.sql — but note the
--  latter is the ARCHIVE copy and both old versions are the vulnerable ones.)
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- STILL OPEN AFTER THIS MIGRATION — three items, stated plainly
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. batch_insert_list_items DOES NOT EXIST on the live database, yet
--    web/src/utils/letterboxdImport.ts:651 calls it with p_list_id / p_owner_id /
--    p_items. The web Letterboxd list import is therefore BROKEN — lists import
--    with no films. This is a functional bug, not a security one, and it belongs to
--    a web batch. Note the repo definition takes an owner id as a PARAMETER; if it
--    is ever restored, it must read auth.uid() instead.
--
-- 2. process_secure_tip could not be reached with the documented signature. The
--    repo body checks auth.uid() first and raises 'You must be authenticated to
--    tip.', which is the correct shape, but the LIVE definition was never
--    confirmed. It moves money. It must be read directly — not probed by calling
--    it — before anyone declares it safe.
--
-- 3. get_lounge_unread_counts is callable by anon and returned [] for a real
--    member's id. That is consistent with it reading auth.uid() internally, but it
--    is NOT proof: the member may simply have no unread messages. Its definition
--    lives only in an archived .js file, so the deployed version is unverified.
--
-- All three need the LIVE function definitions read, not guessed. The read-only
-- query that settles them is in audit/OPEN-DEFINER-QUESTIONS.md.
