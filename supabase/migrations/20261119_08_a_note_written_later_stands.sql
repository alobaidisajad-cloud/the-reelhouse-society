-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_08 — a Vault note written earlier never lands over one written later.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A note queued on one phone, sent after the member wrote it again on another, wrote over the newer:
--      viewing_note_set and viewing_note_remove take the moment the note was written, in new forms beside
--      the old (review round 13).
--   New functions only; the old forms stay as they are for every phone from before. A note taken away
--   keeps its moment from 20261119_10 on.
-- Undo: mobile/supabase/migrations-down/20261119_08_a_note_written_later_stands.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A1 · a Vault note written earlier never lands over one written later (review round 13) ──────
--   A note written with a weak signal waited in the phone's queue while the member wrote the note again
--   online ("B", sealed); the queue sent the older "A" later and viewing_note_set wrote it over "B" with
--   no question, on every phone. The phone now lets an older queued note go when a newer one lands
--   (round 13's keyed queue); this is the house's own word on it, for what one phone cannot know: a
--   note queued on one phone, sent after the member wrote the note again on another.
--   viewing_note_set and viewing_note_remove are asked with the moment the member wrote (p_written_at,
--   the house's clock as the phone keeps it). A note is written, or taken away, only over a note
--   written no later than that; a later one stands and the older act does nothing, as a repeat does.
--   A note keeps the moment it was written (updated_at), never a moment later than the house's now.
--   New forms beside the old: the three-argument and one-argument forms stay as they are for every
--   phone from before (TestFlight build 41), which sends no moment.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.viewing_note_set(uuid, uuid, text, timestamptz);
CREATE FUNCTION public.viewing_note_set(p_log_id uuid, p_viewing_id uuid, p_notes text, p_written_at timestamptz) RETURNS void
    LANGUAGE plpgsql
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

  IF v IS NULL THEN
    -- An empty note takes the note away, unless a later one was written meanwhile.
    DELETE FROM public.log_private_notes
     WHERE viewing_id = p_viewing_id AND user_id = auth.uid() AND updated_at <= v_at;
    RETURN;
  END IF;
  IF char_length(v) > 1000 THEN
    RAISE EXCEPTION 'A note holds 1,000 characters at most.' USING ERRCODE = '22001';
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
END $$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by no shipped client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.viewing_note_set(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewing_note_set(uuid, uuid, text, timestamptz) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no shipped client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.viewing_note_remove(uuid, timestamptz);
CREATE FUNCTION public.viewing_note_remove(p_viewing_id uuid, p_written_at timestamptz) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  -- Taken away unless the member wrote it again later than they took it away.
  DELETE FROM public.log_private_notes
   WHERE viewing_id = p_viewing_id AND user_id = auth.uid()
     AND updated_at <= LEAST(COALESCE(p_written_at, now()), now());
END $$;
-- add-only (1): no shipped client uses it: a function this piece makes, called by no shipped client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.viewing_note_remove(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewing_note_remove(uuid, timestamptz) TO authenticated, service_role;
