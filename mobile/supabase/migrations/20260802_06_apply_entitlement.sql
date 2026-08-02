-- ═══════════════════════════════════════════════════════════════════════════════
-- Batch 12 · Stage 3 — one place that decides what a purchase does to a profile
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ SQL ONLY. The two edge functions are switched over separately, after this
--    exists — otherwise they would call a function that isn't there.
--
-- ── #47 · WHAT BREAKS TODAY ───────────────────────────────────────────────────
-- `profiles.role` carries two unrelated meanings: the admin permission flag, and
-- the subscription tier. Both entitlement writers overwrite it unconditionally:
--
--   sync-entitlement/index.ts:146   .update({ role: dbRole, tier: dbRole })
--   paytabs-handler/index.ts:165    .update({ role: newRole, tier: newRole })
--
-- So an admin who taps "Restore Purchases" — a button Apple REQUIRES you to ship —
-- has role rewritten from 'admin' to 'cinephile' and permanently loses the Tribunal.
-- Verified live: every RLS policy that reads `role` gates on role = 'admin'
-- (reports, mod_actions, warnings, dossier comment moderation). That is the whole
-- moderation system, destroyed by a button, with no in-app way back.
--
-- ── ⚠️ WHY `role` IS STILL WRITTEN AT ALL ────────────────────────────────────
-- The obvious fix — "stop writing role, entitlements live in tier" — is what
-- src/schemas/user.ts:54-57 documents, and it would BREAK THE WEBSITE.
--
-- That comment describes the MOBILE app. The web never adopted it. Measured:
--     27 web gates read `role === 'archivist' | 'auteur'`
--      0 web gates read `tier`
-- Premium log fields, CSV export, lounge access, dossier writing, profile badges
-- and settings all decide entitlement from `role` in React, not in RLS — which is
-- why the RLS sweep came back clean and nearly misled this fix.
--
-- Stop writing `role` and every new web purchaser pays and gets nothing.
-- So `role` keeps carrying the tier for everyone EXCEPT admins, whose flag is
-- preserved. Separating the two meanings properly is a web migration, not a batch.
--
-- ── WHY A FUNCTION RATHER THAN EDITING TWO FILES ─────────────────────────────
-- The identical defective line exists in both writers because it was copy-pasted.
-- Two hand-maintained copies drift — that is literally how this bug came to be
-- duplicated. One definition, called by both, cannot drift.
--
-- It is also ATOMIC. "Read the role, then write it back" is read-modify-write with
-- a window between; a single UPDATE with a CASE has no window.
--
-- And it is verifiable: SQL can be read back from pg_proc live. Deployed edge
-- function source cannot, so the less logic that lives there the better.
--
-- ── ⚠️ SECURITY · THIS IS THE DANGEROUS PART ────────────────────────────────
-- A function named "give this user this tier" MUST NOT be callable by members.
-- Postgres grants EXECUTE to PUBLIC by default, so the REVOKE below is not
-- tidiness — without it, any signed-in member could grant themselves 'auteur' by
-- calling this with their own id. It would be a self-serve paid-tier button.
--
-- SECURITY INVOKER, deliberately, not DEFINER: the callers already run as
-- service_role, which bypasses RLS, so DEFINER would add privilege amplification
-- for no benefit. As INVOKER, a leaked grant still faces (a) RLS on profiles and
-- (b) protect_privileged_profile_fields, which reverts role/tier writes made by
-- `authenticated` or `anon`. Two independent barriers rather than none.
--
-- p_tier is validated here because `profiles.tier` has NO check constraint — a typo
-- in either edge function would otherwise write a value that silently resolves to
-- free, which is exactly the #48 failure mode this batch exists to end.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_entitlement(p_user_id uuid, p_tier text)
RETURNS TABLE(out_role text, out_tier text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_db_value text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'apply_entitlement: p_user_id is required' USING ERRCODE = '22023';
  END IF;

  -- Reject anything that is not a real tier. Without this a typo lands in a column
  -- that has no constraint and then resolves to free, silently.
  IF p_tier IS NULL OR p_tier NOT IN ('cinephile', 'archivist', 'auteur', 'founding') THEN
    RAISE EXCEPTION 'apply_entitlement: unknown tier %', coalesce(p_tier, '<null>')
      USING ERRCODE = '22023';
  END IF;

  -- 'founding' is a purchase type, not a stored value: profiles_role_check permits
  -- free|cinephile|archivist|auteur|projectionist|admin and NOT 'founding'. The seat
  -- itself is recorded by claim_founding_seat setting is_founding, which is what
  -- carries weight 3. Both writers already did this mapping; it moves here.
  v_db_value := CASE WHEN p_tier = 'founding' THEN 'auteur' ELSE p_tier END;

  RETURN QUERY
  UPDATE public.profiles p
     SET role = CASE WHEN p.role = 'admin' THEN p.role ELSE v_db_value END,
         tier = v_db_value
   WHERE p.id = p_user_id
  RETURNING p.role, p.tier;

  -- A purchase applied to a profile that does not exist must FAIL, not return
  -- quietly. Without this the UPDATE matches zero rows, RETURN QUERY yields
  -- nothing, no error is raised, and the caller reports success for a payment
  -- that changed nobody. That is the exact "looks like it worked" failure this
  -- function exists to eliminate, so it must not introduce one.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_entitlement: no profile with id %', p_user_id
      USING ERRCODE = 'P0002';   -- no_data_found
  END IF;
END;
$$;

-- ⚠️ Not optional. Default is EXECUTE TO PUBLIC — see the security note above.
REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_entitlement(uuid, text) TO service_role;

-- ── Verify (run after) ────────────────────────────────────────────────────────
--   -- grants must show service_role ONLY (no bare "=X/" PUBLIC entry):
--   SELECT proname, array_to_string(proacl, E'\n') AS grants
--     FROM pg_proc WHERE proname = 'apply_entitlement';
--
--   -- and the admin-preserving rule is present:
--   SELECT prosrc LIKE '%WHEN p.role = ''admin'' THEN p.role%' AS admin_preserved
--     FROM pg_proc WHERE proname = 'apply_entitlement';
--
-- ── NOT DONE HERE ────────────────────────────────────────────────────────────
-- The two edge functions still contain their own .update({role, tier}). They are
-- switched to call this function in a follow-up, because they need deploying and
-- their deployed source cannot be read back the way SQL can. Until then this
-- function is inert — created, locked down, and called by nobody.
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
-- Safe while nothing calls it:
--   DROP FUNCTION IF EXISTS public.apply_entitlement(uuid, text);
-- After the edge functions are switched over, roll THEM back first.
