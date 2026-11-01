-- ════════════════════════════════════════════════════════════════════════════
-- 20261101_01 — an edit never reverts a change made since it was read.
-- ════════════════════════════════════════════════════════════════════════════
--   A member's edit of a stack is sent whole: its details and exactly its films
--   (save_stack). Queued on a phone and sent days later, it replaced a stack
--   another device had changed since, and a film added there was gone (SYN-28,
--   WORKLIST P4.32). Two things make the stale edit refusable:
--   1. a stack's updated_at moves when its films do (a film added, moved or
--      taken out), not only when its own row changes;
--   2. save_stack takes the stack's updated_at as the phone last read it
--      (p_read_at); an edit of a stack changed since is refused with PT412
--      (HTTP 412, Precondition Failed), and the app gives it back to the member.
--   An older call, with no p_read_at, saves as before.
-- Undo: mobile/supabase/migrations-down/20261101_01_an_edit_keeps_what_changed_since.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── 1. A stack changes when its films do ────────────────────────────────────
CREATE FUNCTION public.list_items_touch_the_stack() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- A silenced or suspended member may still take out what is theirs, and may edit nothing: no edit
  -- of theirs can follow to need the stack's time, and touching the stack would be refused as their
  -- write (enforce_not_restricted, tr_ban_gate_update), taking the withdrawal down with it.
  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id = auth.uid() AND (is_banned OR suspended_until > now())) THEN
    RETURN NULL;
  END IF;
  -- The stack's own time, set by set_lists_updated_at to the house's now().
  UPDATE public.lists SET updated_at = now()
   WHERE id IN (SELECT DISTINCT list_id FROM changed);
  RETURN NULL;
END $$;

-- add-only (1): no shipped client uses it: a trigger's function this migration makes, named by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.list_items_touch_the_stack() FROM PUBLIC, anon, authenticated;

-- add-only (3): it only widens: a stack's updated_at also moves when its films change; build 41's and the website's stack writes replayed in the old clients' run (e2e-old-clients), each landing as before
CREATE TRIGGER a_film_added_touches_the_stack AFTER INSERT ON public.list_items
    REFERENCING NEW TABLE AS changed
    FOR EACH STATEMENT EXECUTE FUNCTION public.list_items_touch_the_stack();

-- add-only (3): it only widens: a stack's updated_at also moves when its films change; build 41's and the website's stack writes replayed in the old clients' run (e2e-old-clients), each landing as before
CREATE TRIGGER a_film_moved_touches_the_stack AFTER UPDATE ON public.list_items
    REFERENCING NEW TABLE AS changed
    FOR EACH STATEMENT EXECUTE FUNCTION public.list_items_touch_the_stack();

-- add-only (3): it only widens: a stack's updated_at also moves when its films change; build 41's and the website's stack writes replayed in the old clients' run (e2e-old-clients), each landing as before
CREATE TRIGGER a_film_taken_out_touches_the_stack AFTER DELETE ON public.list_items
    REFERENCING OLD TABLE AS changed
    FOR EACH STATEMENT EXECUTE FUNCTION public.list_items_touch_the_stack();

-- ── 2. save_stack refuses an edit older than the stack ──────────────────────
-- One more argument, at its default: a function's arguments are its name, so the old one goes and
-- the new one takes every call it took. Every caller names its arguments (the app, build 41, the
-- website), so each older call resolves to it unchanged.
-- add-only (3): it only widens: the same function with p_read_at at its default; build 41's and the website's save_stack calls replayed in the old clients' run (e2e-old-clients), each landing as before
DROP FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean);

CREATE FUNCTION public.save_stack(p_id uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_is_private boolean DEFAULT NULL::boolean, p_is_ranked boolean DEFAULT NULL::boolean, p_films jsonb DEFAULT NULL::jsonb, p_create boolean DEFAULT false, p_read_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS public.lists
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.lists;
  v_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- An edit of a stack changed since the phone read it is refused, never laid over the change.
  IF NOT p_create AND p_read_at IS NOT NULL THEN
    SELECT updated_at INTO v_at FROM public.lists WHERE id = p_id AND user_id = v_uid FOR UPDATE;
    IF FOUND AND v_at > p_read_at THEN
      RAISE EXCEPTION 'This stack was changed after this phone read it.' USING ERRCODE = 'PT412';
    END IF;
  END IF;

  IF p_create THEN
    INSERT INTO public.lists (id, user_id, title, description, is_private, is_ranked)
    VALUES (p_id, v_uid, COALESCE(p_title, ''), COALESCE(p_description, ''),
            COALESCE(p_is_private, false), COALESCE(p_is_ranked, false))
    ON CONFLICT (id) DO NOTHING;
  ELSE
    UPDATE public.lists
       SET title       = COALESCE(p_title, title),
           description = COALESCE(p_description, description),
           is_private  = COALESCE(p_is_private, is_private),
           is_ranked   = COALESCE(p_is_ranked, is_ranked)
     WHERE id = p_id AND user_id = v_uid;
  END IF;

  SELECT * INTO v_row FROM public.lists WHERE id = p_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such stack of yours' USING ERRCODE = 'P0002';
  END IF;

  IF p_films IS NOT NULL THEN
    -- Exactly these films, in this order.
    INSERT INTO public.list_items (list_id, film_id, film_title, poster_path, rank_position)
    SELECT p_id, (f->>'film_id')::int, COALESCE(f->>'film_title', 'Unknown'), f->>'poster_path', (f->>'rank_position')::int
      FROM jsonb_array_elements(p_films) AS f
    ON CONFLICT (list_id, film_id) DO UPDATE
       SET film_title = EXCLUDED.film_title,
           poster_path = EXCLUDED.poster_path,
           rank_position = EXCLUDED.rank_position;

    DELETE FROM public.list_items
     WHERE list_id = p_id
       AND film_id NOT IN (SELECT (f->>'film_id')::int FROM jsonb_array_elements(p_films) AS f);
  END IF;

  -- Read again: the films' triggers have moved its time, which the phone keeps for its next edit.
  SELECT * INTO v_row FROM public.lists WHERE id = p_id AND user_id = v_uid;
  RETURN v_row;
END;
$$;

-- add-only (3): it only widens: the grants the old save_stack had, on the new one; build 41's and the website's save_stack calls replayed in the old clients' run (e2e-old-clients), each landing as before
REVOKE ALL ON FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean, timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean, timestamp with time zone) TO service_role;
