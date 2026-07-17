-- ═══════════════════════════════════════════════════════════════════════════════
-- F-9 (BLOCKER) + F-15 (HIGH) — profiles column-privilege lockdown
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- F-9 (verified live 2026-07-17): `GRANT ALL ON profiles TO authenticated` + a
--   column-unrestricted UPDATE policy + NO freeze trigger let ANY authenticated
--   user PATCH their own row's role/tier/is_founding/is_banned. Because the live
--   role CHECK also permits 'admin', this is a self-serve ADMIN TAKEOVER on top of
--   free paid tiers, founding-seat-cap bypass, and ban/suspension evasion.
--   Fix: strip blanket UPDATE; re-grant UPDATE only on the 7 genuinely user-editable
--   columns (the exact set written by ProfileWriteService + auth.signup — verified
--   the only two client profiles.update() sites). service_role bypasses column
--   grants, so sync-entitlement + the SECURITY DEFINER moderation RPCs still write
--   role/tier/is_banned. preferences is written via the update_my_preferences RPC
--   (SECURITY DEFINER), not a direct update, so it is intentionally NOT granted here.
--
-- F-15 (verified live 2026-07-17): profiles.email is world-readable (anon AND
--   authenticated) via `SELECT USING(true)` + `GRANT ALL` → mass email harvesting.
--   A bare `REVOKE SELECT(email)` is a no-op while table-level SELECT is held, so we
--   revoke table SELECT and re-grant SELECT on every column EXCEPT email (built
--   dynamically so no readable column is ever missed and no client read breaks).
--   No client reads profiles.email (it uses the auth-session email); service_role
--   retains full access.
--
-- Idempotent. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── F-9: privileged columns become server-only ─────────────────────────────────
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (username, bio, avatar_url, display_name, persona, social_links, is_social_private)
  ON public.profiles TO authenticated;

-- ── F-15: stop email harvesting (grant SELECT on all columns except email) ──────
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'profiles'
    AND column_name <> 'email';

  EXECUTE 'REVOKE SELECT ON public.profiles FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', cols);
END $$;

COMMIT;

-- ── Post-condition (re-run the Phase-0 matrix; all must flip) ──────────────────
--   has_column_privilege('authenticated','public.profiles','role','UPDATE')   → false
--   has_column_privilege('authenticated','public.profiles','is_banned','UPDATE') → false
--   has_column_privilege('anon','public.profiles','email','SELECT')           → false
--   has_column_privilege('authenticated','public.profiles','email','SELECT')  → false
--   (and legitimate edits — bio/avatar/username/etc. — still succeed)
