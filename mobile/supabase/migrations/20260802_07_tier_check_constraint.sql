-- ═══════════════════════════════════════════════════════════════════════════════
-- Batch 12 · Stage 4b — make a silently-downgrading tier value impossible to store
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NO APP CHANGE. Nothing a member can see changes.
--
-- ── WHY ───────────────────────────────────────────────────────────────────────
-- Stage 4 made normalizeTier REPORT an unrecognised tier instead of swallowing it.
-- That is detection. This is prevention.
--
-- `profiles.role` has had profiles_role_check since forever. `profiles.tier` has
-- never had one — which is exactly why tier='projectionist' (a tier removed from
-- the product) could sit in a live row while the app quietly reported cinephile.
-- Harmless on the owner's own free account; a paying member with an unexpected
-- value is silently downgraded to free with no error and no way to notice.
--
-- A CHECK constraint means that state cannot be written at all. The Stage 4 warning
-- stays as the backstop for anything set by hand before this existed.
--
-- ── SAFE TO VALIDATE IMMEDIATELY ─────────────────────────────────────────────
-- Checked live before writing this — zero offending rows:
--   SELECT tier, count(*) FROM public.profiles
--    WHERE tier IS NOT NULL AND tier NOT IN ('free','cinephile','archivist','auteur','founding')
--    GROUP BY tier;   -> 0 rows
--
-- Live distribution: NULL x28, 'free' x2, 'auteur' x1, 'cinephile' x1. All pass.
-- 32 rows, so the ACCESS EXCLUSIVE lock taken by the validating scan is momentary.
-- No NOT VALID / VALIDATE dance is warranted at this size.
--
-- ── WHAT CAN WRITE THIS COLUMN (verified against the LIVE database) ──────────
-- Only public.apply_entitlement (20260802_06), which already validates its input and
-- writes cinephile | archivist | auteur — all permitted.
--
-- The client cannot write it, and this is enforced TWICE:
--   1. `tier` is absent from ProfileService.updateProfile's allow-list
--      (stores/auth.ts:411-418 — "tier and is_founding are server-derived").
--   2. the live BEFORE UPDATE trigger tr_protect_privileged_profile_fields:
--         IF current_user IN ('authenticated','anon') THEN NEW.tier := OLD.tier; ...
--      It reverts role, tier, is_founding, member_no, ban state and trust_score for
--      logged-in clients and logged-out visitors. service_role is NOT in that list,
--      so the edge functions write through — which is how apply_entitlement works at
--      all. Confirmed by reading pg_proc on the live DB, not from the repo.
--
-- ⚠️ That trigger fires LAST of the five BEFORE UPDATE triggers on profiles (Postgres
-- orders them alphabetically; tr_protect_* sorts after tr_profiles_*), so nothing
-- downstream can undo its protection. A trigger renamed to sort earlier would break
-- that silently — check the order if these are ever renamed.
--
-- Because that trigger reverts client writes to the OLD (already-valid) value, this
-- constraint can only ever fire on a service_role write or a manual SQL edit. That is
-- exactly the surface it is meant to guard — a manual edit is how 'projectionist' got
-- into a live row in the first place.
--
-- NOTE: the live profiles_role_check permits free | cinephile | archivist | auteur |
-- projectionist | admin — it does NOT permit 'venue_owner', which handle_new_user can
-- try to write. Separate open item, not addressed here.
--
-- ── THE PERMITTED SET, AND WHY EACH ONE ──────────────────────────────────────
--   NULL         28 live rows — means "no paid tier", identical in weight to free
--   'free'        2 live rows — legacy spelling of the same thing
--   'cinephile'   the free tier by name
--   'archivist'   $1.99
--   'auteur'      $4.99
--   'founding'    never written today (apply_entitlement maps it to auteur, because
--                 profiles_role_check forbids 'founding' as a ROLE and both columns
--                 take the same value) — permitted so a future change that stores it
--                 in `tier` alone is not blocked by this constraint.
--
-- ⚠️ 'projectionist' is deliberately NOT permitted. It was removed from the product.
-- Re-admitting it here would preserve the exact state this batch exists to end.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_tier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tier_check
  CHECK (
    tier IS NULL
    OR tier IN ('free', 'cinephile', 'archivist', 'auteur', 'founding')
  );

-- ── Verify (run after) ────────────────────────────────────────────────────────
--   -- must exist and be validated:
--   SELECT conname, convalidated, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_tier_check';
--
--   -- and must now be refused (expect ERROR 23514):
--   UPDATE public.profiles SET tier = 'projectionist'
--    WHERE username = 'sajjadobaidi';
--
-- ── Rollback ──────────────────────────────────────────────────────────────────
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
