-- ═══════════════════════════════════════════════════════════════════════════════
-- BACKEND-EMAIL-ENUM-1 — stop client-side user enumeration via email lookup
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit ref: BACKEND-EMAIL-ENUM-1 (MED)
--
-- `get_email_by_username(text)` returned a user's email and confirmed account
-- existence to any caller — a user-enumeration vector used by the old username
-- login path. Username login now goes through the `sign-in-with-username` edge
-- function, which resolves the email + verifies the password entirely
-- server-side (under the service role, which bypasses these grants) and returns
-- a generic error on any failure. So no client role needs to call this directly
-- anymore — revoke it.
--
-- Idempotent. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM PUBLIC, anon, authenticated;

COMMIT;
