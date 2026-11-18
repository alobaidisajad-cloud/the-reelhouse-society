-- Undo of 20261119_10: a Vault note taken away stays away from a note written before it, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A5 undone · the note's forms as H-A1 and the house before it left them ──
-- The kept removals stay in H-A5's table until its own undo drops it; no form reads them after this.

CREATE OR REPLACE FUNCTION public.viewing_note_remove(p_viewing_id uuid, p_written_at timestamptz) RETURNS void
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

CREATE OR REPLACE FUNCTION public.viewing_note_set(p_log_id uuid, p_viewing_id uuid, p_notes text, p_written_at timestamptz) RETURNS void
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

CREATE OR REPLACE FUNCTION public.viewing_note_set(p_log_id uuid, p_viewing_id uuid, p_notes text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v text := NULLIF(btrim(COALESCE(p_notes, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v IS NULL THEN
    DELETE FROM public.log_private_notes WHERE viewing_id = p_viewing_id AND user_id = auth.uid();
    RETURN;
  END IF;
  IF char_length(v) > 1000 THEN
    RAISE EXCEPTION 'A note holds 1,000 characters at most.' USING ERRCODE = '22001';
  END IF;

  INSERT INTO public.log_private_notes (log_id, viewing_id, user_id, notes, updated_at)
  VALUES (p_log_id, p_viewing_id, auth.uid(), v, now())
  ON CONFLICT (viewing_id) DO UPDATE
    SET notes = EXCLUDED.notes, updated_at = now()
    WHERE public.log_private_notes.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That viewing is not yours.' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.viewing_note_remove(p_viewing_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.log_private_notes WHERE viewing_id = p_viewing_id AND user_id = auth.uid();
END $$;
