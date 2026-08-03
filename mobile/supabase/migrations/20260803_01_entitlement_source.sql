-- ═══════════════════════════════════════════════════════════════════════════════
-- Batch 12 · Stage 5a — a payment provider may only lower a tier it granted
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- ── THE BUG THIS CLOSES (live today) ─────────────────────────────────────────
-- A member buys Auteur on the WEBSITE through PayTabs. They install the app, sign in
-- with the same account, and tap "Restore Purchases" — a button Apple REQUIRES.
-- RevenueCat checks Apple and truthfully answers "this Apple ID never bought
-- anything". The app synced that answer and wrote tier='cinephile'. The purchase was
-- destroyed on BOTH surfaces (same account) and they would have to pay again.
-- The old shield (revenueCat.ts:383) covered only 'founding'.
--
-- ── WHY NOT SIMPLY STOP DOWNGRADING ──────────────────────────────────────────
-- There is NO RevenueCat webhook in either supabase/functions tree — verified by
-- listing both. The app's sync is the ONLY thing that ever retires a lapsed App Store
-- subscription. So the rule is not "never downgrade", it is:
--
--        A provider may only LOWER a tier that it granted.
--
-- ── WHY SERVER-SIDE ──────────────────────────────────────────────────────────
-- The TestFlight build cannot change until launch, so a client guard would protect
-- nobody until then. This protects the shipped build the moment it is applied.
--
-- ── TWO DESIGN DEFECTS CAUGHT BEFORE THIS WAS EVER RUN ───────────────────────
-- 1. The first draft added a THIRD parameter to apply_entitlement, creating two
--    overloads of one name. PostgREST resolves overloads by argument-name set, and an
--    ambiguity there would fail on a PAYMENT path. The authority is therefore a NEW
--    name — grant_entitlement — and apply_entitlement stays single-signature.
--
-- 2. The first draft routed the legacy 2-arg form to source 'manual' and called that
--    "the protected direction". It is the opposite: 'manual' bypasses the rule
--    entirely (it is the support escape hatch). Between applying the SQL and
--    redeploying the functions, a RevenueCat restore would still have destroyed a
--    PayTabs purchase — the exact bug this migration exists to close. The legacy form
--    now uses source 'legacy', which can RAISE a tier but never LOWER one and never
--    claims ownership. Fail safe for the whole deploy window.
--
-- ── ORDER OF OPERATIONS ──────────────────────────────────────────────────────
--     1. run this migration                    (bug closed from this moment)
--     2. deploy sync-entitlement               -> grant_entitlement(..., 'revenuecat')
--     3. deploy paytabs-handler --no-verify-jwt -> grant_entitlement(..., 'paytabs')
-- Step 3 also fixes a separate, worse bug: paytabs-handler is deployed with
-- verify_jwt=true, so Supabase's gateway rejects PayTabs' server-to-server IPN with
-- 401 before the code runs. Proven by probing the live endpoint — the reply is the
-- gateway's {"code":"UNAUTHORIZED_NO_AUTH_HEADER"}, not the handler's own
-- 'Unauthorized Webhook Signature'. Web payments are charged and never delivered.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Where each entitlement came from ──────────────────────────────────────
-- NULL = legacy/unknown, and PROTECTED: nothing may downgrade it except 'manual'.
-- All 32 existing rows are NULL, so no current member can be demoted by a provider
-- that did not sell to them.
--
-- NOTE: 'legacy' is deliberately NOT permitted here. It is a caller identity, never a
-- stored value — grant_entitlement never writes it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS entitlement_source text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_entitlement_source_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_entitlement_source_check
  CHECK (entitlement_source IS NULL
         OR entitlement_source IN ('revenuecat', 'paytabs', 'manual'));

COMMENT ON COLUMN public.profiles.entitlement_source IS
  'Which provider granted the current tier. A provider may only LOWER a tier it '
  'granted (enforced in grant_entitlement). NULL = legacy/manual, fully protected.';


-- ── 2. The authority ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_entitlement(
  p_user_id uuid,
  p_tier    text,
  p_source  text
)
RETURNS TABLE(out_role text, out_tier text, out_source text, out_applied boolean, out_reason text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_db_value  text;
  v_cur_tier  text;
  v_cur_role  text;
  v_cur_found boolean;
  v_cur_src   text;
  v_cur_w     int;
  v_new_w     int;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'grant_entitlement: user id is required' USING ERRCODE = '22023';
  END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('cinephile','archivist','auteur','founding') THEN
    RAISE EXCEPTION 'grant_entitlement: unknown tier %', coalesce(p_tier,'<null>')
      USING ERRCODE = '22023';
  END IF;
  -- 'legacy' means "an un-redeployed caller that cannot identify itself". It is
  -- accepted as an identity but never stored (see the ownership CASE below).
  IF p_source IS NULL OR p_source NOT IN ('revenuecat','paytabs','manual','legacy') THEN
    RAISE EXCEPTION 'grant_entitlement: unknown source %', coalesce(p_source,'<null>')
      USING ERRCODE = '22023';
  END IF;

  -- profiles_role_check forbids 'founding' as a ROLE and both columns take the same
  -- value, so a founding purchase is stored as auteur. The SEAT is recorded separately
  -- by claim_founding_seat setting is_founding.
  v_db_value := CASE WHEN p_tier = 'founding' THEN 'auteur' ELSE p_tier END;

  -- Lock the row so two providers cannot race read-then-write.
  SELECT p.tier, p.role, coalesce(p.is_founding,false), p.entitlement_source
    INTO v_cur_tier, v_cur_role, v_cur_found, v_cur_src
    FROM public.profiles p
   WHERE p.id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_entitlement: no profile with id %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Effective weight, mirroring resolveTier in src/utils/tier.ts:91-101 — the highest
  -- of the tier column and (is_founding ? founding : role). Inlined rather than calling
  -- tier_weight() so this has no dependency that could be dropped from under it.
  v_cur_w := GREATEST(
    CASE lower(coalesce(v_cur_tier,''))
      WHEN 'founding' THEN 3 WHEN 'auteur' THEN 2 WHEN 'archivist' THEN 1 ELSE 0 END,
    CASE WHEN v_cur_found THEN 3 ELSE
      CASE lower(coalesce(v_cur_role,''))
        WHEN 'founding' THEN 3 WHEN 'auteur' THEN 2 WHEN 'archivist' THEN 1 ELSE 0 END
    END
  );
  v_new_w :=
    CASE p_tier
      WHEN 'founding' THEN 3 WHEN 'auteur' THEN 2 WHEN 'archivist' THEN 1 ELSE 0 END;

  -- ── THE RULE ───────────────────────────────────────────────────────────────
  -- A LOWER tier may only be written by the provider that granted the current one.
  -- NULL source (legacy rows) is DISTINCT FROM every provider, so it is protected from
  -- all of them. 'legacy' is never stored, so it never matches either — an
  -- un-redeployed caller can raise but never lower. 'manual' always passes: support
  -- must be able to correct anything.
  IF v_new_w < v_cur_w
     AND p_source <> 'manual'
     AND v_cur_src IS DISTINCT FROM p_source THEN
    RETURN QUERY SELECT
      v_cur_role, v_cur_tier, v_cur_src, false,
      format('refused: %s may not lower a tier granted by %s',
             p_source, coalesce(v_cur_src,'an unknown source'));
    RETURN;
  END IF;

  -- ── WHO OWNS THE ENTITLEMENT AFTERWARDS ────────────────────────────────────
  -- A provider claims ownership only when it actually RAISES the tier. On an equal
  -- write the existing owner is kept.
  --
  -- Without this, a PayTabs auteur whose Apple account also reported auteur would have
  -- the source flipped to 'revenuecat' by that equal write — and the NEXT RevenueCat
  -- sync would then be "the same source" and allowed to demote them. The protection
  -- would evaporate one harmless-looking call before the damage.
  --
  -- 'legacy' never claims ownership, and NULL is kept as NULL so a legacy row stays
  -- maximally protected.
  RETURN QUERY
  UPDATE public.profiles p
     SET role = CASE WHEN p.role = 'admin' THEN p.role ELSE v_db_value END,
         tier = v_db_value,
         entitlement_source = CASE
           WHEN p_source = 'legacy'  THEN v_cur_src
           WHEN p_source = 'manual'  THEN p_source
           WHEN v_new_w  > v_cur_w   THEN p_source
           ELSE v_cur_src
         END
   WHERE p.id = p_user_id
  RETURNING p.role, p.tier, p.entitlement_source, true,
            format('applied: %s -> %s by %s', coalesce(v_cur_tier,'none'), v_db_value, p_source);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_entitlement(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_entitlement(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_entitlement(uuid, text, text) TO service_role;


-- ── 3. The legacy name, kept single-signature so PostgREST can never be ambiguous ──
-- This is what the not-yet-redeployed edge functions call. Same signature and same
-- return shape as before, so nothing hard-fails mid-deploy — but it now routes through
-- the rule as 'legacy': it may raise a tier, never lower one, and never takes ownership.
CREATE OR REPLACE FUNCTION public.apply_entitlement(p_user_id uuid, p_tier text)
RETURNS TABLE(out_role text, out_tier text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.out_role, r.out_tier
    FROM public.grant_entitlement(p_user_id, p_tier, 'legacy') r;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_entitlement(uuid, text) TO service_role;

-- ── 4. Protect the new column from the members it judges ─────────────────────
-- ⚠️ WITHOUT THIS, THIS MIGRATION OPENS A HOLE.
--
-- tr_protect_privileged_profile_fields is what stops a client from editing its own
-- role, tier, ban state and trust score. entitlement_source is a NEW column and was
-- not in that list — and a client CAN update its own profile row (that trigger exists
-- precisely because it can).
--
-- The exploit: subscribe through the App Store (source becomes 'revenuecat'), cancel,
-- then set your own entitlement_source to 'paytabs'. RevenueCat is now forbidden from
-- ever lowering your tier. Premium forever, free — using the rule added above as the
-- lock. The column that decides who may demote you must not be writable by you.
--
-- Reproduced verbatim from the live definition (pg_get_functiondef) with ONE line
-- added, so nothing else about it changes. It is LANGUAGE plpgsql with no SECURITY or
-- SET search_path clause; both are left exactly as they were. search_path is
-- irrelevant here because the function touches no tables — it only assigns NEW fields.
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.role := OLD.role;
    NEW.tier := OLD.tier;
    NEW.is_founding := OLD.is_founding;
    NEW.member_no := OLD.member_no;
    NEW.is_banned := OLD.is_banned;
    NEW.ban_reason := OLD.ban_reason;
    NEW.banned_at := OLD.banned_at;
    NEW.suspended_until := OLD.suspended_until;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.warning_count := OLD.warning_count;
    NEW.trust_score := OLD.trust_score;
    NEW.entitlement_source := OLD.entitlement_source;   -- ← the one added line
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- ── Rollback ──────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.grant_entitlement(uuid, text, text);
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_entitlement_source_check;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS entitlement_source;
--   -- then re-apply 20260802_06 to restore the original apply_entitlement body.
