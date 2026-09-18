-- ════════════════════════════════════════════════════════════════════════════
-- THE VAULT, PER VIEWING
-- ════════════════════════════════════════════════════════════════════════════
-- A private note belongs to the VIEWING it was written about, and only the
-- member who wrote it can ever read it. Plan: the page "The Vault, per viewing"
-- (approved 2026-09-17).
--
-- ── WHAT WAS WRONG (each proven on production, rolled back) ────────────────
--   · Notes read back EMPTY in both apps: they read logs.private_notes, which
--     divert_private_notes keeps blank on purpose.
--   · Clearing a note did not delete it: the apps send NULL, and the diverter's
--     WHEN clause only fires on a non-NULL value. Clearing is now its own act
--     (viewing_note_set with an empty note, or viewing_note_remove) — see the
--     note on section 7 for why the log column cannot express it.
--   · A lapsed member could not take a note back: the diverter checked the rank
--     before anything else and threw the clear away.
--   · A rewatch copied the previous viewing — note included — into
--     viewing_history, which anon and every member can read. Dormant only
--     because the apps no longer knew the note.
--   · 16 histories were corrupted by the web: a rewatch spread a JSON STRING
--     into single characters (one log held 1,691). 189 of 319 histories were
--     stored as strings, not arrays.
--   · A viewing had no identity, so a note could not belong to one.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
--   1. logs.viewing_id — the current viewing's permanent identity. Every past
--      viewing in viewing_history carries its own `viewingId`.
--   2. get_featured_critique gains the new column (it returns SETOF logs,
--      positionally — without this it fails at call time).
--   3. normalize_viewing_history — a history is ALWAYS a proper array of
--      objects: strings decoded, exploded characters rejoined, `privateNotes`
--      stripped, every viewing given an identity.
--   3b. viewing_fields — the ONE place that says which columns of a log are
--      part of a viewing and what each is called in a history. The two
--      operations read it instead of listing fields by hand, and the migration
--      REFUSES TO RUN if logs ever holds a column nobody decided about.
--   4. logs_keep_viewings — on every save, from every app: normalize, count
--      viewings from the history itself, and allow a log to move to another
--      viewing only by a change SHAPED like adding one or removing one. It is
--      never told what an app meant; it reads what the change is.
--   5. The one-time repair of every history (updated_at left untouched).
--   6. log_private_notes is keyed by viewing, and a note must belong to a
--      viewing of its own log.
--   7. divert_private_notes (the OLD build's path only): a note written on the
--      log column is pinned to the current viewing. It never deletes.
--   8. A removed viewing takes its note with it.
--   9. The two viewing operations (log_viewing_add, log_viewing_remove) and the
--      note actions (viewing_note_set, viewing_note_remove) — the only way the
--      launch apps change viewings and notes. All SECURITY INVOKER, so RLS and
--      every tier trigger still stand in front of them.
--
-- ── THE RULES IT SERVES ────────────────────────────────────────────────────
--   READING is never gated.     lpn_select is owner-only, with no rank.
--   WITHDRAWING is never gated. viewing_note_set('') and viewing_note_remove
--                               carry no rank check, so a lapsed member can
--                               always take their own writing back.
--   WRITING and CHANGING need the Archivist rank — tr_tier_gate_private_notes
--                               and _update still stand, untouched.
--
-- ── NO BEGIN/COMMIT IN THIS FILE ───────────────────────────────────────────
-- A COMMIT inside a file that a rehearsal `\i`s closes the rehearsal's own
-- transaction and writes to production. See 20260912_01_a_rank_that_ends.sql.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1 · every viewing has an identity ──────────────────────────────────────
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS viewing_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS logs_viewing_id_key ON public.logs (viewing_id);


-- ── 2 · the featured critique, with the new column in its place ────────────
CREATE OR REPLACE FUNCTION public.get_featured_critique() RETURNS SETOF public.logs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,                              -- 1
    l.user_id,                         -- 2
    l.film_id,                         -- 3
    l.film_title,                      -- 4
    l.rating,                          -- 5
    l.review,                          -- 6
    NULL::date,                        -- 7  watched_date
    NULL::text,                        -- 8  format
    l.created_at,                      -- 9
    l.poster_path,                     -- 10
    NULL::text,                        -- 11 year
    l.status,                          -- 12
    l.is_spoiler,                      -- 13
    l.watched_with,                    -- 14
    NULL::text,                        -- 15 private_notes   <-- the leak, closed
    l.abandoned_reason,                -- 16
    NULL::text,                        -- 17 physical_media
    l.is_autopsied,                    -- 18
    l.autopsy,                         -- 19
    NULL::text,                        -- 20 alt_poster
    l.editorial_header,                -- 21
    l.drop_cap,                        -- 22
    l.pull_quote,                      -- 23
    NULL::timestamptz,                 -- 24 updated_at
    NULL::text,                        -- 25 video_url
    NULL::jsonb,                       -- 26 viewing_history <-- also closed
    NULL::integer,                     -- 27 view_count
    NULL::uuid                         -- 28 viewing_id      <-- 2026-09-17
  FROM public.logs l
  JOIN public.profiles p ON p.id = l.user_id
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND LENGTH(l.review) > 100
    AND l.rating >= 4
    AND COALESCE(p.is_social_private, false) = false
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;


-- ── 3 · a history is always a proper list ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_viewing_history(p_history jsonb, p_depth integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_out   jsonb := '[]'::jsonb;
  v_run   text  := '';
  v_seen  text[] := '{}';
  v_e     jsonb;
  v_entry jsonb;
  v_part  jsonb;
  v_id    text;
BEGIN
  -- A string of a string of a string is still recoverable; beyond this it is noise.
  IF p_depth > 6 OR p_history IS NULL OR jsonb_typeof(p_history) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Stored as a JSON string (the web's JSON.stringify): decode it.
  IF jsonb_typeof(p_history) = 'string' THEN
    IF pg_input_is_valid(p_history #>> '{}', 'jsonb') THEN
      RETURN public.normalize_viewing_history((p_history #>> '{}')::jsonb, p_depth + 1);
    END IF;
    RETURN '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_history) = 'object' THEN
    p_history := jsonb_build_array(p_history);
  ELSIF jsonb_typeof(p_history) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_e IN SELECT x.value FROM jsonb_array_elements(p_history) WITH ORDINALITY AS x(value, ord) ORDER BY x.ord
  LOOP
    -- The web's rewatch spread a string into single characters. Consecutive
    -- string elements are joined back together and decoded in place.
    IF jsonb_typeof(v_e) = 'string' THEN
      v_run := v_run || (v_e #>> '{}');
      CONTINUE;
    END IF;
    IF v_run <> '' THEN
      v_part := public.normalize_viewing_history(to_jsonb(v_run), p_depth + 1);
      v_run := '';
      FOR v_entry IN SELECT y.value FROM jsonb_array_elements(v_part) WITH ORDINALITY AS y(value, ord) ORDER BY y.ord LOOP
        v_id := v_entry->>'viewingId';
        IF v_id = ANY (v_seen) THEN
          v_entry := v_entry || jsonb_build_object('viewingId', gen_random_uuid());
          v_id := v_entry->>'viewingId';
        END IF;
        v_seen := v_seen || v_id;
        v_out := v_out || jsonb_build_array(v_entry);
      END LOOP;
    END IF;

    IF jsonb_typeof(v_e) = 'object' THEN
      -- A note never lives in a history anybody else can read.
      v_entry := v_e - 'privateNotes' - 'private_notes';
      v_id := v_entry->>'viewingId';
      IF v_id IS NULL OR NOT pg_input_is_valid(v_id, 'uuid') OR v_id = ANY (v_seen) THEN
        v_entry := v_entry || jsonb_build_object('viewingId', gen_random_uuid());
        v_id := v_entry->>'viewingId';
      END IF;
      v_seen := v_seen || v_id;
      v_out := v_out || jsonb_build_array(v_entry);
    END IF;
    -- Numbers, booleans and nulls are not viewings: dropped.
  END LOOP;

  IF v_run <> '' THEN
    v_part := public.normalize_viewing_history(to_jsonb(v_run), p_depth + 1);
    FOR v_entry IN SELECT y.value FROM jsonb_array_elements(v_part) WITH ORDINALITY AS y(value, ord) ORDER BY y.ord LOOP
      v_id := v_entry->>'viewingId';
      IF v_id = ANY (v_seen) THEN
        v_entry := v_entry || jsonb_build_object('viewingId', gen_random_uuid());
        v_id := v_entry->>'viewingId';
      END IF;
      v_seen := v_seen || v_id;
      v_out := v_out || jsonb_build_array(v_entry);
    END LOOP;
  END IF;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.normalize_viewing_history(jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_viewing_history(jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_viewing_history(jsonb, integer) TO authenticated, service_role;


-- ── 3b · what a viewing is made of ─────────────────────────────────────────
-- One declaration, read by both operations. Every column of a log is either
-- part of a viewing (and has a name in a history) or explicitly not one, and
-- the check below refuses to let a column be forgotten.
CREATE OR REPLACE FUNCTION public.viewing_fields()
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT '{
    "archived": {
      "watched_date":     {"key": "date",            "fallback": null},
      "rating":           {"key": "rating",          "fallback": 0},
      "review":           {"key": "review",          "fallback": ""},
      "format":           {"key": "format",          "fallback": "digital"},
      "status":           {"key": "status",          "fallback": "watched"},
      "is_spoiler":       {"key": "isSpoiler",       "fallback": false},
      "watched_with":     {"key": "watchedWith",     "fallback": null},
      "abandoned_reason": {"key": "abandonedReason", "fallback": null},
      "physical_media":   {"key": "physicalMedia",   "fallback": null},
      "is_autopsied":     {"key": "isAutopsied",     "fallback": false},
      "autopsy":          {"key": "autopsy",         "fallback": null},
      "alt_poster":       {"key": "altPoster",       "fallback": null},
      "editorial_header": {"key": "editorialHeader", "fallback": null},
      "drop_cap":         {"key": "dropCap",         "fallback": false},
      "pull_quote":       {"key": "pullQuote",       "fallback": ""},
      "video_url":        {"key": "videoUrl",        "fallback": null}
    },
    "not_a_viewing": ["id", "user_id", "film_id", "film_title", "poster_path",
                      "year", "created_at", "updated_at", "private_notes",
                      "viewing_history", "view_count", "viewing_id"]
  }'::jsonb;
$$;

-- Any column of logs that the declaration above does not account for. Empty is
-- the only acceptable answer; the live check reads this too.
CREATE OR REPLACE FUNCTION public.viewing_fields_uncovered()
RETURNS text[]
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(a.attname ORDER BY a.attnum), '{}'::text[])
    FROM pg_attribute a
   WHERE a.attrelid = 'public.logs'::regclass
     AND a.attnum > 0 AND NOT a.attisdropped
     AND NOT (public.viewing_fields()->'archived' ? a.attname)
     AND NOT (public.viewing_fields()->'not_a_viewing' @> to_jsonb(a.attname));
$$;

DO $$
DECLARE v text[] := public.viewing_fields_uncovered();
BEGIN
  IF array_length(v, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'logs holds a column nobody decided about: %. Say in viewing_fields() whether it is part of a viewing or not.', array_to_string(v, ', ');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.viewing_fields() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.viewing_fields_uncovered() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewing_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.viewing_fields_uncovered() TO service_role;


-- ── 4 · on every save, from every app ──────────────────────────────────────
-- The trigger is never TOLD what an app meant. A log may move to another
-- viewing only if the change is SHAPED like one of the two legal moves:
--   adding   — the history grows by one at the front, and that new front entry
--              IS the viewing the log is leaving;
--   removing — the front entry leaves the history, and the log becomes it.
-- Anything else keeps its viewing and may not lose a past one. This holds for
-- every caller — our operations, an old build, or a hand-written request.
CREATE OR REPLACE FUNCTION public.logs_keep_viewings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old       jsonb;
  v_old_ids   text[];
  v_new_ids   text[];
  v_moved     boolean;
  v_is_add    boolean := false;
  v_is_remove boolean := false;
BEGIN
  NEW.viewing_history := public.normalize_viewing_history(NEW.viewing_history);

  IF TG_OP = 'UPDATE' THEN
    -- The stored history as it really is. A row from before the repair carries
    -- no identities, so nothing about it can be read as a loss.
    v_old := CASE WHEN jsonb_typeof(OLD.viewing_history) = 'array' THEN OLD.viewing_history ELSE '[]'::jsonb END;
    SELECT array_agg(x->>'viewingId') INTO v_old_ids
      FROM jsonb_array_elements(v_old) x
     WHERE jsonb_typeof(x) = 'object' AND x ? 'viewingId';

    v_moved := NEW.viewing_id <> OLD.viewing_id;

    IF v_moved THEN
      v_is_add := jsonb_array_length(NEW.viewing_history) = jsonb_array_length(v_old) + 1
              AND NEW.viewing_history->0->>'viewingId' = OLD.viewing_id::text
              AND (NEW.viewing_history - 0) = v_old;

      v_is_remove := jsonb_array_length(v_old) > 0
              AND NEW.viewing_id::text = v_old->0->>'viewingId'
              AND NEW.viewing_history = (v_old - 0);

      IF NOT (v_is_add OR v_is_remove) THEN
        RAISE EXCEPTION 'A log moves to another viewing by adding one or removing one.'
          USING ERRCODE = 'P0001', HINT = 'Use log_viewing_add or log_viewing_remove.';
      END IF;
    END IF;

    -- Outside a removal, no past viewing may be lost.
    IF NOT v_is_remove AND v_old_ids IS NOT NULL THEN
      SELECT array_agg(x->>'viewingId') INTO v_new_ids FROM jsonb_array_elements(NEW.viewing_history) x;
      IF NOT (v_old_ids <@ COALESCE(v_new_ids, '{}'::text[])) THEN
        RAISE EXCEPTION 'A past viewing can only be removed by removing it.'
          USING ERRCODE = 'P0001', HINT = 'Use log_viewing_remove.';
      END IF;
    END IF;
  END IF;

  -- The count is the history's, never a client's arithmetic.
  NEW.view_count := jsonb_array_length(NEW.viewing_history) + 1;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.logs_keep_viewings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.logs_keep_viewings() FROM anon;

DROP TRIGGER IF EXISTS a_keep_viewings ON public.logs;
CREATE TRIGGER a_keep_viewings BEFORE INSERT OR UPDATE ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.logs_keep_viewings();


-- ── 5 · repair every history, once ─────────────────────────────────────────
-- Assigning the column to itself runs the trigger above on every row. The
-- updated_at trigger is held for the duration: repairing a history is not the
-- member editing their log, and nothing should read it as one.
ALTER TABLE public.logs DISABLE TRIGGER set_logs_updated_at;
UPDATE public.logs SET viewing_history = viewing_history;
ALTER TABLE public.logs ENABLE TRIGGER set_logs_updated_at;


-- ── 6 · a note belongs to a viewing ────────────────────────────────────────
ALTER TABLE public.log_private_notes ADD COLUMN IF NOT EXISTS viewing_id uuid;
UPDATE public.log_private_notes n
   SET viewing_id = l.viewing_id
  FROM public.logs l
 WHERE l.id = n.log_id AND n.viewing_id IS NULL;
ALTER TABLE public.log_private_notes ALTER COLUMN viewing_id SET NOT NULL;
ALTER TABLE public.log_private_notes DROP CONSTRAINT IF EXISTS log_private_notes_pkey;
ALTER TABLE public.log_private_notes ADD CONSTRAINT log_private_notes_pkey PRIMARY KEY (viewing_id);
CREATE INDEX IF NOT EXISTS log_private_notes_log_idx ON public.log_private_notes (log_id);

CREATE OR REPLACE FUNCTION public.lpn_belongs_to_its_viewing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_owner   uuid;
  v_current uuid;
  v_history jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.viewing_id <> OLD.viewing_id OR NEW.log_id <> OLD.log_id OR NEW.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'A note stays with the viewing it was written about.' USING ERRCODE = '23514';
  END IF;

  SELECT user_id, viewing_id, viewing_history INTO v_owner, v_current, v_history
    FROM public.logs WHERE id = NEW.log_id;

  IF v_owner IS NULL OR v_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'That note has no log of its writer to belong to.' USING ERRCODE = '23503';
  END IF;
  IF NEW.viewing_id <> v_current
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_history) x WHERE x->>'viewingId' = NEW.viewing_id::text) THEN
    RAISE EXCEPTION 'That note has no viewing to belong to.' USING ERRCODE = '23503';
  END IF;

  NEW.notes := btrim(NEW.notes);
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.lpn_belongs_to_its_viewing() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lpn_belongs_to_its_viewing() FROM anon;

DROP TRIGGER IF EXISTS a_lpn_belongs_to_its_viewing ON public.log_private_notes;
CREATE TRIGGER a_lpn_belongs_to_its_viewing BEFORE INSERT OR UPDATE ON public.log_private_notes
  FOR EACH ROW EXECUTE FUNCTION public.lpn_belongs_to_its_viewing();

-- Owner-only, and for signed-in members only. `{public}` includes anon; these
-- were safe only because auth.uid() is null for an anonymous caller.
ALTER POLICY lpn_select ON public.log_private_notes TO authenticated;
ALTER POLICY lpn_insert ON public.log_private_notes TO authenticated;
ALTER POLICY lpn_update ON public.log_private_notes TO authenticated;
ALTER POLICY lpn_delete ON public.log_private_notes TO authenticated;


-- ── 7 · the old build's path: notes on the log column ──────────────────────
-- This path WRITES only. It cannot delete, and that is deliberate: the column
-- is always read back blank, so an old build sends a blank note on EVERY save
-- of that log — an ordinary edit of the rating looks exactly like a member
-- clearing their note. Deleting on a blank would throw away writing nobody
-- asked to lose. Clearing is its own act: viewing_note_set with an empty note,
-- or viewing_note_remove. Both are open to every member, paying or not.
CREATE OR REPLACE FUNCTION public.divert_private_notes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v text := NULLIF(btrim(NEW.private_notes), '');
BEGIN
  IF v IS NOT NULL AND public.has_tier_at_least(1) THEN
    INSERT INTO public.log_private_notes (log_id, viewing_id, user_id, notes, updated_at)
    VALUES (NEW.id, NEW.viewing_id, NEW.user_id, left(v, 1000), now())
    ON CONFLICT (viewing_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now();
  END IF;
  -- Below the rank a note is discarded, not refused: refusing would fail the
  -- whole log write and wedge an offline queue that cannot re-gate it.
  UPDATE public.logs SET private_notes = NULL WHERE id = NEW.id;
  RETURN NULL;
END $$;


-- ── 8 · a removed viewing takes its note with it ───────────────────────────
CREATE OR REPLACE FUNCTION public.logs_forget_removed_viewing_notes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  DELETE FROM public.log_private_notes n
   WHERE n.log_id = NEW.id
     AND n.viewing_id <> NEW.viewing_id
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.viewing_history) x
                      WHERE x->>'viewingId' = n.viewing_id::text);
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.logs_forget_removed_viewing_notes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.logs_forget_removed_viewing_notes() FROM anon;

DROP TRIGGER IF EXISTS logs_forget_removed_viewing_notes ON public.logs;
CREATE TRIGGER logs_forget_removed_viewing_notes AFTER UPDATE OF viewing_id, viewing_history ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.logs_forget_removed_viewing_notes();


-- ── 9 · the operations the launch apps use ─────────────────────────────────

-- The SET list both operations write, built once from the declaration in 3b, so
-- a column added to logs and named there is carried by both without either
-- function being edited. The columns are the declaration's own — never a
-- caller's — and each is written from the prepared row, not from text.
CREATE OR REPLACE FUNCTION public.viewing_set_list()
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT string_agg(format('%I = ($4::public.logs).%I', col, col), ', ' ORDER BY col)
    FROM jsonb_object_keys(public.viewing_fields()->'archived') AS col;
$$;
REVOKE ALL ON FUNCTION public.viewing_set_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewing_set_list() TO authenticated, service_role;

-- Add a viewing: the current one moves into history — with its identity, never
-- its note — and the log becomes the new viewing. `p_viewing_id` is chosen by
-- the app, so a retried call finds it already there and does nothing twice.
-- A field absent from `p_fields` is left as it was. `p_fields` is keyed by
-- COLUMN name, and only the columns a viewing is made of are ever read from it.
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

  EXECUTE format('UPDATE public.logs SET viewing_id = $1, viewing_history = $2, %s WHERE id = $3',
                 public.viewing_set_list())
    USING p_viewing_id,
          jsonb_build_array(v_entry) || COALESCE(l.viewing_history, '[]'::jsonb),
          p_log_id,
          r;

  RETURN p_viewing_id;
END $$;

-- Remove the latest viewing: the one before it becomes current again, with its
-- own identity, and the removed viewing's note goes with it (section 8). Asked
-- to remove a viewing that is no longer current — already removed — it does
-- nothing. The only viewing of a log is removed by deleting the log.
CREATE OR REPLACE FUNCTION public.log_viewing_remove(p_log_id uuid, p_viewing_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  l public.logs%ROWTYPE;
  r public.logs%ROWTYPE;
  a jsonb := public.viewing_fields()->'archived';
  e jsonb;
  v_payload jsonb := '{}'::jsonb;
  v_col  text;
  v_map  jsonb;
  v_val  jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO l FROM public.logs WHERE id = p_log_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF l.viewing_id <> p_viewing_id THEN
    RETURN l.viewing_id;
  END IF;
  IF jsonb_array_length(l.viewing_history) = 0 THEN
    RAISE EXCEPTION 'The only viewing of a log is removed by deleting the log.'
      USING ERRCODE = 'P0001', HINT = 'Delete the log instead.';
  END IF;

  e := l.viewing_history->0;

  -- Read the viewing back field by field. Histories written by older builds
  -- hold whatever those builds wrote, so a value that is not the kind its
  -- column takes is replaced by the declared fallback rather than failing a
  -- member's removal.
  FOR v_col, v_map IN SELECT key, value FROM jsonb_each(a) LOOP
    v_val := COALESCE(e->(v_map->>'key'), v_map->'fallback');
    -- Ask the COLUMN itself whether it can take this value, by trying it.
    -- Asking by type NAME cannot be done here: pg_input_is_valid keeps the type
    -- of its first call at a given place in the code and answers about THAT
    -- type ever after — so a loop over columns of different types gets nonsense.
    BEGIN
      PERFORM jsonb_populate_record(NULL::public.logs, jsonb_build_object(v_col, v_val));
    EXCEPTION WHEN others THEN
      v_val := v_map->'fallback';
    END;
    v_payload := v_payload || jsonb_build_object(v_col, v_val);
  END LOOP;

  -- Every viewing has a date. One that never recorded its own keeps the log's.
  IF v_payload->'watched_date' IS NULL OR jsonb_typeof(v_payload->'watched_date') = 'null' THEN
    v_payload := v_payload || jsonb_build_object('watched_date', to_jsonb(l.watched_date));
  END IF;

  r := jsonb_populate_record(NULL::public.logs, v_payload);
  -- Older builds wrote "None" for no disc and "" for nobody; both mean nothing.
  IF r.physical_media IN ('None', '') THEN r.physical_media := NULL; END IF;
  IF r.watched_with = ''              THEN r.watched_with   := NULL; END IF;

  EXECUTE format('UPDATE public.logs SET viewing_id = $1, viewing_history = $2, %s WHERE id = $3',
                 public.viewing_set_list())
    USING (e->>'viewingId')::uuid, l.viewing_history - 0, p_log_id, r;

  RETURN (e->>'viewingId')::uuid;
END $$;

-- Write a note on a viewing. An empty note CLEARS it, and clearing is open to
-- every member. Writing and changing meet tr_tier_gate_private_notes(_update),
-- which refuse below the Archivist rank with "The Vault is an Archivist feature".
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
END $$;

-- Remove a note. Open to every member; removing one that is already gone does nothing.
CREATE OR REPLACE FUNCTION public.viewing_note_remove(p_viewing_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.log_private_notes WHERE viewing_id = p_viewing_id AND user_id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.log_viewing_add(uuid, uuid, jsonb)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_viewing_remove(uuid, uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.viewing_note_set(uuid, uuid, text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.viewing_note_remove(uuid)               FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_viewing_add(uuid, uuid, jsonb)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_viewing_remove(uuid, uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.viewing_note_set(uuid, uuid, text)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.viewing_note_remove(uuid)            TO authenticated, service_role;


-- ── Verify (run after) ─────────────────────────────────────────────────────
--   SELECT count(*) FROM public.logs WHERE jsonb_typeof(viewing_history) <> 'array';            -- 0
--   SELECT count(*) FROM public.logs WHERE view_count <> jsonb_array_length(viewing_history)+1; -- 0
--   SELECT count(*) FROM public.logs l, jsonb_array_elements(l.viewing_history) e
--    WHERE jsonb_typeof(e) <> 'object' OR NOT e ? 'viewingId' OR e ? 'privateNotes';          -- 0
--   SELECT count(*) FROM public.logs WHERE private_notes IS NOT NULL;                          -- 0
--   SELECT * FROM public.get_featured_critique();                                              -- still loads
