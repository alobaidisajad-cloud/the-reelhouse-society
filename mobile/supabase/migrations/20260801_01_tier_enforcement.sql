-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 6 · #125 / #123 — enforce paid tiers on the server, not just in the app
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NO APP CHANGE. The frozen TestFlight build is unaffected — every client gate
--    already refuses these actions; this closes the REST bypass behind them.
--
-- ── EVERYTHING BELOW WAS READ LIVE OR EXECUTED, NOT REASONED ABOUT ────────────
-- Read from production 2026-08-01: every RLS policy on all six paid tables, its
-- permissive/restrictive kind, every trigger on those tables, the real nullability
-- and type of all six paid columns, the tier/role values actually in use, and every
-- Edge Function.  NO policy and NO trigger enforces tier anywhere, so both findings
-- are CONFIRMED and nothing here is fixed twice.
--
-- ── THE FILED FIX WOULD HAVE FAILED. So did two of my own drafts. ─────────────
--
-- A. THE PREDICATE WAS WRONG (both findings). They proposed some form of
--       p.role IN ('auteur','admin') OR p.tier = 'auteur' OR p.is_founding
--    Diffed against a verbatim transcription of src/utils/tier.ts across ALL 432
--    combinations of tier x role x is_founding:
--       role='admin'     app DENIES, their SQL GRANTS  -> admins handed a paid feature
--       tier='founding'  app GRANTS, their SQL DENIES  -> a founding member locked out
--       tier='AUTEUR'    app GRANTS, their SQL DENIES  -> the app lowercases; they don't
--    The predicate below agrees with the client 432/432, zero disagreements.
--
-- B. A NEW POLICY ALONE DOES NOTHING (both findings). dispatch_dossiers carries
--    "Users can manage their dossiers." FOR ALL USING (auth.uid() = user_id) with no
--    WITH CHECK — Postgres then uses USING as the insert check — and it is
--    PERMISSIVE. Permissive policies OR together, so a new permissive tier policy is
--    OR'd with "it's your own row", always true for the attacker. Proven:
--       permissive  WITH CHECK (false) -> INSERT 0 1   ignored entirely
--       restrictive WITH CHECK (false) -> ERROR        blocks
--
-- C. MY FIRST DRAFT WOULD HAVE BROKEN LOG SAVING ENTIRELY. It used one rule for
--    insert and update — "put OLD back" — but on INSERT OLD is NULL, so it wrote
--    NULL into every gated column. Verified against production data (255 logs):
--    is_autopsied and drop_cap are BOOLEANS that are never null. Reproduced:
--       ERROR: null value in column "is_autopsied" violates not-null constraint
--    Every free member would have been unable to save ANY log. (drop_cap is a
--    boolean FLAG; that draft also treated it as text.)
--
-- D. MY SECOND DRAFT GATED LOUNGES WITH A POLICY THAT THE APP NEVER TOUCHES.
--    src/stores/lounge.ts:754 calls rpc('create_lounge'), which is SECURITY DEFINER
--    (20260627_01:216) and bypasses RLS. An older create_lounge_with_member exists
--    in three earlier migrations and is also SECURITY DEFINER. The policy guarded a
--    door nobody uses.
--
-- E. PATCHING divert_private_notes ALONE LEFT THE VAULT OPEN. log_private_notes'
--    own lpn_insert policy is `WITH CHECK (user_id = auth.uid())` with no tier
--    condition, so a direct POST to /rest/v1/log_private_notes skips the diverter.
--
-- ── SO THE GATE IS A TRIGGER ON EVERY GATED TABLE ────────────────────────────
-- Rather than audit every write path and hope the list is complete — an approach
-- that has now been wrong three times — the gate goes on the TABLES. A BEFORE
-- INSERT trigger fires for every writer: direct REST, a SECURITY DEFINER RPC,
-- another trigger, an Edge Function using a user's JWT, or anything added later.
-- The RESTRICTIVE policies are kept as a second, independent layer.
--
-- Edge Functions were checked: none writes to any gated table (send-email only
-- READS logs.rating for the weekly digest). Service-role paths are deliberately not
-- gated — the triggers skip when auth.uid() IS NULL — because a system job acting
-- with no member session must not be blocked.
--
-- ── THE FINDINGS COVER 2 OF 7 PAID SURFACES ──────────────────────────────────
-- src/constants/membership.ts sells seven server-enforceable things. #123/#125 name
-- two. Also gated here: the Physical Archive, the Vault, the Breakdown Engine, the
-- Editorial Desk and alternate posters. The Vault gap is MINE — log_private_notes
-- was created in batch 1 with owner-only policies and no tier predicate.
--
-- ── LAPSED MEMBERS KEEP THEIR WORK. The rule the whole design serves. ─────────
-- Every gate is INSERT-only, or reverts a change rather than erasing a value.
--   a lapsed Auteur    still reads, edits and DELETES essays they published
--   a lapsed Archivist still reads and prunes their physical archive
--   a lapsed member    stays in every lounge they already joined
--   an existing autopsy survives its author's subscription ending
-- Locking someone out of their own work would be worse than the bypass.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1 · the predicate, mirroring src/utils/tier.ts exactly ───────────────────
--
-- normalizeTier: null/''/'free' -> cinephile(0); lowercased; archivist(1),
-- auteur(2), founding(3); ANYTHING ELSE -> cinephile(0) — which includes 'admin'
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

-- SECURITY DEFINER because a policy or trigger that reads `profiles` would
-- otherwise recurse into profiles' own RLS. STABLE because it reads a table.
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

-- ── 2 · one gate, used by every gated table ──────────────────────────────────
--
-- TG_ARGV[0] = required weight, TG_ARGV[1] = the message the member sees.
-- Skips when auth.uid() IS NULL so service-role and system paths still work.
CREATE OR REPLACE FUNCTION public.enforce_tier_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_tier_at_least(TG_ARGV[0]::integer) THEN
    RAISE EXCEPTION '%', TG_ARGV[1] USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- Publish Essays to The Dispatch — Auteur
DROP TRIGGER IF EXISTS tr_tier_gate_dossiers ON public.dispatch_dossiers;
CREATE TRIGGER tr_tier_gate_dossiers BEFORE INSERT ON public.dispatch_dossiers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tier_gate(2, 'The Dispatch is an Auteur feature');

-- The Lounge, creating one — Archivist
DROP TRIGGER IF EXISTS tr_tier_gate_lounges ON public.lounges;
CREATE TRIGGER tr_tier_gate_lounges BEFORE INSERT ON public.lounges
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tier_gate(1, 'The Lounge is an Archivist feature');

-- The Lounge, joining one — Archivist. Only INSERT: a host approving a pending
-- member is an UPDATE and stays untouched, and a member whose tier lapses is
-- never ejected.
DROP TRIGGER IF EXISTS tr_tier_gate_lounge_members ON public.lounge_members;
CREATE TRIGGER tr_tier_gate_lounge_members BEFORE INSERT ON public.lounge_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tier_gate(1, 'The Lounge is an Archivist feature');

-- The Physical Archive — Archivist
DROP TRIGGER IF EXISTS tr_tier_gate_archive ON public.physical_archive;
CREATE TRIGGER tr_tier_gate_archive BEFORE INSERT ON public.physical_archive
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tier_gate(1, 'The Physical Archive is an Archivist feature');

-- The Vault — Archivist. Closes the direct-REST path that the diverter cannot see.
DROP TRIGGER IF EXISTS tr_tier_gate_private_notes ON public.log_private_notes;
CREATE TRIGGER tr_tier_gate_private_notes BEFORE INSERT ON public.log_private_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tier_gate(1, 'The Vault is an Archivist feature');

-- ── 3 · RESTRICTIVE policies — a second, independent layer ──────────────────
--
-- These cannot reach a SECURITY DEFINER writer (which is why §2 exists), but they
-- do block direct REST, they are visible in the Supabase dashboard, and they mean
-- a dropped trigger does not silently reopen everything.
DROP POLICY IF EXISTS tier_gate_dossiers_insert ON public.dispatch_dossiers;
CREATE POLICY tier_gate_dossiers_insert ON public.dispatch_dossiers
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_tier_at_least(2));

DROP POLICY IF EXISTS tier_gate_lounges_insert ON public.lounges;
CREATE POLICY tier_gate_lounges_insert ON public.lounges
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_tier_at_least(1));

DROP POLICY IF EXISTS tier_gate_archive_insert ON public.physical_archive;
CREATE POLICY tier_gate_archive_insert ON public.physical_archive
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_tier_at_least(1));

DROP POLICY IF EXISTS tier_gate_private_notes_insert ON public.log_private_notes;
CREATE POLICY tier_gate_private_notes_insert ON public.log_private_notes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_tier_at_least(1));

-- ── 4 · The Vault, through the app's real path ──────────────────────────────
--
-- Body is otherwise IDENTICAL to the live version read from pg_proc today; only the
-- entitlement branch is new. An unentitled write is DISCARDED, not raised: raising
-- here would fail the whole log write and wedge the offline queue, which replays
-- writes it cannot re-gate. The trigger in §2 is what stops the direct path.
--
-- ⚠️ It discards WITHOUT deleting an existing note. logs.private_notes is always
-- NULL at rest (this trigger nulls it), so a "revert to OLD" rule would read NULL
-- and delete a note the member wrote while they were paying.
CREATE OR REPLACE FUNCTION public.divert_private_notes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE v text := NULLIF(btrim(NEW.private_notes), '');
BEGIN
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

-- ── 5 · The paid fields ON a free row — strip, never refuse ─────────────────
--
-- RLS is row-level and cannot gate a column. Any member may write a log; only a
-- paying one may attach these. So the gate reverts the field instead of refusing
-- the row — refusing would break logging for everyone who tried.
--
--   autopsy, is_autopsied, alt_poster            Auteur    (weight 2)
--   editorial_header, pull_quote, drop_cap       Archivist (weight 1)
--
-- INSERT and UPDATE are handled separately, and that is not cosmetic — see note C.
-- Verified against production (255 logs) which of these can be empty:
--   autopsy 231 NULL · alt_poster 226 · editorial_header 187 · pull_quote 103
--   is_autopsied 0 NULL -> boolean, never null
--   drop_cap     0 NULL -> boolean, never null (true x2, false x248)
--
-- On INSERT each gated column is set to its unentitled value explicitly (NULL for
-- the four nullable ones, false for the two booleans). On UPDATE it is reverted to
-- OLD, so a lapsed Auteur editing the TEXT of a log keeps the autopsy they filed
-- while paying — only an attempt to CHANGE it is undone.
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

  IF TG_OP = 'INSERT' THEN
    IF NOT v_auteur THEN
      NEW.autopsy      := NULL;
      NEW.is_autopsied := false;       -- NOT NULL boolean; never write NULL here
      NEW.alt_poster   := NULL;
    END IF;
    IF NOT v_archivist THEN
      NEW.editorial_header := NULL;
      NEW.pull_quote       := NULL;
      NEW.drop_cap         := false;   -- NOT NULL boolean; never write NULL here
    END IF;
  ELSE  -- UPDATE: put back exactly what was there, so nothing paid-for is lost
    IF NOT v_auteur THEN
      NEW.autopsy      := OLD.autopsy;
      NEW.is_autopsied := OLD.is_autopsied;
      NEW.alt_poster   := OLD.alt_poster;
    END IF;
    IF NOT v_archivist THEN
      NEW.editorial_header := OLD.editorial_header;
      NEW.pull_quote       := OLD.pull_quote;
      NEW.drop_cap         := OLD.drop_cap;
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Named 'a_' so it sorts before set_logs_updated_at; Postgres fires BEFORE triggers
-- in name order and this one must see the values as submitted.
DROP TRIGGER IF EXISTS a_enforce_log_tier_fields ON public.logs;
CREATE TRIGGER a_enforce_log_tier_fields
  BEFORE INSERT OR UPDATE ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_log_tier_fields();

COMMIT;

-- ── Verify (run after) ──────────────────────────────────────────────────────
-- Needs a FREE test account and a PAID one. The owner's own account is
-- deliberately free (audit/BATCH-6-PLAN.md §5b), so it will be refused — correct.
--
--   as a FREE member, all must be refused:
--     POST /rest/v1/dispatch_dossiers
--     POST /rest/v1/rpc/create_lounge          (the app's real path)
--     POST /rest/v1/lounges                    (direct)
--     POST /rest/v1/rpc/join_public_lounge
--     POST /rest/v1/physical_archive
--     POST /rest/v1/log_private_notes          (direct — the path the diverter cannot see)
--     PATCH a log setting autopsy / pull_quote -> saved, fields come back NULL/false
--     PATCH a log setting private_notes        -> saved, no note appears
--   as a PAID member everything above must still work.
--   as a LAPSED member: still edits AND DELETES their dossier, still in their
--     lounge, editing a log's review text leaves its autopsy intact, their old
--     private note survives.
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS tr_tier_gate_dossiers       ON public.dispatch_dossiers;
-- DROP TRIGGER IF EXISTS tr_tier_gate_lounges        ON public.lounges;
-- DROP TRIGGER IF EXISTS tr_tier_gate_lounge_members ON public.lounge_members;
-- DROP TRIGGER IF EXISTS tr_tier_gate_archive        ON public.physical_archive;
-- DROP TRIGGER IF EXISTS tr_tier_gate_private_notes  ON public.log_private_notes;
-- DROP TRIGGER IF EXISTS a_enforce_log_tier_fields   ON public.logs;
-- DROP POLICY  IF EXISTS tier_gate_dossiers_insert      ON public.dispatch_dossiers;
-- DROP POLICY  IF EXISTS tier_gate_lounges_insert       ON public.lounges;
-- DROP POLICY  IF EXISTS tier_gate_archive_insert       ON public.physical_archive;
-- DROP POLICY  IF EXISTS tier_gate_private_notes_insert ON public.log_private_notes;
-- DROP FUNCTION IF EXISTS public.enforce_tier_gate();
-- DROP FUNCTION IF EXISTS public.enforce_log_tier_fields();
-- -- and restore divert_private_notes() from
-- --   supabase/migrations/20260731_03_private_notes_full_closure.sql
--
-- ── NOT DONE HERE, deliberately ────────────────────────────────────────────
-- logs_insert_rate_limit is PERMISSIVE (live-confirmed), so it is OR'd with
-- "Users can insert their own logs" and reduces to plain ownership. The
-- 200-logs-per-day limit is INERT and has never blocked anything. Real, not in the
-- register, a one-word fix (AS RESTRICTIVE) — but it changes throttling for every
-- real member and deserves its own batch with its own before/after.
