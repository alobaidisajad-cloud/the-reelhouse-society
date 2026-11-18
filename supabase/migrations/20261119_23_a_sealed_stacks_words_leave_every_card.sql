-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_23 — a sealed stack's words leave every card, a caption the website wrote with them.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A card the website made carries the stack's title and curator in its caption too: sealing takes the
--      caption off its cards and their replies' quotes, opening writes them back, and the cards of stacks
--      already sealed lose theirs once, here (review round 13).
--   The trigger's function only (20261119_21's trigger calls it), and a one-time pass over the cards; no
--   table is locked whole.
-- Undo: mobile/supabase/migrations-down/20261119_23_a_sealed_stacks_words_leave_every_card.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B7 · a sealed stack's words leave every card, the website's caption with them (review round 13) ──
--   B3 took a sealed stack's title, count, curator and posters off its cards' metadata. A card the
--   website made carries the stack's words twice: in its metadata, and in the message's own words,
--   which the website writes as the card's caption ("Noir · 12 films · by @ana"). Sealed, the website's
--   card still showed the stack's title and curator in the salon, in every reader, and in each reply
--   that quotes it. Now sealing a stack also takes a caption off its cards, and the quotes of it off
--   their replies; opening it again writes the caption back as the website writes it, from the stack
--   as it stands then, and the quotes with it. The card keeps that it had a caption ({caption: true})
--   while sealed, so it is written back only where it was. A card made on the phone carries no
--   caption: its words are its sharer's own message, never the stack's, and stay.
--   A caption is told by its form, as the website writes it: the stack's title, alone or followed by
--   " · "; or, for a card whose title is gone already (sealed by B3 before this), the website's
--   ending " · <n> films · by @<handle>".
--   The cards of stacks already sealed have their captions taken once, here.
--   a_sealed_stack_takes_its_cards is as B3 made it but for the caption and its quotes.

-- add-only (1): no shipped client uses it: a trigger's function round 13 makes (B3), called by no client (TestFlight build 41 and the website checked)
CREATE OR REPLACE FUNCTION public.a_sealed_stack_takes_its_cards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_cards   uuid[];
  v_caption text;
BEGIN
  IF coalesce(NEW.is_private, false) = coalesce(OLD.is_private, false) THEN
    RETURN NULL;
  END IF;
  -- The house's own write, so a_keeps_what_it_is lets it (the sharer's message is not the curator's).
  -- Asked as containment, so the cards' own index (lounge_messages_card_names) finds them; a card
  -- already gone stays gone.
  IF coalesce(NEW.is_private, false) THEN
    -- Sealed: each card says only which stack; a caption the website wrote goes, marked so it comes back.
    WITH turned AS (
      UPDATE public.lounge_messages m
         SET metadata = jsonb_build_object('listId', NEW.id::text, 'sealed', true)
                        || CASE WHEN m.content <> '' AND (
                                  (m.metadata ? 'title' AND (m.content = m.metadata ->> 'title'
                                     OR left(m.content, char_length(m.metadata ->> 'title') + 3) = (m.metadata ->> 'title') || ' · '))
                                  OR m.content ~ ' · [0-9]+ films · by @[^ ]+$')
                                THEN '{"caption": true}'::jsonb ELSE '{}'::jsonb END,
             content = CASE WHEN m.content <> '' AND (
                                  (m.metadata ? 'title' AND (m.content = m.metadata ->> 'title'
                                     OR left(m.content, char_length(m.metadata ->> 'title') + 3) = (m.metadata ->> 'title') || ' · '))
                                  OR m.content ~ ' · [0-9]+ films · by @[^ ]+$')
                            THEN '' ELSE m.content END
       WHERE m.type = 'list_share'
         AND m.metadata <> '{}'::jsonb
         AND m.metadata @> jsonb_build_object('listId', NEW.id::text)
         AND NOT (m.metadata @> '{"gone": true}'::jsonb)
         AND NOT (m.metadata @> '{"sealed": true}'::jsonb)
      RETURNING m.id, m.metadata
    )
    SELECT array_agg(id) INTO v_cards FROM turned WHERE metadata @> '{"caption": true}'::jsonb;
    -- The replies that quote a caption taken: the quote goes with it, as a withdrawn message's does.
    IF v_cards IS NOT NULL THEN
      UPDATE public.lounge_messages r SET reply_to_content = NULL
       WHERE r.reply_to_id = ANY (v_cards) AND r.reply_to_content IS NOT NULL;
    END IF;
  ELSE
    -- Opened again: each sealed card made again from the stack as it stands now, as the phone makes
    -- one (its title, its count of reels, its curator, its first four posters in the stack's order),
    -- and a caption written back where there was one, as the website writes it.
    v_caption := NEW.title || ' · ' || (SELECT count(*) FROM public.list_items i WHERE i.list_id = NEW.id) || ' films'
                 || coalesce(' · by @' || (SELECT p.username FROM public.profiles p WHERE p.id = NEW.user_id), '');
    WITH turned AS (
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
                                                LIMIT 4) x), '[]'::jsonb)),
             content = CASE WHEN m.metadata @> '{"caption": true}'::jsonb THEN v_caption ELSE m.content END
       WHERE m.type = 'list_share'
         AND m.metadata <> '{}'::jsonb
         AND m.metadata @> jsonb_build_object('listId', NEW.id::text, 'sealed', true)
      RETURNING m.id, m.content, m.deleted_at
    )
    SELECT array_agg(id) INTO v_cards FROM turned WHERE content = v_caption AND deleted_at IS NULL;
    -- The replies that quoted the caption have it back.
    IF v_cards IS NOT NULL THEN
      UPDATE public.lounge_messages r SET reply_to_content = v_caption
       WHERE r.reply_to_id = ANY (v_cards) AND r.reply_to_content IS NULL;
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- The captions of cards of stacks sealed before today, and their quotes, taken once, as the house
-- would have taken them. Read from the sealed stacks, each finding its cards by the cards' own index.
CREATE TEMP TABLE b7_captions ON COMMIT DROP AS
WITH turned AS (
  UPDATE public.lounge_messages m
     SET metadata = jsonb_build_object('listId', l.id::text, 'sealed', true, 'caption', true),
         content = ''
    FROM public.lists l
   WHERE l.is_private
     AND m.type = 'list_share'
     AND m.metadata <> '{}'::jsonb
     AND m.metadata @> jsonb_build_object('listId', l.id::text)
     AND NOT (m.metadata @> '{"gone": true}'::jsonb)
     AND m.content <> ''
     AND (m.content = l.title
          OR left(m.content, char_length(l.title) + 3) = l.title || ' · '
          OR (m.metadata ? 'title' AND (m.content = m.metadata ->> 'title'
              OR left(m.content, char_length(m.metadata ->> 'title') + 3) = (m.metadata ->> 'title') || ' · '))
          OR m.content ~ ' · [0-9]+ films · by @[^ ]+$')
  RETURNING m.id
)
SELECT id FROM turned;
UPDATE public.lounge_messages r SET reply_to_content = NULL
  FROM b7_captions c
 WHERE r.reply_to_id = c.id AND r.reply_to_content IS NOT NULL;
