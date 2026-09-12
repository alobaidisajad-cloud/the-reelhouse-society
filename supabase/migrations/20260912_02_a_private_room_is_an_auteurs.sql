-- ════════════════════════════════════════════════════════════════════════════
-- A PRIVATE SCREENING ROOM IS AN AUTEUR'S
-- ════════════════════════════════════════════════════════════════════════════
-- The Archivist and the Auteur had IDENTICAL rights in the Lounge. Both could
-- join, both could found, both could found a private room — so "The Lounge"
-- appeared on the Archivist's list and bought the Auteur nothing at all, which
-- is part of why that rank reads thin next to the one below it.
--
-- Founding a private screening room becomes the Auteur's. It is a real
-- distinction rather than an invented one: a private room costs the house more
-- than a public one, because the host admits each guest by hand and the room's
-- conversation is readable by nobody outside it.
--
-- ── FOUNDING ONE, NOT ENTERING ONE ─────────────────────────────────────────
-- Deliberately only the INSERT on `lounges`, and deliberately NOT the join.
--
-- If entering a private room needed the Auteur rank, then an Auteur who founds
-- one could not admit the Archivists they founded it for — the room would be
-- unusable to exactly the people it was made for, and the host's own invitation
-- would be refused at their own door. Convening is the privilege; being
-- admitted is the host's gift. `request_lounge_membership` is untouched.
--
-- ── WHY A SECOND TRIGGER AND NOT AN EDIT TO THE FIRST ──────────────────────
-- `tr_tier_gate_lounges` already refuses a Cinephile founding ANY room at
-- weight 1, and it stays exactly as it is. This adds the narrower rule on top
-- with a WHEN clause, which is the shape `tr_tier_gate_dispatch` already uses
-- to demand the Auteur rank for a ballot or an essay while leaving takes,
-- seekings and wires alone. Two small rules that each say one thing beat one
-- rule that says two.
--
-- NO BEGIN/COMMIT IN THIS FILE — see 20260912_01. Its own COMMIT closed a
-- rehearsal's transaction and wrote test data to production.
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS tr_tier_gate_private_lounges ON public.lounges;
CREATE TRIGGER tr_tier_gate_private_lounges
  BEFORE INSERT ON public.lounges
  FOR EACH ROW
  WHEN (NEW.is_private IS TRUE)
  EXECUTE FUNCTION public.enforce_tier_gate('2', 'A private screening room is an Auteur feature');

COMMENT ON TRIGGER tr_tier_gate_private_lounges ON public.lounges IS
  'Founding a PRIVATE room needs the Auteur rank. Entering one does not — that '
  'is the host''s gift, or an Auteur could not admit the Archivists they '
  'founded the room for.';
