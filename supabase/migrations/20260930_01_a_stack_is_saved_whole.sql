-- ════════════════════════════════════════════════════════════════════════════
-- 20260930_01 — a stack is saved whole, or not at all
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS THERE ────────────────────────────────────────────────────────
-- The app saved a stack in pieces, each its own request:
--
--   create  the stack row, then its films. If the films were refused, the app
--           deleted the row again — and discarded that delete's error, so a
--           failed rollback left an empty stack the member could not see.
--   edit    the details, then an upsert of the films, then a delete of the
--           ones removed. The removals were worked out from the PHONE's copy
--           of the stack (stale if it was edited elsewhere, partial if the
--           phone held only some of its films), and two of the three deletes
--           ("remove all", and the fallback when the phone had no copy)
--           discarded their errors: the screen showed films gone that the
--           house kept.
--
-- ── WHAT REPLACES IT ──────────────────────────────────────────────────────
-- save_stack: the stack is made exactly what the member saved — its details,
-- and (when given) exactly these films in this order — in ONE transaction. It
-- all happens or none of it does. It runs as the member (SECURITY INVOKER):
-- the same row security, ban gates and ceilings as the direct writes, nothing
-- more. A create replayed from the offline queue after its answer was lost is
-- a no-op, not a duplicate-key failure.
--
--   p_films NULL      the films are not touched (a rename)
--   p_films '[]'      the stack is emptied
--   p_create true     the stack is made (ON CONFLICT (id) DO NOTHING)
--
-- No transaction control here: the rehearsal (diagnostics/
-- stack_save_rehearsal.sql) includes this file inside its own transaction.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_stack(
  p_id uuid,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_private boolean DEFAULT NULL,
  p_is_ranked boolean DEFAULT NULL,
  p_films jsonb DEFAULT NULL,
  p_create boolean DEFAULT false
) RETURNS public.lists
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.lists;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
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

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean) TO authenticated;
