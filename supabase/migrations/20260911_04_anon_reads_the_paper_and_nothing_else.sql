-- ═══════════════════════════════════════════════════════════════════════════
-- ANON READS THE PAPER, AND NOTHING ELSE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A signed-out reader may read the Dispatch. That is deliberate: the feed is
-- public, and a filing is meant to be found. What a signed-out reader may NOT
-- do is certify, save, vote, or touch any of it — and yet `anon` held:
--
--   dispatch_certifications   SELECT, INSERT, UPDATE, DELETE
--   dispatch_saves            SELECT, INSERT, UPDATE, DELETE
--   dispatch_votes            SELECT, INSERT, UPDATE, DELETE
--
-- ── IT IS NOT EXPLOITABLE TODAY, AND THAT IS NOT THE POINT ─────────────────
-- Attempted as `anon` against production, inside a rolled-back transaction:
--
--   certify a filing   REFUSED   new row violates row-level security policy
--   save a filing      REFUSED   new row violates row-level security policy
--   cast a vote        REFUSED   new row violates row-level security policy
--   delete a cert      0 rows    (the table holds one — RLS filtered it out)
--
-- Every policy on these three names `{authenticated}`, so for an anonymous
-- caller no policy applies and RLS denies by default. `dispatch_votes` has no
-- DELETE or UPDATE policy at all, which denies them to everyone.
--
-- So the grants are dead weight — and dead weight of a specific kind. The ONLY
-- thing standing between them and real anonymous writes is that every policy
-- happens to name a role. One policy added later at `{public}` turns all twelve
-- grants live at once, silently. That is not hypothetical: `notifications` was
-- found with exactly that mistake an hour before this migration, on this same
-- database, and this project has shipped the `{public}` default twice before.
--
-- A vote is the one that would matter. `frozen_totals` is computed from these
-- rows and a ballot is the house's collective judgement; an anonymous caller
-- able to add a row is an anonymous caller able to decide it.
--
-- ── WHY REVOKE RATHER THAN "RLS ALREADY COVERS IT" ─────────────────────────
-- Defence in depth costs nothing here. With the grant gone, an anonymous write
-- is refused at the GRANT — before RLS is consulted at all — so a future policy
-- mistake cannot reach these tables. The app loses nothing: nothing in it ever
-- asks as anon, every one of these reads is gated on a session.
--
-- What anon KEEPS: SELECT on dispatch_posts and dispatch_comments. That is the
-- paper itself, and a signed-out reader is meant to read it.
--
-- PUBLIC is named alongside anon. Checked first — PUBLIC holds nothing on these
-- tables — but revoking from a role while PUBLIC holds the grant is a fix that
-- reports success and changes nothing, and that has happened here before.

REVOKE ALL ON TABLE public.dispatch_certifications FROM anon;
REVOKE ALL ON TABLE public.dispatch_certifications FROM PUBLIC;

REVOKE ALL ON TABLE public.dispatch_saves FROM anon;
REVOKE ALL ON TABLE public.dispatch_saves FROM PUBLIC;

REVOKE ALL ON TABLE public.dispatch_votes FROM anon;
REVOKE ALL ON TABLE public.dispatch_votes FROM PUBLIC;
