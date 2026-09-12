-- ════════════════════════════════════════════════════════════════════════════
-- A RANK THAT ENDS
-- ════════════════════════════════════════════════════════════════════════════
-- Nobody has ever lapsed. Not because nobody stopped paying, but because the
-- database had no way to find out: no expiry column, no webhook, and the only
-- scheduled job in the whole instance freezes ballots. `grant_entitlement` —
-- the single sanctioned writer of a rank — had never been called once, in any
-- direction, for any member.
--
-- So `profiles.tier` said `archivist` for ever, and every server gate reads it
-- through `has_tier_at_least`. A subscription could end and the house would
-- never notice.
--
-- Three things are missing, and they are missing in a specific order:
--
--   1. a way for a rank to END          (relinquish_rank)
--   2. a gate on SPEAKING, not just on entering  (the Lounge)
--   3. a gate on CHANGING, not just on creating  (the Vault, the shelf)
--
-- Without (1), (2) and (3) are decoration: a lapsed member's tier still reads
-- `archivist`, so every trigger waves them straight through.
--
-- ── WHAT LAPSING MEANS, AND WHY IT IS THIS AND NOT EVICTION ─────────────────
-- Dues stop. The name comes off the roll. The house keeps your letters.
--
--   READING is never gated.      Every ownership policy — lpn_select, "Users
--                                can read own archive", posts_read_own — is
--                                `user_id = auth.uid()` with no tier condition,
--                                and none of them are touched here. A member
--                                who lapses can still read every word they
--                                wrote. Anything else would be holding their
--                                own writing hostage to a card.
--
--   WITHDRAWING is never gated.  DELETE stays open everywhere. A member must
--                                always be able to take their own things back.
--
--   CREATING and CHANGING stop.  That is what the rank was for.
--
-- ── WHY THE ESSAY IS DELIBERATELY NOT GATED ON UPDATE ───────────────────────
-- dispatch_posts.UPDATE is left alone on purpose, and it is the one place this
-- migration does NOT tighten.
--
-- Publishing is the paid act; it is gated on INSERT and stays gated. But an
-- essay that is already in the house is public, under a member's name, and may
-- contain a mistake. Refusing them the ability to correct it would not protect
-- anything we sell — it would only leave an error standing in public for ever
-- and call it a policy. Correcting what you already published is not the same
-- as being given the tools to publish again.
--
-- ── NO BEGIN/COMMIT IN THIS FILE, AND THE REASON IS EXPENSIVE ───────────────
-- It had them, and they wrote to production.
--
-- The rehearsal opened a transaction and then `\i`-ed this file. The COMMIT in
-- here closed the OUTER transaction, so everything after it autocommitted:
-- `SET LOCAL ROLE` warned and did nothing, `set_config(..., is_local => true)`
-- silently had no effect, and every "must fail" case then ran as postgres with
-- `auth.uid()` NULL — the one condition `enforce_tier_gate` deliberately stands
-- aside for. So they all "passed" by succeeding, the rehearsal's own seed data
-- was committed, and a member's private note was deleted for real.
--
-- The Supabase CLI wraps each migration in a transaction, and `psql -1` does
-- too. So this file must NOT open one itself — that way it is safe to include
-- inside a rehearsal transaction, which is the only way to rehearse it at all.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. A WAY FOR A RANK TO END ──────────────────────────────────────────────
--
-- `grant_entitlement` is EXECUTE-able only by postgres and service_role, which
-- is correct: a client that could call it could promote itself. But that also
-- means nothing a member's own app does can ever end their rank, and a webhook
-- brings a shared secret, an endpoint to keep alive, and deliveries that can be
-- missed in silence.
--
-- This is the narrow alternative. It can do exactly one thing: lower the
-- CALLER'S OWN rank to cinephile. It cannot name another member, cannot raise
-- anything, and cannot choose a tier. The worst a hostile caller achieves is
-- removing their own access — so it is safe to hand to `authenticated`, which
-- is what makes the client's existing RevenueCat check load-bearing instead of
-- advisory.
--
-- Every protection in `grant_entitlement` is inherited by delegating to it
-- rather than touching profiles directly: it refuses to lower a tier granted by
-- a different source, and it refuses to drop a founding seat below auteur.
CREATE OR REPLACE FUNCTION public.relinquish_rank()
RETURNS TABLE(out_tier text, out_applied boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'relinquish_rank: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 'revenuecat' as the source, not 'manual': a rank granted by hand, or a
  -- founding seat, is not the store's to take away. grant_entitlement enforces
  -- that; naming the source here is what lets it.
  RETURN QUERY
  SELECT g.out_tier, g.out_applied, g.out_reason
  FROM public.grant_entitlement(v_uid, 'cinephile', 'revenuecat') AS g;
END $$;

COMMENT ON FUNCTION public.relinquish_rank() IS
  'Lowers the CALLER''S OWN rank to cinephile and nothing else. Safe for '
  'authenticated: the worst abuse is self-removal. Called by the client when '
  'RevenueCat reports no active entitlement but the profile still claims one.';

REVOKE ALL ON FUNCTION public.relinquish_rank() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relinquish_rank() TO authenticated;

-- ── 2. SPEAKING IS FOR MEMBERS ──────────────────────────────────────────────
--
-- The Lounge was gated at the door and open inside the room. `lounge_members`
-- and `lounges` carried tier triggers — who may JOIN, who may FOUND — and
-- nothing at all stood on `lounge_messages` or `lounge_message_reactions`.
--
-- So anybody already inside kept speaking for ever, at any rank: a member
-- admitted before the door was locked, or one whose dues lapsed. Four members
-- with no rank at all were sitting in salons when this was found, and one of
-- them posted a message to prove it (rolled back).
--
-- Reading is untouched. A lapsed member sits in the rooms they belonged to and
-- listens, which is the whole point of not evicting them.
DROP TRIGGER IF EXISTS tr_tier_gate_lounge_messages ON public.lounge_messages;
CREATE TRIGGER tr_tier_gate_lounge_messages
  BEFORE INSERT ON public.lounge_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tier_gate('1', 'The Lounge is an Archivist feature');

DROP TRIGGER IF EXISTS tr_tier_gate_lounge_reactions ON public.lounge_message_reactions;
CREATE TRIGGER tr_tier_gate_lounge_reactions
  BEFORE INSERT ON public.lounge_message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tier_gate('1', 'The Lounge is an Archivist feature');

-- ── 3. CHANGING IS ALSO USING ───────────────────────────────────────────────
--
-- Every tier trigger in the database was BEFORE INSERT, and every ownership
-- UPDATE policy is `user_id = auth.uid()` with no tier condition. So a lapsed
-- Archivist could go on editing their private notes and their shelf for ever —
-- creating nothing new, and using the tools indefinitely.
--
-- The Vault and the Physical Archive are ongoing instruments rather than
-- published work, so editing one IS using it. DELETE stays open on both: taking
-- your own records back is not a paid act.
DROP TRIGGER IF EXISTS tr_tier_gate_private_notes_update ON public.log_private_notes;
CREATE TRIGGER tr_tier_gate_private_notes_update
  BEFORE UPDATE ON public.log_private_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tier_gate('1', 'The Vault is an Archivist feature');

DROP TRIGGER IF EXISTS tr_tier_gate_archive_update ON public.physical_archive;
CREATE TRIGGER tr_tier_gate_archive_update
  BEFORE UPDATE ON public.physical_archive
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tier_gate('1', 'The Physical Archive is an Archivist feature');
