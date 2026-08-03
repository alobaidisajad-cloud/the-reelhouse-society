-- ═══════════════════════════════════════════════════════════════════════════════
-- A founding seat is permanent — no payment provider may lower it
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ Replaces grant_entitlement from 20260803_01. Nothing else changes: the source
--    rule, the ownership rule, the admin preservation and the founding->auteur
--    mapping are all byte-identical. One condition is added.
--
-- ── THE HOLE ─────────────────────────────────────────────────────────────────
-- Found while building the RevenueCat expiry webhook, before it was ever deployed.
--
-- A member subscribes monthly, later buys the Founding seat, then cancels the
-- monthly. RevenueCat sends EXPIRATION. The webhook sends 'cinephile' with source
-- 'revenuecat' — and the source rule ALLOWS it, because RevenueCat also granted the
-- founding seat, so this is the same provider lowering its own grant.
--
-- Result: tier and role become 'cinephile' while is_founding stays true.
--   • the APP survives — resolveTier reads is_founding and still returns founding
--   • the WEBSITE does not — its 27 permission gates read `role`, which is now
--     'cinephile', so a lifetime seat holder is locked out of what they paid for
--
-- ── THE RULE ─────────────────────────────────────────────────────────────────
-- is_founding means a permanent, paid-for-life seat. It is not a subscription and
-- cannot lapse, so NO provider may lower the tier of a member who holds one —
-- not even the provider that sold it.
--
-- 'manual' still passes, because support must be able to correct a chargeback or a
-- mistaken grant. That is the same escape hatch the source rule already relies on.
-- ═══════════════════════════════════════════════════════════════════════════════

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
  IF p_source IS NULL OR p_source NOT IN ('revenuecat','paytabs','manual','legacy') THEN
    RAISE EXCEPTION 'grant_entitlement: unknown source %', coalesce(p_source,'<null>')
      USING ERRCODE = '22023';
  END IF;

  v_db_value := CASE WHEN p_tier = 'founding' THEN 'auteur' ELSE p_tier END;

  SELECT p.tier, p.role, coalesce(p.is_founding,false), p.entitlement_source
    INTO v_cur_tier, v_cur_role, v_cur_found, v_cur_src
    FROM public.profiles p
   WHERE p.id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_entitlement: no profile with id %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

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

  -- ── A FOUNDING SEAT IS A FLOOR, NOT A FREEZE ───────────────────────────────
  -- Checked BEFORE the source rule, because the source rule would let RevenueCat
  -- retire a founding seat RevenueCat itself sold.
  --
  -- The seat guarantees AUTEUR for life, so the rule is: a seat holder's stored tier
  -- may never fall BELOW auteur (weight 2). Only 'manual' may unwind that.
  --
  -- ⚠️ Written as `v_new_w < v_cur_w AND v_cur_found` first, which was wrong and the
  -- tests caught it: a seat makes v_cur_w 3, so EVERY write including a correction up
  -- to auteur looked like a lowering and was refused. That would strand a seat holder
  -- whose tier column had drifted to archivist — invisible on mobile, where
  -- resolveTier reads is_founding, but the website's gates read `role` and would keep
  -- serving them the lesser rank forever. A floor allows the correction; a freeze does
  -- not.
  IF v_cur_found AND v_new_w < 2 AND p_source <> 'manual' THEN
    RETURN QUERY SELECT
      v_cur_role, v_cur_tier, v_cur_src, false,
      format('refused: %s may not lower a founding seat below auteur', p_source);
    RETURN;
  END IF;

  -- ── A PROVIDER MAY ONLY LOWER WHAT IT GRANTED ──────────────────────────────
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
  -- A provider claims ownership only when it actually RAISES the tier; on an equal
  -- write the existing owner is kept, so one harmless-looking call cannot launder
  -- ownership and unlock a demotion on the next sync. 'legacy' never claims, and
  -- NULL stays NULL so a legacy row remains maximally protected.
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

NOTIFY pgrst, 'reload schema';
