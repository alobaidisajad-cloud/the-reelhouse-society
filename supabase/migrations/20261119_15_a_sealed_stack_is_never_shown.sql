-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_15 — a sealed stack is never shown in a salon.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A sealed stack could be shared into a salon, and sealing one left its cards with its title,
--      count and curator: a sealed stack's card is refused, sealing turns its cards sealed, opening puts
--      them back, and the cards of stacks already sealed are turned once, here (review round 13).
--   The trigger functions and the one-time turn; the triggers are the car 20261119_21, alone.
-- Undo: mobile/supabase/migrations-down/20261119_15_a_sealed_stack_is_never_shown.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B3 · a sealed stack is never shown in a salon (review round 13) ──
--   A curator could share a SEALED (private) stack into a salon, and a stack shared while open and
--   sealed afterwards kept its card: every member of the salon read its title, its count of reels
--   and its curator's name, and each tap on the card opened CLASSIFIED. The card carries those words
--   in the message itself, and nothing at the house read whether the stack was sealed: only a stack
--   deleted took its cards down (a_deleted_stack_leaves_its_cards, round 11). Now:
--   1. a stack's card is refused while the stack is sealed (a_sealed_stack_is_not_shared, before a
--      message is written): 'STACK_SEALED' (42501); a card of a stack no longer in the house is
--      refused as 'STACK_GONE' (P0002), as a critique of one is. A card that names no stack at all is
--      let through as before: it shows nothing;
--   2. sealing a stack turns every card of it into a sealed one, its title, count, curator and
--      posters taken off ({listId, sealed: true}: the salon reads "sealed"); opening it again puts
--      each card back, made again from the stack as it stands then (a_sealed_stack_takes_its_cards);
--   3. the cards of stacks already sealed are turned once, here.
--   The triggers are B3.locks (a car after this one): a stack sealed in the seconds between the two
--   cars keeps its cards until it is sealed again, as every card did before. A phone from before
--   reads a sealed card as a stack card with no title (no card is drawn for it), as it reads a gone
--   one's metadata it does not know.

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_sealed_stack_is_not_shared();
CREATE FUNCTION public.a_sealed_stack_is_not_shared() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_named   text := NEW.metadata ->> 'listId';
  v_private boolean;
BEGIN
  -- A card that names no stack shows none: nothing to keep.
  IF NEW.type IS DISTINCT FROM 'list_share' OR v_named IS NULL THEN
    RETURN NEW;
  END IF;
  -- Read as the house, whoever shares: the sharer may not be the curator, and a sealed stack is
  -- refused to every sharer, its curator included.
  SELECT coalesce(l.is_private, false) INTO v_private
    FROM public.lists l
   WHERE v_named ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND l.id = v_named::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STACK_GONE' USING ERRCODE = 'P0002';
  END IF;
  IF v_private THEN
    RAISE EXCEPTION 'STACK_SEALED' USING ERRCODE = '42501',
      HINT = 'A sealed stack is read by its curator alone; it cannot be shown in a salon.';
  END IF;
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the website never call it
REVOKE ALL ON FUNCTION public.a_sealed_stack_is_not_shared() FROM PUBLIC, anon, authenticated;

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_sealed_stack_takes_its_cards();
CREATE FUNCTION public.a_sealed_stack_takes_its_cards() RETURNS trigger
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
-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the website never call it
REVOKE ALL ON FUNCTION public.a_sealed_stack_takes_its_cards() FROM PUBLIC, anon, authenticated;

-- The cards of stacks sealed before today, turned once, as the house would have turned them. Read
-- from the sealed stacks, each finding its cards by the cards' own index.
UPDATE public.lounge_messages m
   SET metadata = jsonb_build_object('listId', l.id::text, 'sealed', true)
  FROM public.lists l
 WHERE l.is_private
   AND m.type = 'list_share'
   AND m.metadata <> '{}'::jsonb
   AND m.metadata @> jsonb_build_object('listId', l.id::text)
   AND NOT (m.metadata @> '{"gone": true}'::jsonb)
   AND NOT (m.metadata @> '{"sealed": true}'::jsonb);
