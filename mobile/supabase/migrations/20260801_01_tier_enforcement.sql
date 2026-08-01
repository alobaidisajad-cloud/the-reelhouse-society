-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 6 · #125 / #123 — enforce paid tiers on the server, not just in the app
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NO APP CHANGE. The frozen TestFlight build is unaffected — every client gate
--    already refuses these actions; this stops the REST bypass behind them.
--
-- ── WHAT WAS VERIFIED, NOT ASSUMED ────────────────────────────────────────────
-- Read live from production 2026-08-01: every RLS policy, its permissive/restrictive
-- kind, and every trigger on all six paid tables.
--
--   NO policy and NO trigger anywhere enforces tier.  Both findings CONFIRMED —
--   neither is a false positive, and nothing here fixes something twice.
--
-- ── WHY THE FILED FIX WOULD HAVE FAILED, THREE WAYS ───────────────────────────
--
-- 1. THE PREDICATE WAS WRONG. Both findings proposed some form of
--       p.role IN ('auteur','admin') OR p.tier = 'auteur' OR p.is_founding
--    Diffed against a verbatim transcription of src/utils/tier.ts across ALL 432
--    combinations of tier x role x is_founding:
--       role='admin'     app DENIES, their SQL GRANTS  -> admins handed a paid feature
--       tier='founding'  app GRANTS, their SQL DENIES  -> a founding member locked out
--       tier='AUTEUR'    app GRANTS, their SQL DENIES  -> the app lowercases; they don't
--    normalizeTier maps anything outside archivist|auteur|founding to cinephile
--    (weight 0), and ReelHouseTier has no 'admin' member.
--    The predicate below agrees with the client 432/432. Zero disagreements.
--
-- 2. A NEW POLICY WOULD HAVE DONE NOTHING. dispatch_dossiers carries
--       "Users can manage their dossiers."  FOR ALL  USING (auth.uid() = user_id)
--    with no WITH CHECK — and Postgres then uses USING as the insert check. Live
--    read confirms it is PERMISSIVE. Permissive policies combine with OR, so a new
--    permissive tier policy is OR'd with "it's your own row", which is always true
--    for the attacker. Proven on a replica with a policy that can only say no:
--       permissive  WITH CHECK (false) -> INSERT 0 1   ignored entirely
--       restrictive WITH CHECK (false) -> ERROR: violates row-level security
--    Hence AS RESTRICTIVE everywhere below. A permissive policy would have left the
--    bypass fully open while closing the finding on paper.
--
-- 3. RLS CANNOT REACH TWO OF THE SEVEN SURFACES.
--    • lounge_members has NO INSERT POLICY AT ALL (live-confirmed; the policy #125
--      quotes was deleted by 20260627_01). Joining happens only through
--      join_public_lounge / request_lounge_membership, both SECURITY DEFINER, which
--      bypass RLS. A policy there is unreachable — but a TRIGGER is not, so the gate
--      goes on the table as a trigger and catches every path, including any RPC
--      added later.
--    • log_private_notes is written by trg_divert_private_notes (mine, batch 1),
--      which is SECURITY DEFINER and therefore bypasses that table's RLS. The check
--      must live inside the trigger function.
--
-- ── THE FINDINGS COVER 2 OF 7 PAID SURFACES ───────────────────────────────────
-- src/constants/membership.ts sells seven server-enforceable things. #123/#125 name
-- two. The other five — physical archive, the Vault, the Breakdown Engine, the
-- Editorial Desk, alternate posters — were never filed. The Vault gap is MINE:
-- log_private_notes was created in batch 1 with owner-only policies and no tier
-- predicate.
--
-- ── LAPSED MEMBERS KEEP THEIR WORK. This is the rule the whole design serves. ──
-- Every gate is INSERT-only, or reverts a change rather than erasing a value.
--   a lapsed Auteur    still reads, edits and DELETES essays they published
--   a lapsed Archivist still reads and prunes their physical archive
--   a lapsed member    stays in every lounge they already joined
--   an existing autopsy survives its author's subscription ending
-- Locking someone out of their own work would be worse than the bypass.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1 · the predicate, mirroring src/utils/tier.ts exactly ────────────────────
--
-- normalizeTier: null/''/'free' -> cinephile(0); lowercased; archivist(1),
-- auteur(2), founding(3); ANYTHING ELSE -> cinephile(0), which includes 'admin'
-- and the orphan value 'projectionist' currently in production.
CREATE OR REPLACE FUNCTION public.tier_weight(t text)
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE lower(coalesce(t, ''))
           WHEN 'archivist' THEN 1
           WHEN 'auteur'    THEN 2
           WHEN 'founding'  THEN 3
           ELSE 0
         END;
$$;

COMMENT ON FUNCTION public.tier_weight(text) IS
  'Mirror of normalizeTier + TIER_WEIGHTS in src/utils/tier.ts. Anything outside '
  'archivist|auteur|founding is weight 0 — including admin. Change both together.';

-- resolveTier's "highest watermark" rule is exactly GREATEST.
CREATE OR REPLACE FUNCTION public.profile_tier_weight(
  p_tier text, p_role text, p_is_founding boolean)
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT GREATEST(
    public.tier_weight(p_tier),
    public.tier_weight(CASE WHEN coalesce(p_is_founding, false)
                            THEN 'founding' ELSE p_role END)
  );
$$;

-- SECURITY DEFINER because a policy on logs that reads profiles would otherwise
-- recurse into profiles' own RLS. STABLE (not IMMUTABLE) because it reads a table.
CREATE OR REPLACE FUNCTION public.has_tier_at_least(min_weight integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND public.profile_tier_weight(p.tier, p.role, p.is_founding) >= min_weight
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_tier_at_least(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_tier_at_least(integer) TO authenticated;

-- ── 2 · RESTRICTIVE insert gates — 3 surfaces ────────────────────────────────
-- RESTRICTIVE, never permissive; see note 2 in the header. INSERT only, so the
-- lapsed-member rule holds.

-- Publish Essays to The Dispatch — Auteur (weight 2)
DROP POLICY IF EXISTS tier_gate_dossiers_insert ON public.dispatch_dossiers;
CREATE POLICY tier_gate_dossiers_insert ON public.dispatch_dossiers
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_tier_at_least(2));

-- The Lounge, creation side — Archivist (weight 1)
DROP POLICY IF EXISTS tier_gate_lounges_insert ON public.lounges;
CREATE POLICY tier_gate_lounges_insert ON public.lounges
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_tier_at_least(1));

-- The Physical Archive — Archivist (weight 1)
DROP POLICY IF EXISTS tier_gate_archive_insert ON public.physical_archive;
CREATE POLICY tier_gate_archive_insert ON public.physical_archive
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_tier_at_least(1));

-- ── 3 · The Lounge, joining side — a TRIGGER, because RLS cannot reach it ────
--
-- lounge_members has no INSERT policy and both join paths are SECURITY DEFINER,
-- which bypasses RLS but NOT triggers. A trigger therefore covers every path that
-- exists today and any RPC added later — strictly better than editing two function
-- bodies, and it needs no knowledge of those bodies.
--
-- Only INSERT is gated. A host approving a pending member is an UPDATE and is
-- untouched, so admission still works. An existing member whose tier lapses is
-- never ejected.
CREATE OR REPLACE FUNCTION public.enforce_lounge_tier()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role and other sessions with no auth.uid() are not gated here; RLS and
  -- the RPCs' own 'Not authenticated' guards already cover the anonymous case.
  IF auth.uid() IS NOT NULL AND NOT public.has_tier_at_least(1) THEN
    RAISE EXCEPTION 'The Lounge is an Archivist feature'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_enforce_lounge_tier ON public.lounge_members;
CREATE TRIGGER tr_enforce_lounge_tier
  BEFORE INSERT ON public.lounge_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lounge_tier();

-- ── 4 · The Vault — inside the diverter, because it bypasses RLS ─────────────
--
-- Body is otherwise IDENTICAL to the live version read from pg_proc today. The only
-- change is the entitlement branch at the top.
--
-- An unentitled write is DISCARDED, not raised: raising would fail the whole log
-- write and wedge the offline queue, which replays writes it cannot re-gate.
--
-- ⚠️ It discards WITHOUT deleting an existing note. logs.private_notes is always
-- NULL at rest (this trigger nulls it), so a "revert to OLD" rule would read as
-- NULL and delete a note the member wrote while they were paying. Discarding the
-- incoming value and leaving log_private_notes untouched is the only safe form.
CREATE OR REPLACE FUNCTION public.divert_private_notes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE v text := NULLIF(btrim(NEW.private_notes), '');
BEGIN
  -- The Vault is an Archivist feature. Discard the write, keep any existing note.
  IF NOT public.has_tier_at_least(1) THEN
    UPDATE public.logs SET private_notes = NULL WHERE id = NEW.id;
    RETURN NULL;
  END IF;

  IF v IS NULL THEN
    DELETE FROM public.log_private_notes WHERE log_id = NEW.id;
  ELSE
    INSERT INTO public.log_private_notes (log_id, user_id, notes, updated_at)
    VALUES (NEW.id, NEW.user_id, left(v, 1000), now())
    ON CONFLICT (log_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now();
  END IF;
  UPDATE public.logs SET private_notes = NULL WHERE id = NEW.id;
  RETURN NULL;
END $$;

-- ── 5 · The paid fields ON a free row — a BEFORE trigger, not a policy ──────
--
-- RLS is row-level and cannot gate a column. Any member may write a log; only a
-- paying one may attach these. So the gate reverts the field instead of refusing
-- the row.
--
--   autopsy, is_autopsied, alt_poster            Auteur    (weight 2)
--   editorial_header, pull_quote, drop_cap       Archivist (weight 1)
--
-- ⚠️ REVERT TO OLD, NEVER BLANK TO NULL. The rule is
--       IF NEW.col IS DISTINCT FROM OLD.col AND NOT entitled THEN NEW.col := OLD.col
-- On INSERT, OLD is NULL, so the field is stripped. On UPDATE, a lapsed Auteur
-- editing the TEXT of an essay that already carries an autopsy keeps that autopsy —
-- only an attempt to CHANGE it is reverted. Blanking to NULL would destroy work made
-- while the member was paying, which is the outcome this batch exists to prevent.
--
-- private_notes is deliberately NOT handled here — see note 4.
CREATE OR REPLACE FUNCTION public.enforce_log_tier_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auteur    boolean;
  v_archivist boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;                        -- service_role / system paths untouched
  END IF;

  v_auteur    := public.has_tier_at_least(2);
  v_archivist := public.has_tier_at_least(1);

  IF NOT v_auteur THEN
    IF NEW.autopsy      IS DISTINCT FROM OLD.autopsy      THEN NEW.autopsy      := OLD.autopsy;      END IF;
    IF NEW.is_autopsied IS DISTINCT FROM OLD.is_autopsied THEN NEW.is_autopsied := OLD.is_autopsied; END IF;
    IF NEW.alt_poster   IS DISTINCT FROM OLD.alt_poster   THEN NEW.alt_poster   := OLD.alt_poster;   END IF;
  END IF;

  IF NOT v_archivist THEN
    IF NEW.editorial_header IS DISTINCT FROM OLD.editorial_header THEN NEW.editorial_header := OLD.editorial_header; END IF;
    IF NEW.pull_quote       IS DISTINCT FROM OLD.pull_quote       THEN NEW.pull_quote       := OLD.pull_quote;       END IF;
    IF NEW.drop_cap         IS DISTINCT FROM OLD.drop_cap         THEN NEW.drop_cap         := OLD.drop_cap;         END IF;
  END IF;

  RETURN NEW;
END $$;

-- Named with a leading 'a_' so it sorts before set_logs_updated_at; Postgres fires
-- BEFORE triggers in name order and this one must run on the values as submitted.
DROP TRIGGER IF EXISTS a_enforce_log_tier_fields ON public.logs;
CREATE TRIGGER a_enforce_log_tier_fields
  BEFORE INSERT OR UPDATE ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_log_tier_fields();

COMMIT;

-- ── Verify (run after) ───────────────────────────────────────────────────────
-- Needs a FREE test account and a PAID one. The owner's own account is
-- deliberately free (see audit/BATCH-6-PLAN.md §5b), so it will be refused — that
-- is correct, not a regression.
--
--   as a FREE member, all must be refused:
--     POST /rest/v1/dispatch_dossiers  {"user_id":"<self>","title":"x", ...}
--     POST /rest/v1/lounges            {"creator_id":"<self>","name":"x"}
--     POST /rest/v1/physical_archive   {"user_id":"<self>","film_id":1, ...}
--     POST /rest/v1/rpc/join_public_lounge {"p_lounge_id":"<real>"}
--     PATCH a log setting autopsy / pull_quote  -> saved, but the field stays NULL
--     PATCH a log setting private_notes         -> saved, but no note appears
--   as a PAID member, all must still work, and:
--     an Archivist joins a lounge, writes the archive and a private note
--     an Auteur publishes a dossier and files an autopsy
--   as a LAPSED member (tier removed after creating things):
--     still edits AND DELETES their own dossier
--     still reads and deletes their own archive rows
--     still appears in every lounge they had joined
--     editing an old log's REVIEW TEXT leaves its existing autopsy intact
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP POLICY  IF EXISTS tier_gate_dossiers_insert ON public.dispatch_dossiers;
-- DROP POLICY  IF EXISTS tier_gate_lounges_insert  ON public.lounges;
-- DROP POLICY  IF EXISTS tier_gate_archive_insert  ON public.physical_archive;
-- DROP TRIGGER IF EXISTS tr_enforce_lounge_tier    ON public.lounge_members;
-- DROP TRIGGER IF EXISTS a_enforce_log_tier_fields ON public.logs;
-- DROP FUNCTION IF EXISTS public.enforce_lounge_tier();
-- DROP FUNCTION IF EXISTS public.enforce_log_tier_fields();
-- -- and restore divert_private_notes() from
-- --   supabase/migrations/20260731_03_private_notes_full_closure.sql
--
-- ── NOT DONE HERE, deliberately ─────────────────────────────────────────────
-- logs_insert_rate_limit is PERMISSIVE (live-confirmed), so it is OR'd with
-- "Users can insert their own logs" and reduces to plain ownership. The
-- 200-logs-per-day limit is INERT and has never blocked anything. Real, not in the
-- register, and a one-word fix (AS RESTRICTIVE) — but it changes throttling for
-- every real member and deserves its own batch with its own before/after.
