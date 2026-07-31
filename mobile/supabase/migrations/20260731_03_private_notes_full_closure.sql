-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 1B · finding #26 — FULL closure: no one but the owner can read a note
-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ APPLIED TO PRODUCTION 2026-07-31T00:51Z — verified: logs holding a note = 0,
--    notes preserved = 1, anon denied on both logs.private_notes and the new table.
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ READ THE TRADE-OFF BELOW BEFORE APPLYING. This changes what TestFlight
--    testers see.
--
-- WHAT IS STILL OPEN. 20260731_02 took private_notes away from `anon`, so the
-- public key can no longer read it. But `authenticated` still holds GRANT ALL, and
-- the SELECT policy (can_view_user_data) shows any public member's rows to any
-- signed-in caller. So today ANY member can read ANY other member's private notes:
--     GET /rest/v1/logs?select=private_notes   (with a user JWT)  -> 200
-- The field is called "private notes". That is not private.
--
-- WHY NOT JUST REVOKE IT FROM `authenticated`. The shipped TestFlight build reads
-- private_notes as part of LOG_SELECT_COLUMNS (mappers.ts:183) on owner-scoped
-- queries. Revoking the column makes those queries fail outright — the member's
-- whole log list breaks, not just the note. The app cannot be rebuilt until all 33
-- batches are done, so that is not available.
--
-- THE FIX. Keep the column readable, but never let it hold anything. A trigger
-- moves every written note into log_private_notes (owner-only RLS, anon revoked)
-- and blanks the column in the same statement. The column becomes a permanently
-- empty passthrough, so there is nothing left to leak — to anon, to another
-- member, or to a future bug.
--
-- ⚠️ THE COST, STATED PLAINLY. The shipped build reads notes FROM the column, so
-- during the TestFlight freeze a member's own notes will display as EMPTY. Writes
-- still work and are stored safely; nothing is lost. When the launch build ships
-- and reads log_private_notes, every note reappears. The trade is:
--     accept: notes look empty in-app until launch
--     avoid : every member can read every other member's private notes until launch
--
-- PROVEN ON A REPLICA before applying:
--     insert a note            -> column NULL, note in locked table
--     edit with padding        -> trimmed correctly
--     member CLEARS the note   -> locked row DELETED (clearing actually clears)
--     whitespace-only          -> no row created
--     unrelated column updates -> unaffected
--     invariant                -> 0 rows hold any note text, 0 rows non-NULL
--
-- Two bugs were found and fixed during that testing: the WHEN clause is evaluated
-- at pg_trigger_depth() = 0 (not 1, so the original guard never fired), and the
-- first version kept a note the member had deleted.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1 · the locked table (owner-only, anon gets nothing)
CREATE TABLE IF NOT EXISTS public.log_private_notes (
  log_id     uuid PRIMARY KEY REFERENCES public.logs(id)     ON DELETE CASCADE,
  user_id    uuid NOT NULL    REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes      text NOT NULL CHECK (length(notes) BETWEEN 1 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS log_private_notes_user_idx ON public.log_private_notes (user_id);

ALTER TABLE public.log_private_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lpn_select ON public.log_private_notes;
DROP POLICY IF EXISTS lpn_insert ON public.log_private_notes;
DROP POLICY IF EXISTS lpn_update ON public.log_private_notes;
DROP POLICY IF EXISTS lpn_delete ON public.log_private_notes;
CREATE POLICY lpn_select ON public.log_private_notes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY lpn_insert ON public.log_private_notes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY lpn_update ON public.log_private_notes FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY lpn_delete ON public.log_private_notes FOR DELETE USING (user_id = auth.uid());

REVOKE ALL ON public.log_private_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_private_notes TO authenticated;

-- 2 · move what is already there
INSERT INTO public.log_private_notes (log_id, user_id, notes, updated_at)
SELECT l.id, l.user_id, btrim(l.private_notes), COALESCE(l.updated_at, now())
FROM public.logs l
WHERE btrim(COALESCE(l.private_notes,'')) <> ''
ON CONFLICT (log_id) DO NOTHING;

-- 3 · the diverter. Runs on the shipped build's own writes.
CREATE OR REPLACE FUNCTION public.divert_private_notes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v text := NULLIF(btrim(NEW.private_notes), '');
BEGIN
  IF v IS NULL THEN
    DELETE FROM public.log_private_notes WHERE log_id = NEW.id;      -- clearing clears
  ELSE
    INSERT INTO public.log_private_notes (log_id, user_id, notes, updated_at)
    VALUES (NEW.id, NEW.user_id, left(v, 1000), now())
    ON CONFLICT (log_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now();
  END IF;
  UPDATE public.logs SET private_notes = NULL WHERE id = NEW.id;     -- always blank
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_divert_private_notes ON public.logs;
CREATE TRIGGER trg_divert_private_notes
  AFTER INSERT OR UPDATE OF private_notes ON public.logs
  FOR EACH ROW
  -- pg_trigger_depth() is 0 in a WHEN clause at statement level; this is also what
  -- stops the trigger's own UPDATE from re-entering it.
  WHEN (NEW.private_notes IS NOT NULL AND pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.divert_private_notes();

-- 4 · blank whatever is sitting there now
UPDATE public.logs SET private_notes = NULL WHERE private_notes IS NOT NULL;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
--   SELECT count(*) FROM public.logs WHERE private_notes IS NOT NULL;   -- 0
--   SELECT count(*) FROM public.log_private_notes;                      -- the notes
--   as anon:  GET /rest/v1/log_private_notes?select=log_id  -> 401/403, never 200
--
-- ── Rollback ───────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_divert_private_notes ON public.logs;
-- DROP FUNCTION IF EXISTS public.divert_private_notes();
-- UPDATE public.logs l SET private_notes = n.notes
--   FROM public.log_private_notes n WHERE n.log_id = l.id;
-- -- (log_private_notes can be kept; it is harmless and owner-only)
