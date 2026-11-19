-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_09 — a card in a salon says what the house holds, never what its sharer wrote.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A seated member could write a card naming another member as its author under any headline:
--      a_shared_card_is_the_houses writes every card from the piece it names, refuses a piece the
--      sharer cannot read or that is gone, and a kind no app sends (review round 14).
--   Functions only (in the private schema of 20261120_02); no table is locked. The trigger is the car
--   20261120_10; the cards already in the salons are made true by 20261120_11, after the trigger.
-- Undo: mobile/supabase/migrations-down/20261120_09_a_card_says_what_the_house_holds.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A4 · a card in a salon says what the house holds, never what its sharer wrote (review round 14) ──
--   A seated member could write a card into a salon that named another member as its author, under
--   any headline: lounge_messages {type: 'dossier_share', film_title: '<any words>', metadata:
--   {author_username: '<victim>', dossier_id: '<a real filing>', kind: 'essay'}}, or a record's card
--   "FILED BY @<victim>", or a stack's "12 REELS · @<victim>". The insert rule asks only for the seat,
--   and the readers draw the card's headline, byline, count and kind from the message itself. A type no
--   app sends drew its own label ("BY_@VICTIM"), and a type of NULL broke the phone's reader. Now the
--   house writes every card from the piece it names, before the message is written
--   (a_shared_card_is_the_houses, its trigger in H-A4.locks; the cards already in the salons are made
--   true by H-A4.pass, after the trigger stands):
--   1. a record's card: its film, title and poster are the record's, its byline the record's owner;
--   2. a filing's card: its byline the filing's author, its kind the filing's, its headline the
--      filing's line by the share's rule, cut where the phone cuts a long one (a_card_cut, the phone's
--      own cardTitle rule): never at a place its sharer chose;
--   3. a stack's card: its title, count of reels, curator and first four posters the stack's, as
--      a_sealed_stack_takes_its_cards makes one when a stack is opened again;
--   4. a film's card: the film's title, poster and year when the house knows the film; a film or a person
--      the house does not hold keeps its title; no card but a filing's carries a kind, and none carries
--      a byline, a count, a picture or a mark of the house ("gone", "sealed") its sharer wrote;
--   5. a piece the sharer cannot read, or that is gone, is refused, as a stack's card already is
--      (STACK_GONE): a record 'LOG_GONE', a filing 'PIECE_GONE' (P0002); a card that names no piece at
--      all keeps none of a card's words, and shows nothing; a message of a kind no app sends is refused
--      ('MESSAGE_KIND', 22023).
--   The website draws a card from its metadata alone (title, subtitle, poster_path). What it drew of a
--   card the house writes is written by the house: a filing's line (title), a record's film and
--   poster, a stack's title, a film's title, poster and year; a filing's title follows its SPOILERS mark
--   (a_spoiler_take_veils_its_cards) and goes when it is withdrawn (dispatch_empty_filing), as its line
--   on the phone does. No client sent a picture or a subtitle in a card's metadata (the website sends
--   them as its caption, the phone in film_poster), so nothing either drew is lost: the website gains
--   a film's and a record's picture.
--   The piece is read as the sharer (the card's functions run as the member), so the house's read rules
--   decide what a member may put on a card: a record of a private member, a blocked author's piece, a
--   draft or a withheld filing is refused as gone, and nothing tells the sharer more than the piece's own
--   page would. The functions live in the schema the API never serves (private, as H-A5 makes it), so a
--   member's own trigger may call them and no member may call them directly.

-- The schema the API never serves (H-A5 makes it too; whichever comes first).
CREATE SCHEMA IF NOT EXISTS private;
-- add-only (1): no shipped client uses it: a schema made here, named by neither TestFlight build 41 nor the website
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- The phone's own rule for a card's title (ShareToLoungeModal cardTitle, over paperText clipToSentence),
-- so the house cuts a long line where the phone does: whole up to 180 code units (MAX_LENGTHS.
-- loungeShareTitle); past it, at the last sentence that ends inside the first 180 (a stop, with any
-- closing quote or bracket after it, followed by a space and a capital, never after an abbreviation or
-- a single letter), then "…"; with none, at the last whole word, dropping a word that cannot end a
-- phrase and a comma or dash left hanging, then "…". Lengths are counted as the phone counts them, in
-- UTF-16 code units (a character past U+FFFF is two), and the 180 are cut only between whole
-- characters: never in front of a mark, a joiner, what a joiner joins, a selector, a skin tone, or
-- inside a flag. Its agreement with the phone is held on both sides: this rehearsal's cuts, and the
-- same pairs run through cardTitle (aCardIsCutAsThePhoneCutsIt.test.ts).
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again; asked by the house alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_card_cut(text);
CREATE FUNCTION private.a_card_cut(p_line text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- JavaScript's whitespace (\s, and what trim() takes away).
  c_ws       constant text := '[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
  -- What may not be cut from the character before it.
  c_joins    constant text := '^[̀-ͯ҃-҉֑-ׇֽֿׁׂׅׄؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭऀ-ःऺ-ॏ॑-ॗॢॣঁ-ঃ়া-্ัิ-ฺ็-๎ᅠ-ᇿ᪰-᫿᷀-᷿‌‍⃐-⃿〪-゙゚〯︀-️︠-︯\U0001f3fb-\U0001f3ff\U000e0020-\U000e007f\U000e0100-\U000e01ef]$';
  c_flag     constant text := '^[\U0001f1e6-\U0001f1ff]$';
  c_max      constant integer := 180;
  c_abbr     constant text[] := ARRAY['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'no', 'vs', 'etc',
                                      'ie', 'eg', 'ca', 'approx', 'dir', 'ed', 'vol', 'pt', 'us', 'uk'];
  c_dangling constant text[] := ARRAY['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet', 'of', 'to', 'in',
                                      'on', 'at', 'by', 'for', 'from', 'with', 'as', 'that', 'which', 'who',
                                      'is', 'was', 'are', 'were', 'be', 'been', 'it', 'its', 'his', 'her', 'their'];
  v_whole  text;
  v_c      text[];
  v_n      integer;
  v_w      integer := 0;
  v_units  integer := 0;
  v_k      integer;
  v_halves integer;
  v_end    integer;
  v_after  text;
  v_word   text;
  v_bare   text;
  v_window text;
  v_space  integer;
  v_words  text[];
  v_last   text;
  v_text   text;
BEGIN
  v_whole := regexp_replace(coalesce(p_line, ''), '^' || c_ws || '+|' || c_ws || '+$', '', 'g');
  IF v_whole = '' THEN
    RETURN NULL;
  END IF;
  -- Up to 180 code units: whole.
  IF char_length(v_whole) + char_length(regexp_replace(v_whole, '[^\U00010000-\U0010ffff]', '', 'g')) <= c_max THEN
    RETURN v_whole;
  END IF;
  v_c := regexp_split_to_array(v_whole, '');
  v_n := cardinality(v_c);
  -- The window: whole characters within the first 180 code units (cutWhole).
  WHILE v_w < v_n AND v_units + CASE WHEN ascii(v_c[v_w + 1]) > 65535 THEN 2 ELSE 1 END <= c_max LOOP
    v_units := v_units + CASE WHEN ascii(v_c[v_w + 1]) > 65535 THEN 2 ELSE 1 END;
    v_w := v_w + 1;
  END LOOP;
  LOOP
    EXIT WHEN v_w = 0 OR v_w >= v_n;
    IF v_c[v_w + 1] ~ c_joins OR v_c[v_w] = U&'\200D' THEN
      v_w := v_w - 1;
      CONTINUE;
    END IF;
    IF v_c[v_w + 1] ~ c_flag AND v_c[v_w] ~ c_flag THEN
      v_halves := 0;
      v_k := v_w;
      WHILE v_k > 0 AND v_c[v_k] ~ c_flag LOOP v_halves := v_halves + 1; v_k := v_k - 1; END LOOP;
      IF v_halves % 2 = 1 THEN v_w := v_w - 1; CONTINUE; END IF;
    END IF;
    EXIT;
  END LOOP;

  -- The last sentence that ends inside the window (clipToSentence).
  FOR v_i IN REVERSE v_w..1 LOOP
    CONTINUE WHEN v_c[v_i] NOT IN ('.', '!', '?');
    v_end := v_i;
    WHILE v_end < v_w AND v_c[v_end + 1] IN ('»', '”', '"', '''', ')', ']') LOOP v_end := v_end + 1; END LOOP;
    -- A stop ends a sentence only where whitespace follows it in the whole line.
    CONTINUE WHEN v_end < v_n AND v_c[v_end + 1] !~ ('^' || c_ws || '$');
    -- ...and what follows begins one: a capital, an opening quote or bracket, or the end.
    v_after := regexp_replace(array_to_string(v_c[v_end + 1:v_n], ''), '^' || c_ws || '+', '');
    CONTINUE WHEN v_after <> '' AND left(v_after, 1) !~ '^[A-Z«“"''(\[]$';
    -- ...and what precedes is no abbreviation, and no single letter.
    v_word := substring(array_to_string(v_c[1:v_i - 1], '') FROM '([A-Za-z.]+)$');
    v_bare := replace(coalesce(v_word, ''), '.', '');
    CONTINUE WHEN char_length(v_bare) = 1 OR lower(v_bare) = ANY (c_abbr);
    v_text := array_to_string(v_c[1:v_end], '');
    RETURN CASE WHEN right(v_text, 1) = '…' THEN v_text ELSE v_text || '…' END;
  END LOOP;

  -- No sentence ended inside the window: the last whole word, a dangling one dropped.
  v_window := array_to_string(v_c[1:v_w], '');
  v_space := strpos(reverse(v_window), ' ');
  IF v_space > 0 AND char_length(v_window) - v_space > 0 THEN
    v_window := left(v_window, char_length(v_window) - v_space);
  END IF;
  v_window := regexp_replace(v_window, c_ws || '+$', '');
  v_words := string_to_array(v_window, ' ');
  WHILE cardinality(v_words) > 1 LOOP
    v_last := lower(regexp_replace(v_words[cardinality(v_words)], '[^A-Za-z'']', '', 'g'));
    EXIT WHEN NOT (v_last = ANY (c_dangling));
    v_words := v_words[1:cardinality(v_words) - 1];
  END LOOP;
  RETURN regexp_replace(array_to_string(v_words, ' '), '[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff,;:\u2014-]+$', '') || '…';
END $$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.a_card_cut(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.a_card_cut(text) TO authenticated, service_role;

-- The share's line for a filing, cut as the phone cuts a card's title: the headline; else the words
-- unless they are marked as a spoiler; else the kind, its film, and that it holds spoilers. Round 13 cut
-- the words at 299 characters and "…", mid-word, where the phone cuts at a sentence or a word: one rule
-- now, the phone's, for every card the house titles (a card shared, and a card titled again when its
-- filing is marked or unmarked SPOILERS).
-- add-only (3): it only fixes: a filing's card titled by the house is cut where the phone cuts it, a line under 180 code units as before; replayed as the members themselves (H-A4 rehearsal, a_spoilers_mark_reaches_its_cards rehearsal)
CREATE OR REPLACE FUNCTION public.a_filings_shared_line(p_kind text, p_title text, p_body text, p_spoiler text, p_film text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT private.a_card_cut(CASE
    WHEN nullif(btrim(coalesce(p_title, '')), '') IS NOT NULL THEN p_title
    WHEN p_spoiler IS NULL AND nullif(btrim(coalesce(p_body, '')), '') IS NOT NULL THEN p_body
    ELSE CASE lower(p_kind) WHEN 'take' THEN 'TAKE' WHEN 'seeking' THEN 'SEEKING' WHEN 'wire' THEN 'WIRE'
                            WHEN 'ballot' THEN 'BALLOT' WHEN 'dossier' THEN 'ESSAY' ELSE upper(p_kind) END
         || coalesce(' on ' || nullif(btrim(coalesce(p_film, '')), ''), '')
         || CASE WHEN p_spoiler IS NOT NULL THEN ' · SPOILERS' ELSE '' END
  END)
$$;

-- The share's rule for a filing's line (the one copy above), for a member's own trigger: it runs as the
-- house, which may ask it.
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again; asked by the house alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_filings_line(text, text, text, text, text);
CREATE FUNCTION private.a_filings_line(p_kind text, p_title text, p_body text, p_spoiler text, p_film text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT public.a_filings_shared_line(p_kind, p_title, p_body, p_spoiler, p_film)
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.a_filings_line(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.a_filings_line(text, text, text, text, text) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again; asked by the house alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_shared_card(public.lounge_messages, boolean);
CREATE FUNCTION private.a_shared_card(p_msg public.lounge_messages, p_refuse_gone boolean) RETURNS public.lounge_messages
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- What only the house may write on a card: a byline, a count, a kind, its pictures, its marks, and the
  -- words the website's reader draws beside a title.
  v_houses  text[] := ARRAY['author_username', 'owner_username', 'curator', 'filmCount', 'topPosters', 'kind',
                            'gone', 'sealed', 'caption', 'subtitle', 'reviewer', 'author', 'excerpt', 'review',
                            'rating', 'poster_path', 'backdrop_path', 'profile_path'];
  v_meta    jsonb := coalesce(p_msg.metadata, '{}'::jsonb);
  v_named   text;
  v_film    text;
  v_log     record;
  v_post    record;
  v_list    record;
  v_known   record;
BEGIN
  IF p_msg.type = 'log_share' THEN
    v_named := coalesce(v_meta ->> 'log_id', v_meta ->> 'logId');
    IF v_named IS NULL THEN
      -- A card that names no record keeps none of a card's words: it shows nothing.
      p_msg.metadata := '{}'::jsonb; p_msg.film_id := NULL; p_msg.film_title := NULL; p_msg.film_poster := NULL;
      RETURN p_msg;
    END IF;
    -- Read as the caller: a sharer may put on a card only a record they may read.
    SELECT l.id, l.user_id, l.film_id, l.film_title, l.poster_path, l.alt_poster INTO v_log
      FROM public.logs l
     WHERE v_named ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND l.id = v_named::uuid;
    IF NOT FOUND THEN
      IF p_refuse_gone THEN
        RAISE EXCEPTION 'LOG_GONE' USING ERRCODE = 'P0002';
      END IF;
      p_msg.metadata := jsonb_build_object('log_id', v_named, 'gone', true);
      p_msg.film_title := NULL; p_msg.film_poster := NULL;
      RETURN p_msg;
    END IF;
    p_msg.film_id := v_log.film_id;
    p_msg.film_title := private.a_card_cut(v_log.film_title);
    -- The record's poster: the one its owner chose for it, or the film's.
    p_msg.film_poster := CASE WHEN p_msg.film_poster IN (v_log.poster_path, v_log.alt_poster) THEN p_msg.film_poster
                              ELSE v_log.poster_path END;
    p_msg.metadata := jsonb_strip_nulls(jsonb_build_object(
      'log_id', v_log.id::text,
      'logId', CASE WHEN v_meta ? 'logId' THEN v_log.id::text END,
      'title', p_msg.film_title,
      'poster_path', p_msg.film_poster,
      'owner_username', (SELECT p.username FROM public.profiles p WHERE p.id = v_log.user_id)));
    RETURN p_msg;
  END IF;

  IF p_msg.type = 'dossier_share' THEN
    v_named := coalesce(v_meta ->> 'dossier_id', v_meta ->> 'dossierId');
    IF v_named IS NULL THEN
      p_msg.metadata := '{}'::jsonb; p_msg.film_id := NULL; p_msg.film_title := NULL; p_msg.film_poster := NULL;
      RETURN p_msg;
    END IF;
    -- Read as the caller: a draft, a withheld filing or a hidden author's is not theirs to show.
    SELECT d.id, d.user_id, d.author_username, d.kind, d.title, d.body, d.spoiler_label, d.subject_kind,
           d.subject_title, d.ended_at, d.is_published INTO v_post
      FROM public.dispatch_posts d
     WHERE v_named ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND d.id = v_named::uuid;
    IF NOT FOUND OR v_post.ended_at IS NOT NULL OR NOT v_post.is_published THEN
      IF p_refuse_gone THEN
        RAISE EXCEPTION 'PIECE_GONE' USING ERRCODE = 'P0002';
      END IF;
      -- As round 11 takes a filing's card down when the filing goes.
      p_msg.film_title := NULL; p_msg.film_poster := NULL; p_msg.film_id := NULL;
      p_msg.metadata := jsonb_build_object('dossier_id', v_named, 'gone', true);
      RETURN p_msg;
    END IF;
    v_film := CASE WHEN v_post.subject_kind = 'film' THEN v_post.subject_title END;
    -- The filing's line by the share's rule, cut as the phone cuts it: never where its sharer chose.
    p_msg.film_title := private.a_filings_line(v_post.kind, v_post.title, v_post.body, v_post.spoiler_label, v_film);
    p_msg.film_id := NULL;
    p_msg.film_poster := NULL;
    p_msg.metadata := jsonb_strip_nulls(jsonb_build_object(
      'dossier_id', v_post.id::text,
      'dossierId', CASE WHEN v_meta ? 'dossierId' THEN v_post.id::text END,
      -- The website draws a card by its title: the same line, kept with the line on the phone.
      'title', p_msg.film_title,
      -- An account closed leaves its filings unsigned: no byline.
      'author_username', CASE WHEN v_post.user_id IS NOT NULL THEN v_post.author_username END,
      'kind', v_post.kind));
    RETURN p_msg;
  END IF;

  IF p_msg.type = 'list_share' THEN
    v_named := v_meta ->> 'listId';
    IF v_named IS NULL THEN
      p_msg.metadata := '{}'::jsonb; p_msg.film_id := NULL; p_msg.film_title := NULL; p_msg.film_poster := NULL;
      RETURN p_msg;
    END IF;
    -- Read as the caller; a sealed stack was refused before this (a_sealed_stack_is_not_shared).
    SELECT l.id, l.title, l.user_id INTO v_list
      FROM public.lists l
     WHERE v_named ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND l.id = v_named::uuid;
    IF NOT FOUND THEN
      IF p_refuse_gone THEN
        RAISE EXCEPTION 'STACK_GONE' USING ERRCODE = 'P0002';
      END IF;
      p_msg.metadata := jsonb_build_object('listId', v_named, 'gone', true);
      p_msg.film_id := NULL; p_msg.film_title := NULL; p_msg.film_poster := NULL;
      RETURN p_msg;
    END IF;
    -- As a_sealed_stack_takes_its_cards makes a card when a stack is opened again.
    p_msg.film_id := NULL; p_msg.film_title := NULL; p_msg.film_poster := NULL;
    p_msg.metadata := jsonb_build_object(
      'listId', v_list.id::text,
      'title', v_list.title,
      'filmCount', (SELECT count(*) FROM public.list_items i WHERE i.list_id = v_list.id),
      'curator', (SELECT p.username FROM public.profiles p WHERE p.id = v_list.user_id),
      'topPosters', coalesce((SELECT jsonb_agg(x.poster_path ORDER BY x.place)
                                FROM (SELECT i.poster_path,
                                             row_number() OVER (ORDER BY i.rank_position NULLS LAST, i.created_at, i.id) AS place
                                        FROM public.list_items i
                                       WHERE i.list_id = v_list.id AND i.poster_path IS NOT NULL
                                       ORDER BY i.rank_position NULLS LAST, i.created_at, i.id
                                       LIMIT 4) x), '[]'::jsonb));
    RETURN p_msg;
  END IF;

  -- A film's or a person's card: no byline, count, kind, picture or mark of the house, whatever was sent.
  p_msg.metadata := v_meta - v_houses;
  IF p_msg.type = 'film_share' THEN
    SELECT f.title, f.poster_path, f.year INTO v_known
      FROM public.films f
     WHERE f.id = coalesce(p_msg.film_id,
                           CASE WHEN (v_meta ->> 'filmId') ~ '^[0-9]{1,9}$' THEN (v_meta ->> 'filmId')::integer END)
       AND nullif(btrim(coalesce(f.title, '')), '') IS NOT NULL;
    IF FOUND THEN
      -- The film as the house holds it: its title (cut as the phone cuts a card's), poster and year.
      IF p_msg.film_title IS NOT NULL THEN
        p_msg.film_title := private.a_card_cut(v_known.title);
      END IF;
      p_msg.film_poster := coalesce(v_known.poster_path, p_msg.film_poster);
      p_msg.metadata := p_msg.metadata || jsonb_strip_nulls(jsonb_build_object(
        'title', CASE WHEN p_msg.metadata ? 'title' THEN private.a_card_cut(v_known.title) END,
        'poster_path', v_known.poster_path,
        'subtitle', v_known.year::text));
    END IF;
  END IF;
  RETURN p_msg;
END $$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the house alone (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.a_shared_card(public.lounge_messages, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.a_shared_card(public.lounge_messages, boolean) TO authenticated, service_role;

-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.a_shared_card_is_the_houses();
CREATE FUNCTION public.a_shared_card_is_the_houses() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- The kinds the apps send: words, or a card of a film, a person, a record, a stack or a filing.
  IF NEW.type IS NULL OR NEW.type NOT IN ('text', 'film_share', 'person_share', 'log_share', 'list_share', 'dossier_share') THEN
    RAISE EXCEPTION 'MESSAGE_KIND' USING ERRCODE = '22023',
      HINT = 'A salon message is words, or a card of a film, a person, a record, a stack or a filing.';
  END IF;
  IF NEW.type = 'text' THEN
    RETURN NEW;
  END IF;
  -- Run as the member writing (no SECURITY DEFINER): the piece is read under the house's read rules.
  RETURN private.a_shared_card(NEW, true);
END $$;
-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the website never call it
REVOKE ALL ON FUNCTION public.a_shared_card_is_the_houses() FROM PUBLIC, anon, authenticated;

-- A filing marked or unmarked SPOILERS: each card's title written again, the website's with it.
-- As 20261119_16 made it but for the metadata's title.
-- add-only (3): it only fixes: a filing's card in a salon keeps its website title in step with its line, every other card untouched; replayed as the members themselves (H-A4 rehearsal, a_spoilers_mark_reaches_its_cards rehearsal)
CREATE OR REPLACE FUNCTION public.a_spoiler_take_veils_its_cards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_line text := public.a_filings_shared_line(NEW.kind, NEW.title, NEW.body, NEW.spoiler_label,
                   CASE WHEN NEW.subject_kind = 'film' THEN NEW.subject_title END);
BEGIN
  -- The house's own write, so a_keeps_what_it_is lets it (the sharer's message is not the author's).
  -- Asked as containment, so the cards' own index (lounge_messages_card_names) finds them; a card
  -- already gone stays gone.
  UPDATE public.lounge_messages m
     SET film_title = v_line,
         metadata = CASE WHEN m.metadata ? 'title' THEN m.metadata || jsonb_build_object('title', v_line) ELSE m.metadata END
   WHERE m.type = 'dossier_share'
     AND m.metadata <> '{}'::jsonb
     AND m.metadata @> jsonb_build_object('dossier_id', NEW.id::text)
     AND NOT (m.metadata @> '{"gone": true}'::jsonb);
  RETURN NULL;
END $$;

-- The one erase of a filing that ends: as 20261117_01 made it, and the website's title of each card goes
-- with its line.
-- add-only (3): it only fixes: a withdrawn filing's card keeps no title for the website either, every other step as before; replayed as the members themselves (H-A4 rehearsal, what_happened_meanwhile_is_told rehearsal)
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
         metadata = ((m.metadata - 'author_username') - 'title') || jsonb_build_object('gone', true)
    FROM ended
   WHERE m.type = 'dossier_share'
     AND m.metadata <> '{}'::jsonb
     AND m.metadata @> jsonb_build_object('dossier_id', ended.id::text);
$$;
