-- ════════════════════════════════════════════════════════════════════════════
-- A VIEWING BELONGS TO ONE LOG
-- ════════════════════════════════════════════════════════════════════════════
-- Follows 20260917_01_the_vault_per_viewing.sql. Found in the post-ship check of
-- Phases 1 and 2, 2026-09-18.
--
-- ── WHAT WAS WRONG (both proven on production, rolled back) ────────────────
-- A viewing's identity is chosen by the app and written into viewing_history,
-- which every member can read. Nothing said an identity belonged to ONE log:
-- `logs_viewing_id_key` covers only the CURRENT viewing of each log, and a
-- history may hold any identity at all. So another member could:
--   · copy your current viewing's identity into a history of their own and
--     write a note on it first — after which YOUR note on that viewing was
--     silently not saved (viewing_note_set reported success and wrote nothing);
--   · make one of your PAST viewings' identity their own current one — after
--     which you could never remove your rewatch (a unique violation, for ever).
-- Nobody could read or change your note; they could stop you writing it.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
--   1. public.viewings — every viewing identity, current or past, registered to
--      exactly one log. The primary key IS the rule. Clients cannot touch it;
--      the database fills it in itself on every save.
--   2. On every insert, and every update that changes a log's viewings, the
--      log's identities are registered. One that already belongs to another log
--      is refused ("That viewing belongs to another log."). A viewing the log no
--      longer holds is dropped from the registry.
--   3. A note's viewing is a FOREIGN KEY into the registry, ON DELETE CASCADE —
--      so a removed viewing takes its note with it by the schema itself. The
--      trigger that did this by hand (logs_forget_removed_viewing_notes) goes.
--   4. A note must belong to a viewing registered to its own log, of its own
--      writer — read from the registry, not from the public history.
--   5. viewing_note_set can no longer report success for a write that did not
--      happen. With (1) it cannot happen; this is the second wall.
--   6. log_viewing_add refuses another log's viewing in the same plain words,
--      whichever wall (the unique index or the registry) caught it.
--
-- Rules unchanged: READING and WITHDRAWING a note are never gated; WRITING and
-- CHANGING need the Archivist rank (tr_tier_gate_private_notes(_update)).
--
-- ── NO BEGIN/COMMIT IN THIS FILE ───────────────────────────────────────────
-- A COMMIT inside a file that a rehearsal `\i`s closes the rehearsal's own
-- transaction and writes to production. See 20260912_01_a_rank_that_ends.sql.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1 · the registry ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.viewings (
  viewing_id uuid PRIMARY KEY,
  log_id     uuid NOT NULL REFERENCES public.logs (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS viewings_log_idx ON public.viewings (log_id);

COMMENT ON TABLE public.viewings IS
  'Every viewing identity, current or past, and the ONE log it belongs to. Filled by logs_register_viewings; clients have no access.';

ALTER TABLE public.viewings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.viewings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.viewings TO service_role;

-- Every identity that exists today. There are no duplicates (checked on
-- production 2026-09-18); if one ever appears, the primary key refuses here,
-- loudly, rather than letting two logs share a viewing.
INSERT INTO public.viewings (viewing_id, log_id)
SELECT l.viewing_id, l.id FROM public.logs l
UNION ALL
SELECT (e->>'viewingId')::uuid, l.id
  FROM public.logs l, jsonb_array_elements(l.viewing_history) e
ON CONFLICT (viewing_id) DO NOTHING;

-- ON CONFLICT above only makes a re-run harmless. A conflict with ANOTHER log
-- is exactly what this migration exists to forbid, so prove there is none.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.logs l
     WHERE NOT EXISTS (SELECT 1 FROM public.viewings v WHERE v.viewing_id = l.viewing_id AND v.log_id = l.id)
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(l.viewing_history) e
                    WHERE NOT EXISTS (SELECT 1 FROM public.viewings v
                                       WHERE v.viewing_id = (e->>'viewingId')::uuid AND v.log_id = l.id))
  ) THEN
    RAISE EXCEPTION 'Two logs share a viewing identity. Nothing was changed.';
  END IF;
END $$;


-- ── 2 · every save registers its viewings ──────────────────────────────────
-- SECURITY DEFINER: the registry is closed to every client. It runs AFTER the
-- row is written (the registry's key points at it) and after a_keep_viewings
-- has normalized the history, so every identity it reads is a valid uuid.
CREATE OR REPLACE FUNCTION public.logs_register_viewings()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT id) INTO v_ids FROM (
    SELECT NEW.viewing_id AS id
    UNION ALL
    SELECT (e->>'viewingId')::uuid FROM jsonb_array_elements(NEW.viewing_history) e
  ) s;

  BEGIN
    INSERT INTO public.viewings (viewing_id, log_id)
    SELECT id, NEW.id FROM unnest(v_ids) AS id
     WHERE NOT EXISTS (SELECT 1 FROM public.viewings v WHERE v.viewing_id = id AND v.log_id = NEW.id);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That viewing belongs to another log.'
      USING ERRCODE = '23505', HINT = 'A new viewing needs a new identity.';
  END;

  -- A viewing this log no longer holds is gone — and, by the foreign key in
  -- section 3, so is its note.
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM public.viewings WHERE log_id = NEW.id AND viewing_id <> ALL (v_ids);
  END IF;

  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.logs_register_viewings() FROM PUBLIC, anon, authenticated;

-- Named `a_…` so it runs before trg_divert_private_notes, which writes a note
-- onto the viewing this registers.
DROP TRIGGER IF EXISTS a_register_viewings_insert ON public.logs;
CREATE TRIGGER a_register_viewings_insert AFTER INSERT ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.logs_register_viewings();

DROP TRIGGER IF EXISTS a_register_viewings_update ON public.logs;
CREATE TRIGGER a_register_viewings_update AFTER UPDATE ON public.logs
  FOR EACH ROW
  WHEN (OLD.viewing_id IS DISTINCT FROM NEW.viewing_id OR OLD.viewing_history IS DISTINCT FROM NEW.viewing_history)
  EXECUTE FUNCTION public.logs_register_viewings();


-- ── 3 · a note's viewing is a foreign key ──────────────────────────────────
ALTER TABLE public.log_private_notes DROP CONSTRAINT IF EXISTS log_private_notes_viewing_id_fkey;
ALTER TABLE public.log_private_notes
  ADD CONSTRAINT log_private_notes_viewing_id_fkey
  FOREIGN KEY (viewing_id) REFERENCES public.viewings (viewing_id) ON DELETE CASCADE;

-- The schema does this now. Two mechanisms for one rule is how they drift apart.
DROP TRIGGER IF EXISTS logs_forget_removed_viewing_notes ON public.logs;
DROP FUNCTION IF EXISTS public.logs_forget_removed_viewing_notes();


-- ── 4 · a note belongs to a viewing of its own log, of its own writer ──────
-- SECURITY DEFINER to read the closed registry. Nothing else changes: a note
-- still may not move, and its text is still trimmed.
CREATE OR REPLACE FUNCTION public.lpn_belongs_to_its_viewing()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.viewing_id <> OLD.viewing_id OR NEW.log_id <> OLD.log_id OR NEW.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'A note stays with the viewing it was written about.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.viewings v JOIN public.logs l ON l.id = v.log_id
     WHERE v.viewing_id = NEW.viewing_id AND v.log_id = NEW.log_id AND l.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'That note has no viewing of its writer to belong to.' USING ERRCODE = '23503';
  END IF;

  NEW.notes := btrim(NEW.notes);
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.lpn_belongs_to_its_viewing() FROM PUBLIC, anon, authenticated;


-- ── 5 · a write that did not happen is never reported as done ──────────────
CREATE OR REPLACE FUNCTION public.viewing_note_set(p_log_id uuid, p_viewing_id uuid, p_notes text)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
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

REVOKE ALL ON FUNCTION public.viewing_note_set(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewing_note_set(uuid, uuid, text) TO authenticated, service_role;


-- ── 6 · a rewatch that names another log's viewing says so ─────────────────
-- Unchanged from 20260917_01 except the last statement: when the identity is
-- already another log's CURRENT viewing, the unique index refuses before the
-- registry is reached, with Postgres's words. The refusal is the same rule, so
-- it says the same thing.
CREATE OR REPLACE FUNCTION public.log_viewing_add(p_log_id uuid, p_viewing_id uuid, p_fields jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  l public.logs%ROWTYPE;
  r public.logs%ROWTYPE;
  f jsonb := COALESCE(p_fields, '{}'::jsonb);
  a jsonb := public.viewing_fields()->'archived';
  v_entry   jsonb;
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_viewing_id IS NULL THEN
    RAISE EXCEPTION 'A viewing needs an identity.' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO l FROM public.logs WHERE id = p_log_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log not found' USING ERRCODE = 'P0002';
  END IF;

  IF l.viewing_id = p_viewing_id
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(l.viewing_history) x WHERE x->>'viewingId' = p_viewing_id::text) THEN
    RETURN p_viewing_id;
  END IF;

  -- The viewing being left, written out in full — every field a viewing is
  -- made of, and its identity. Never the note.
  SELECT jsonb_object_agg(m->>'key', to_jsonb(l)->col) INTO v_entry
    FROM jsonb_each(a) AS x(col, m);
  v_entry := v_entry || jsonb_build_object('viewingId', l.viewing_id);

  -- The new viewing: what the app sent, over what the log already held.
  SELECT COALESCE(jsonb_object_agg(col, f->col), '{}'::jsonb) INTO v_payload
    FROM jsonb_each(a) AS x(col, m) WHERE f ? col;
  BEGIN
    r := jsonb_populate_record(l, v_payload);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'A viewing was given a value of the wrong kind.' USING ERRCODE = '22023';
  END;
  -- A rewatch is today's, and it is a rewatch, unless the app says otherwise.
  IF NOT (f ? 'watched_date') THEN r.watched_date := current_date; END IF;
  IF NOT (f ? 'status')       THEN r.status       := 'rewatched';  END IF;

  BEGIN
    EXECUTE format('UPDATE public.logs SET viewing_id = $1, viewing_history = $2, %s WHERE id = $3',
                   public.viewing_set_list())
      USING p_viewing_id,
            jsonb_build_array(v_entry) || COALESCE(l.viewing_history, '[]'::jsonb),
            p_log_id,
            r;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That viewing belongs to another log.'
      USING ERRCODE = '23505', HINT = 'A new viewing needs a new identity.';
  END;

  RETURN p_viewing_id;
END $$;

REVOKE ALL ON FUNCTION public.log_viewing_add(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_viewing_add(uuid, uuid, jsonb) TO authenticated, service_role;


-- ── Verify (run after) ─────────────────────────────────────────────────────
--   SELECT count(*) FROM public.viewings;                                          -- = logs + history entries
--   SELECT (SELECT count(*) FROM public.logs)
--        + (SELECT count(*) FROM public.logs, jsonb_array_elements(viewing_history)); -- the same number
--   SELECT has_table_privilege('authenticated', 'public.viewings', 'SELECT');      -- false
