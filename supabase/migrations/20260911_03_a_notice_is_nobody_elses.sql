-- ═══════════════════════════════════════════════════════════════════════════
-- A NOTICE IS NOBODY ELSE'S
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `notifications` holds what the house tells one member: who certified their
-- essay, who critiqued it, who asked to follow them. Every other table the
-- Dispatch touches has had its policies tightened to `authenticated`. These
-- three were missed, and they are the ones on the most private table of the set.
--
--   Users can view own notifications     SELECT   {public}
--   Users can update own notifications   UPDATE   {public}
--   Users can delete own notifications   DELETE   {public}
--
-- ── `{public}` INCLUDES ANON ───────────────────────────────────────────────
-- It is not "the default, therefore harmless". A policy left at `public`
-- applies to anonymous callers as well as members. Nothing leaks TODAY, and
-- the reason is worth stating precisely: each policy's USING clause is
-- `auth.uid() = user_id`, and for an anonymous caller `auth.uid()` is NULL, so
-- no row matches. Verified by reading as `anon`: zero rows.
--
-- That is one expression standing between anonymous callers and every member's
-- notices. Scoping the policy to the role costs nothing and means the
-- protection no longer depends on a NULL comparison being written correctly in
-- three separate places. This project has shipped the `{public}` mistake twice
-- before; it is not a hypothetical class.
--
-- ── AND ANON HELD FOUR GRANTS IT NEVER NEEDED ──────────────────────────────
-- anon: SELECT, UPDATE, DELETE, INSERT. A signed-out reader has no business
-- with this table at all: `notificationStore` guards every read and write with
-- `if (!user) return`, so nothing in the app ever asks as anon.
--
-- INSERT is the one that matters most, and it was already answered — there is
-- NO INSERT policy, so RLS denies the write to everyone, which is what the
-- db_security integration test means by "client notification INSERT is blocked
-- (no spoofing)". The grant was surface without a use, and surface without a
-- use is the thing an exploit is built from later.
--
-- REVOKE names `anon` and PUBLIC both. Checked first: PUBLIC holds nothing here,
-- so `FROM anon` is sufficient — but revoking only from a role while PUBLIC
-- holds the grant is a fix that reports success and does nothing, and that has
-- happened on this database before. Naming both is how it stops mattering.

ALTER POLICY "Users can view own notifications"   ON public.notifications TO authenticated;
ALTER POLICY "Users can update own notifications" ON public.notifications TO authenticated;
ALTER POLICY "Users can delete own notifications" ON public.notifications TO authenticated;

REVOKE ALL ON TABLE public.notifications FROM anon;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC;
