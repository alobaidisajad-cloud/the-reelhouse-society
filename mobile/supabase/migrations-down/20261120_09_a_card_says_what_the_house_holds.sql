-- Undo of 20261120_09: a card in a salon says what the house holds, never what its sharer wrote, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A4 undone · the card's functions go (the trigger goes first, in H-A4.locks.down), and round 11's and
-- round 13's functions are as they made them ──
--   The one-time pass (H-A4.pass) is undone in its own car, before this one: its function goes; what it
--   wrote on each card stays, as it is only what the house holds of its piece.
CREATE OR REPLACE FUNCTION public.a_filings_shared_line(p_kind text, p_title text, p_body text, p_spoiler text, p_film text) RETURNS text
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

CREATE OR REPLACE FUNCTION public.a_spoiler_take_veils_its_cards() RETURNS trigger
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

CREATE OR REPLACE FUNCTION public.dispatch_empty_filing(p_post uuid, p_by text) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH ended AS (
    UPDATE public.dispatch_posts
       SET body = '', full_content = NULL, title = NULL,
           subject_image = NULL, subject_backdrop = NULL,
           source = NULL, source_url = NULL, spoiler_label = NULL,
           ended_at = now(), ended_by = p_by
     WHERE id = p_post AND ended_at IS NULL
    RETURNING id
  )
  UPDATE public.lounge_messages m
     SET film_title = NULL, film_poster = NULL,
         metadata = (m.metadata - 'author_username') || jsonb_build_object('gone', true)
    FROM ended
   WHERE m.type = 'dossier_share'
     AND m.metadata <> '{}'::jsonb
     AND m.metadata @> jsonb_build_object('dossier_id', ended.id::text);
$$;

DROP FUNCTION IF EXISTS public.a_shared_card_is_the_houses();
DROP FUNCTION IF EXISTS private.a_shared_card(public.lounge_messages, boolean);
DROP FUNCTION IF EXISTS private.a_filings_line(text, text, text, text, text);
DROP FUNCTION IF EXISTS private.a_card_cut(text);
DROP FUNCTION IF EXISTS private.a_card_title(text, text, text);
-- The schema goes when nothing else is in it (H-A5 keeps it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_namespace n ON n.oid = d.refobjid
                  WHERE d.refclassid = 'pg_namespace'::regclass AND n.nspname = 'private') THEN
    DROP SCHEMA IF EXISTS private;
  END IF;
END $$;
