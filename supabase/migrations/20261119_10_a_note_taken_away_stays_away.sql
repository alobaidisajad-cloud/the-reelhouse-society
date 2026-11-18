-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_10 — a Vault note taken away stays away from a note written before it.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A note taken away on one phone came back when another phone sent an older note for the viewing:
--      a removal keeps its moment (20261119_09), and a note written before it is not written (review
--      round 13). The removed note's row is still deleted, so every reader finds no note, as before.
--   The note functions only (20261119_08's forms and the forms from before); no table is locked.
-- Undo: mobile/supabase/migrations-down/20261119_10_a_note_taken_away_stays_away.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A5 · a Vault note taken away stays away from a note written before it (review round 13) ──────
--   A member took a viewing's note away on one phone; another phone had a note for it, written
--   earlier and still queued; sent later, it found no row to stand against and the note came back
--   on every phone. H-A1 kept a note written earlier from landing over one written later, but a
--   removal left nothing behind to be later than. Now a removal keeps its moment for the viewing
--   (viewing_notes_removed, H-A5's table), and a note written before that moment is done without
--   being written, as a repeat is. A note written after it lands and lets the kept moment go.
--   The removed note's row is still deleted: every reader of notes (the phone, the website, the
--   archive export, the Vault) finds no note there, exactly as before, and none reads the new table.
--   · viewing_note_set(4) and viewing_note_remove(2) (H-A1's forms) run as the house now, to read and
--     keep the moment; each still acts only on the caller's own note, by auth.uid(), and a removal
--     is kept only for a viewing of the caller's own record. The rank gate (enforce_tier_gate) and
--     the note's viewing check (lpn_belongs_to_its_viewing) still judge every write, by auth.uid().
--   · A set and a removal of one viewing go one after the other (an advisory lock per viewing, to the
--     end of the transaction): at the same moment, each read the other as not there yet.
--   · The forms from before (no moment: TestFlight build 41 and the website) are now these, asked
--     with the house's now: a removal from an older phone keeps its moment too, and what they write
--     and refuse is what they wrote and refused before.

-- add-only (3): it only fixes: a note written before its viewing's removal is done unwritten, a note written after lands, and only the caller's own note and viewing are touched, as the H-A5 rehearsal replays as the members themselves; no shipped client calls this form (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.viewing_note_remove(p_viewing_id uuid, p_written_at timestamptz) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_at timestamptz := LEAST(COALESCE(p_written_at, now()), now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  -- One viewing's note is set and taken away one act after the other: a note queued on one phone and
  -- a removal on another at the same moment otherwise each read the other as not there, and the older
  -- note stood after the later removal. Held to the end of the transaction.
  PERFORM pg_advisory_xact_lock(hashtext('note:' || p_viewing_id::text));
  -- Taken away unless the member wrote it again later than they took it away.
  DELETE FROM public.log_private_notes
   WHERE viewing_id = p_viewing_id AND user_id = auth.uid() AND updated_at <= v_at;
  -- Its moment kept, unless a later note still stands; only for a viewing of the caller's own record.
  IF NOT EXISTS (SELECT 1 FROM public.log_private_notes WHERE viewing_id = p_viewing_id)
     AND EXISTS (SELECT 1 FROM public.viewings v JOIN public.logs l ON l.id = v.log_id
                  WHERE v.viewing_id = p_viewing_id AND l.user_id = auth.uid()) THEN
    INSERT INTO public.viewing_notes_removed AS r (viewing_id, user_id, removed_at)
    VALUES (p_viewing_id, auth.uid(), v_at)
    ON CONFLICT (viewing_id) DO UPDATE
      SET removed_at = GREATEST(r.removed_at, EXCLUDED.removed_at), user_id = EXCLUDED.user_id;
  END IF;
END $$;

-- add-only (3): it only fixes: a note written before its viewing's removal is done unwritten, as the H-A5 rehearsal replays as the members themselves; every other note is written and refused as H-A1 wrote and refused it; no shipped client calls this form (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.viewing_note_set(p_log_id uuid, p_viewing_id uuid, p_notes text, p_written_at timestamptz) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v    text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  -- When the member wrote it, never later than now: a phone's clock ahead of the house's cannot
  -- make a note stand over every later one.
  v_at timestamptz := LEAST(COALESCE(p_written_at, now()), now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  -- One viewing's note is set and taken away one act after the other: a note queued on one phone and
  -- a removal on another at the same moment otherwise each read the other as not there, and the older
  -- note stood after the later removal. Held to the end of the transaction.
  PERFORM pg_advisory_xact_lock(hashtext('note:' || p_viewing_id::text));

  IF v IS NULL THEN
    -- An empty note takes the note away, with its moment kept.
    PERFORM public.viewing_note_remove(p_viewing_id, v_at);
    RETURN;
  END IF;
  IF char_length(v) > 1000 THEN
    RAISE EXCEPTION 'A note holds 1,000 characters at most.' USING ERRCODE = '22001';
  END IF;

  -- Taken away after this was written: done, unwritten.
  IF EXISTS (SELECT 1 FROM public.viewing_notes_removed
              WHERE viewing_id = p_viewing_id AND user_id = auth.uid() AND removed_at > v_at) THEN
    RETURN;
  END IF;

  INSERT INTO public.log_private_notes (log_id, viewing_id, user_id, notes, updated_at)
  VALUES (p_log_id, p_viewing_id, auth.uid(), v, v_at)
  ON CONFLICT (viewing_id) DO UPDATE
    SET notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at
    WHERE public.log_private_notes.user_id = auth.uid()
      AND public.log_private_notes.updated_at <= EXCLUDED.updated_at;

  IF NOT FOUND THEN
    -- The member's own note, written later than this: it stands, and this older one is done.
    IF EXISTS (SELECT 1 FROM public.log_private_notes WHERE viewing_id = p_viewing_id AND user_id = auth.uid()) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'That viewing is not yours.' USING ERRCODE = '42501';
  END IF;
  -- Written after the removal: the kept moment has done its work.
  DELETE FROM public.viewing_notes_removed WHERE viewing_id = p_viewing_id AND removed_at <= v_at;
END $$;

-- The form from before, asked with the house's now: written as before, and a removal's moment kept.
-- add-only (3): it only fixes: a note written or emptied by this form is written and refused as before, and its removal keeps its moment, as the H-A5 rehearsal replays as the members themselves; TestFlight build 41 and the website call it with the same three arguments and get the same answers
CREATE OR REPLACE FUNCTION public.viewing_note_set(p_log_id uuid, p_viewing_id uuid, p_notes text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public.viewing_note_set(p_log_id, p_viewing_id, p_notes, now());
END $$;

-- add-only (3): it only fixes: a note taken away by this form is taken away as before and its moment is kept, as the H-A5 rehearsal replays as the members themselves; TestFlight build 41 and the website call it with the same argument and get the same answer
CREATE OR REPLACE FUNCTION public.viewing_note_remove(p_viewing_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public.viewing_note_remove(p_viewing_id, now());
END $$;
