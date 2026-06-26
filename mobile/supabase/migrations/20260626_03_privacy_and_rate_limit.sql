-- ═══════════════════════════════════════════════════════════════════════════════
-- PRIV-1 — NOT LIVE.   RL-1 — applied (search_path hardening).
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit refs: BACKEND-PRIV-1 (MEDIUM; NOT PRESENT on live DB), BACKEND-RL-1 (LOW)
--
-- WAVE 0 (verified against the live DB 2026-06-26):
--   • PRIV-1: `get_public_profile_analytics` DOES NOT EXIST on the live database,
--     so there is no private-analytics leak to gate. Nothing to fix.
--   • RL-1: the live `rate_limit_check` is SECURITY DEFINER and lacked SET search_path,
--     so its dynamic `EXECUTE format(... FROM %I ...)` could be hijacked via a
--     malicious caller search_path. Fixed by locking the search path — done with
--     ALTER FUNCTION (no body rewrite, no clobber). APPLIED MANUALLY 2026-06-26.
--     (⚠️ do NOT `supabase db push` — see WAVE0_LIVE_NOTES.md.)
--
-- Idempotent. Single statement.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.rate_limit_check(text, text, integer, integer)
  SET search_path = public;
