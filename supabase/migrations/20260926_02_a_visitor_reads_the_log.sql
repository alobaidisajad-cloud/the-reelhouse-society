-- ════════════════════════════════════════════════════════════════════════════
-- A visitor reads the log.
-- ════════════════════════════════════════════════════════════════════════════
-- `anon` reads `logs` through COLUMN grants, not a table grant — so a column
-- added later is invisible to a signed-out visitor until it is granted by name.
-- 20260917_01 (the Vault, per viewing) added `logs.viewing_id` and never
-- granted it to anon. The app's log page and a member's list of logs both
-- select PUBLIC_LOG_COLUMNS, which includes it, and PostgREST refuses the whole
-- request when one column is refused:
--
--   anon  GET /logs?select=…,viewing_id   →  401 42501 permission denied for table logs
--
-- So since 2026-09-17 every log page and every member's logs have failed for a
-- visitor who is not signed in — while The Reel, which is open to them, links
-- to both. Found by probing the log page's exact request as anon.
--
-- ── WHY GRANTING IT IS SAFE ─────────────────────────────────────────────────
-- `viewing_id` is the identity of a log's current viewing. It is not a secret:
--   · every PAST viewing's id is already readable by anon, inside
--     `viewing_history` (`viewingId`), which anon has always been granted;
--   · the only thing keyed by it that is private — `log_private_notes` — is
--     owner-only by row security, and every function that touches a viewing
--     (log_viewing_add/remove, viewing_note_set/remove) is revoked from anon
--     and checks the owner.
-- `private_notes`, the one other column anon cannot read, stays refused: it is
-- the column the database keeps blank on purpose.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

GRANT SELECT (viewing_id) ON public.logs TO anon;

COMMIT;
