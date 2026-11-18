-- ════════════════════════════════════════════════════════════════════════════
-- 20261119_16 — a take marked SPOILERS keeps its words off its cards in the salons.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A take shared into a salon, or amended to SPOILERS after, kept its words in its card's title: the
--      house titles each card of a filing marked SPOILERS by the share's rule ("<KIND> on <film> ·
--      SPOILERS"), and titles it again from the filing when the mark is taken off; the cards of filings
--      marked now are titled once, here (review round 13).
--   The functions and the one-time pass; the trigger is the car 20261119_22, alone.
-- Undo: mobile/supabase/migrations-down/20261119_16_a_spoiler_take_veils_its_cards.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── B9 · a take marked SPOILERS keeps its words off its cards in the salons (review round 13) ──
--   The phone no longer sends a spoiler-marked take's words in a share (round 13, sharedWords): its
--   card in a salon is titled "<KIND> on <film> · SPOILERS". But a card shares its title in the
--   message itself (lounge_messages.film_title), so a take shared before this round, or shared and
--   then amended to SPOILERS, kept its words on its card: every member of the salon read what the
--   take's own page veils. Now, as B3 and B7 do for a sealed stack, the house writes the card's title
--   by the same rule as the phone:
--   1. a_spoiler_take_veils_its_cards (its trigger is B9.locks): a filing marked SPOILERS has each of
--      its cards titled "<KIND> on <film> · SPOILERS" ("<KIND> · SPOILERS" with no film); the mark taken
--      off, each card is titled again from the filing as it stands (its headline, or its words, cut
--      to the column's 300 characters, as the phone cuts them). A filing with a headline (an essay)
--      is titled by its headline either way: the headline is never veiled. A card already gone stays.
--   2. the cards of filings marked SPOILERS now are titled once, here.
--   The kinds are named as the phone names them (KIND_NAME): TAKE, SEEKING, WIRE, BALLOT, ESSAY.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again; asked by the house's own trigger and one-time statement alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_filings_shared_line(text, text, text, text, text);
CREATE FUNCTION public.a_filings_shared_line(p_kind text, p_title text, p_body text, p_spoiler text, p_film text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- As the phone's filingShareLine and cardTitle: the headline; else the words unless they are marked
  -- as a spoiler (cut to 300 characters); else the kind, its film, and that it holds spoilers.
  SELECT CASE
    WHEN nullif(btrim(coalesce(p_title, '')), '') IS NOT NULL THEN left(btrim(p_title), 300)
    WHEN p_spoiler IS NULL AND nullif(btrim(coalesce(p_body, '')), '') IS NOT NULL
      THEN CASE WHEN char_length(btrim(p_body)) <= 300 THEN btrim(p_body) ELSE left(btrim(p_body), 299) || '…' END
    ELSE CASE lower(p_kind) WHEN 'take' THEN 'TAKE' WHEN 'seeking' THEN 'SEEKING' WHEN 'wire' THEN 'WIRE'
                            WHEN 'ballot' THEN 'BALLOT' WHEN 'dossier' THEN 'ESSAY' ELSE upper(p_kind) END
         || coalesce(' on ' || nullif(btrim(coalesce(p_film, '')), ''), '')
         || CASE WHEN p_spoiler IS NOT NULL THEN ' · SPOILERS' ELSE '' END
  END
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.a_filings_shared_line(text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_spoiler_take_veils_its_cards();
CREATE FUNCTION public.a_spoiler_take_veils_its_cards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- The house's own write, so a_keeps_what_it_is lets it (the sharer's message is not the author's).
  -- Asked as containment, so the cards' own index (lounge_messages_card_names) finds them; a card
  -- already gone stays gone.
  UPDATE public.lounge_messages m
     SET film_title = public.a_filings_shared_line(NEW.kind, NEW.title, NEW.body, NEW.spoiler_label,
                        CASE WHEN NEW.subject_kind = 'film' THEN NEW.subject_title END)
   WHERE m.type = 'dossier_share'
     AND m.metadata <> '{}'::jsonb
     AND m.metadata @> jsonb_build_object('dossier_id', NEW.id::text)
     AND NOT (m.metadata @> '{"gone": true}'::jsonb);
  RETURN NULL;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the website never call it
REVOKE ALL ON FUNCTION public.a_spoiler_take_veils_its_cards() FROM PUBLIC, anon, authenticated;

-- The cards of filings marked SPOILERS today, titled once by the rule, as the house would have.
-- Read from the marked filings, each finding its cards by the cards' own index.
UPDATE public.lounge_messages m
   SET film_title = public.a_filings_shared_line(p.kind, p.title, p.body, p.spoiler_label,
                      CASE WHEN p.subject_kind = 'film' THEN p.subject_title END)
  FROM public.dispatch_posts p
 WHERE p.spoiler_label IS NOT NULL
   AND p.ended_at IS NULL
   AND m.type = 'dossier_share'
   AND m.metadata <> '{}'::jsonb
   AND m.metadata @> jsonb_build_object('dossier_id', p.id::text)
   AND NOT (m.metadata @> '{"gone": true}'::jsonb)
   AND m.film_title IS DISTINCT FROM public.a_filings_shared_line(p.kind, p.title, p.body, p.spoiler_label,
                      CASE WHEN p.subject_kind = 'film' THEN p.subject_title END);
