-- ═══════════════════════════════════════════════════════════════════════════════
-- Batch 12 · Stage 5a — a payment provider may only lower a tier it granted
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ Deploy BOTH edge functions immediately after (see the ORDER note below).
--
-- ── THE BUG THIS CLOSES (live today) ─────────────────────────────────────────
-- A member buys Auteur on the WEBSITE through PayTabs. Their profile is upgraded.
-- They install the app, sign in with the same account, and tap "Restore Purchases"
-- — a button Apple REQUIRES to exist.
--
-- RevenueCat checks Apple and truthfully answers "this Apple ID never bought
-- anything", because they paid through PayTabs. revenueCat.ts:360 then syncs that
-- answer, and apply_entitlement writes tier='cinephile'. The purchase is destroyed
-- on BOTH surfaces — same account — and they would have to buy it again.
--
-- The existing shield (revenueCat.ts:383) only covers `founding`. Anyone who bought
-- Archivist or Auteur on the web is unprotected.
--
-- ── WHY NOT JUST STOP DOWNGRADING ────────────────────────────────────────────
-- There is NO RevenueCat webhook in either supabase/functions tree — verified by
-- listing both. The comment at stores/auth.ts:411-418 claims tier is "set by the
-- RevenueCat webhook"; no such function exists. The app's sync is therefore the
-- ONLY thing that ever downgrades a genuinely lapsed App Store subscription.
-- Removing the downgrade would let lapsed members keep premium forever.
--
-- So the rule is not "never downgrade". It is:
--
--        A provider may only LOWER a tier that it granted.
--
-- RevenueCat can still retire an Apple subscription that really lapsed. It can
-- never touch a PayTabs purchase or a tier granted by hand. Upgrades are always
-- allowed from anyone, so a web member who later buys in the app still works.
--
-- ── WHY SERVER-SIDE ──────────────────────────────────────────────────────────
-- The build on TestFlight cannot be changed until launch. A client-side guard would
-- protect nobody until then. This rule lives inside apply_entitlement, so it takes
-- effect for the OLD build the moment it is applied.
--
-- ── ORDER OF OPERATIONS (important) ──────────────────────────────────────────
-- The two deployed edge functions still call the 2-argument form. This migration
-- keeps that form working and routes it to source 'manual', which is the PROTECTED
-- direction — during the deploy window a RevenueCat downgrade is refused rather than
-- wrongly applied. Fail safe, not fail open. Then:
--     1. run this migration
--     2. deploy sync-entitlement  (passes p_source => 'revenuecat')
--     3. deploy paytabs-handler   (passes p_source => 'paytabs')
-- The legacy 2-arg form can be dropped after step 3; it is left in place so an
-- un-redeployed function can never hard-fail a live payment.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Where each entitlement came from ──────────────────────────────────────
-- NULL = legacy/unknown. Treated as PROTECTED: nothing may downgrade it except an
-- explicit 'manual' call. Every one of the 32 existing rows is NULL, so no paying
-- member can be demoted by a provider that did not sell to them.
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
  'granted (enforced in apply_entitlement). NULL = legacy/manual, fully protected.';


-- ── 2. The authority ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_entitlement(
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
    RAISE EXCEPTION 'apply_entitlement: user id is required' USING ERRCODE = '22023';
  END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('cinephile','archivist','auteur','founding') THEN
    RAISE EXCEPTION 'apply_entitlement: unknown tier %', coalesce(p_tier,'<null>')
      USING ERRCODE = '22023';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('revenuecat','paytabs','manual') THEN
    RAISE EXCEPTION 'apply_entitlement: unknown source %', coalesce(p_source,'<null>')
      USING ERRCODE = '22023';
  END IF;

  -- profiles_role_check forbids 'founding' as a ROLE, and both columns take the same
  -- value, so a founding purchase is stored as auteur. The SEAT itself is recorded
  -- separately by claim_founding_seat setting is_founding.
  v_db_value := CASE WHEN p_tier = 'founding' THEN 'auteur' ELSE p_tier END;

  -- Lock the row so two providers cannot race read-then-write.
  SELECT p.tier, p.role, coalesce(p.is_founding,false), p.entitlement_source
    INTO v_cur_tier, v_cur_role, v_cur_found, v_cur_src
    FROM public.profiles p
   WHERE p.id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_entitlement: no profile with id %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Effective weight, mirroring resolveTier in src/utils/tier.ts:91-101 — the highest
  -- of the tier column and (is_founding ? founding : role). Kept inline rather than
  -- calling tier_weight() so this function has no dependency that could be dropped
  -- or redefined out from under it.
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
  -- NULL source (legacy) is distinct from every provider, so it is protected from
  -- all of them — but 'manual' can still correct anything, which is the escape hatch
  -- for support.
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
  -- Without this, a PayTabs auteur whose Apple account also happens to report auteur
  -- would have the source flipped to 'revenuecat' by that equal write — and the NEXT
  -- RevenueCat sync would then be "the same source" and allowed to demote them. The
  -- protection would evaporate one harmless-looking call before the damage.
  --
  -- Keeping NULL as NULL is deliberate: a legacy row stays maximally protected.
  RETURN QUERY
  UPDATE public.profiles p
     SET role = CASE WHEN p.role = 'admin' THEN p.role ELSE v_db_value END,
         tier = v_db_value,
         entitlement_source = CASE
           WHEN v_new_w > v_cur_w   THEN p_source
           WHEN p_source = 'manual' THEN p_source
           ELSE v_cur_src
         END
   WHERE p.id = p_user_id
  RETURNING p.role, p.tier, p.entitlement_source, true,
            format('applied: %s -> %s by %s', coalesce(v_cur_tier,'none'), v_db_value, p_source);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_entitlement(uuid, text, text) TO service_role;


-- ── 3. Legacy 2-arg form, kept alive so an un-redeployed function cannot fail ──
-- Routes to 'manual', the PROTECTED direction: during the deploy window a downgrade
-- from a provider is refused rather than wrongly applied. Same return shape as before
-- so the existing callers keep working untouched.
CREATE OR REPLACE FUNCTION public.apply_entitlement(p_user_id uuid, p_tier text)
RETURNS TABLE(out_role text, out_tier text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.out_role, r.out_tier
    FROM public.apply_entitlement(p_user_id, p_tier, 'manual') r;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_entitlement(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── Rollback ──────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.apply_entitlement(uuid, text, text);
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_entitlement_source_check;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS entitlement_source;
--   -- then re-apply 20260802_06 to restore the original 2-arg body.
