-- Undo of 20261101_01_an_edit_keeps_what_changed_since.sql: production's schema as it was before it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP TRIGGER a_film_added_touches_the_stack ON public.list_items;
DROP TRIGGER a_film_moved_touches_the_stack ON public.list_items;
DROP TRIGGER a_film_taken_out_touches_the_stack ON public.list_items;
DROP FUNCTION public.list_items_touch_the_stack();

DROP FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean, timestamp with time zone);

-- save_stack as it was.
CREATE FUNCTION public.save_stack(p_id uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_is_private boolean DEFAULT NULL::boolean, p_is_ranked boolean DEFAULT NULL::boolean, p_films jsonb DEFAULT NULL::jsonb, p_create boolean DEFAULT false) RETURNS public.lists
    LANGUAGE plpgsql
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
GRANT ALL ON FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.save_stack(uuid, text, text, boolean, boolean, jsonb, boolean) TO service_role;
