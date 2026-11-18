-- Undo of 20261119_23: a sealed stack's words leave every card, a caption the website wrote with them, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B7 undone · sealing a stack leaves the website's caption on its cards (as B3 made it) ──
--   The captions taken stay taken: they were the stack's words, which its curator sealed; an undo that
--   wrote them back would show a sealed stack in a salon again.
-- add-only (1): no shipped client uses it: a trigger's function round 13 makes (B3), called by no client (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.a_sealed_stack_takes_its_cards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF coalesce(NEW.is_private, false) = coalesce(OLD.is_private, false) THEN
    RETURN NULL;
  END IF;
  -- The house's own write, so a_keeps_what_it_is lets it (the sharer's message is not the curator's).
  -- Asked as containment, so the cards' own index (lounge_messages_card_names) finds them; a card
  -- already gone stays gone.
  IF coalesce(NEW.is_private, false) THEN
    UPDATE public.lounge_messages m
       SET metadata = jsonb_build_object('listId', NEW.id::text, 'sealed', true)
     WHERE m.type = 'list_share'
       AND m.metadata <> '{}'::jsonb
       AND m.metadata @> jsonb_build_object('listId', NEW.id::text)
       AND NOT (m.metadata @> '{"gone": true}'::jsonb)
       AND NOT (m.metadata @> '{"sealed": true}'::jsonb);
  ELSE
    -- Opened again: each sealed card made again from the stack as it stands now, as the phone makes
    -- one (its title, its count of reels, its curator, its first four posters in the stack's order).
    UPDATE public.lounge_messages m
       SET metadata = jsonb_build_object(
             'listId', NEW.id::text,
             'title', NEW.title,
             'filmCount', (SELECT count(*) FROM public.list_items i WHERE i.list_id = NEW.id),
             'curator', (SELECT p.username FROM public.profiles p WHERE p.id = NEW.user_id),
             'topPosters', coalesce((SELECT jsonb_agg(x.poster_path ORDER BY x.place)
                                       FROM (SELECT i.poster_path,
                                                    row_number() OVER (ORDER BY i.rank_position NULLS LAST, i.created_at, i.id) AS place
                                               FROM public.list_items i
                                              WHERE i.list_id = NEW.id AND i.poster_path IS NOT NULL
                                              ORDER BY i.rank_position NULLS LAST, i.created_at, i.id
                                              LIMIT 4) x), '[]'::jsonb))
     WHERE m.type = 'list_share'
       AND m.metadata <> '{}'::jsonb
       AND m.metadata @> jsonb_build_object('listId', NEW.id::text, 'sealed', true);
  END IF;
  RETURN NULL;
END $$;
