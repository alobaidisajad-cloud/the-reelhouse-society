-- ════════════════════════════════════════════════════════════════════════════
-- 20261003_05 — a member's words are cleaned where they are kept
-- ════════════════════════════════════════════════════════════════════════════
-- The app cleans every word a member writes before it is sent (cleanForStorage
-- in mobile/src/utils/sanitizeInput.ts): invisible characters and the three bidi
-- families go, so U+202E cannot show one thing and store another; control
-- characters go; a pasted line or paragraph separator becomes the break it is;
-- runs of blank lines and spaces are collapsed; the ends are trimmed. The website
-- sends what was typed, and anyone holding the public key can write straight to
-- a table, so production keeps 36 values the app would never have stored.
--
-- Now the database cleans them the same way, whoever writes: one function with
-- the app's rules (the corpus in mobile/e2e/db/member-text.corpus.json holds both
-- to the same answers), and one trigger on every table that keeps a member's
-- words, which runs before every other trigger there, so each check after it
-- reads the words as they will be kept. An argument "column.key" cleans that key
-- of each object in a jsonb array: a ballot's options, a profile's links, a
-- log's past viewings.
--
-- Neither function is callable from the API: the trigger function runs as its
-- owner, and a trigger fires whoever may execute it.
--
-- The values already kept are cleaned through the same triggers, by the columns
-- each one names.
-- ════════════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.clean_member_text(words text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  s text;
  chars text[];
  kept text[] := '{}';
  n integer;
  c integer;
  before integer;
  after integer;
BEGIN
  IF words IS NULL THEN
    RETURN NULL;
  END IF;

  -- A line and a paragraph separator are the breaks they are.
  s := replace(replace(words, chr(8232), E'\n'), chr(8233), E'\n\n');

  -- The invisible characters but the two joiners, then the control characters
  -- but newline, carriage return and tab.
  s := regexp_replace(s,
    '[' || chr(8203) || chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238)
        || chr(65279) || chr(173) || chr(847) || chr(8288) || '-' || chr(8292)
        || chr(8294) || '-' || chr(8303)
        || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || chr(127)
    || ']', '', 'g');

  -- A joiner is kept between two letters of a joining script, and a zero-width
  -- joiner between the end of an emoji and the start of the next; elsewhere it
  -- joins nothing and goes.
  IF strpos(s, chr(8204)) > 0 OR strpos(s, chr(8205)) > 0 THEN
    chars := string_to_array(s, NULL);
    n := coalesce(array_length(chars, 1), 0);
    FOR i IN 1..n LOOP
      c := ascii(chars[i]);
      IF c = 8204 OR c = 8205 THEN
        after := CASE WHEN i < n THEN ascii(chars[i + 1]) END;
        IF NOT coalesce(
             ((before BETWEEN 1536 AND 3583 OR before BETWEEN 4096 AND 4255 OR before BETWEEN 6016 AND 6319
               OR before BETWEEN 64336 AND 65023 OR before BETWEEN 65136 AND 65276)
              AND (after BETWEEN 1536 AND 3583 OR after BETWEEN 4096 AND 4255 OR after BETWEEN 6016 AND 6319
               OR after BETWEEN 64336 AND 65023 OR after BETWEEN 65136 AND 65276))
             OR (c = 8205
                 AND (before >= 65536 OR before = 65039 OR before BETWEEN 8592 AND 11263)
                 AND (after >= 65536 OR after BETWEEN 8592 AND 11263)),
             false) THEN
          CONTINUE;
        END IF;
      END IF;
      kept := kept || chars[i];
      before := c;
    END LOOP;
    s := array_to_string(kept, '');
  END IF;

  s := regexp_replace(s, E'\n{4,}', E'\n\n\n', 'g');
  s := regexp_replace(s, E'[ \t]{10,}', '  ', 'g');

  -- The ends, as String.prototype.trim finds them.
  RETURN btrim(s, E' \t\n\r' || chr(11) || chr(12) || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197)
    || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202)
    || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279));
END;
$$;

CREATE FUNCTION public.clean_member_words() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  fields  jsonb := to_jsonb(NEW);
  patch   jsonb := '{}';
  arg     text;
  col     text;
  key     text;
  v       jsonb;
  cleaned jsonb;
BEGIN
  FOREACH arg IN ARRAY TG_ARGV LOOP
    col := split_part(arg, '.', 1);
    key := nullif(split_part(arg, '.', 2), '');
    v := coalesce(patch -> col, fields -> col);
    IF key IS NULL AND jsonb_typeof(v) = 'string' THEN
      cleaned := to_jsonb(public.clean_member_text(v #>> '{}'));
    ELSIF key IS NOT NULL AND jsonb_typeof(v) = 'array' THEN
      SELECT coalesce(jsonb_agg(
               CASE WHEN jsonb_typeof(e -> key) = 'string'
                    THEN jsonb_set(e, ARRAY[key], to_jsonb(public.clean_member_text(e ->> key)))
                    ELSE e END ORDER BY n), '[]'::jsonb)
        INTO cleaned
        FROM jsonb_array_elements(v) WITH ORDINALITY AS a(e, n);
    ELSE
      CONTINUE;
    END IF;
    IF cleaned IS DISTINCT FROM v THEN
      patch := patch || jsonb_build_object(col, cleaned);
    END IF;
  END LOOP;

  IF patch <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, patch);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clean_member_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clean_member_words() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF review, pull_quote, watched_with, private_notes, abandoned_reason, viewing_history ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('review', 'pull_quote', 'watched_with', 'private_notes', 'abandoned_reason',
    'viewing_history.review', 'viewing_history.pullQuote', 'viewing_history.watchedWith', 'viewing_history.abandonedReason');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF notes ON public.log_private_notes
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('notes');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF body ON public.log_comments
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('body');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF title, description ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('title', 'description');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF content ON public.list_comments
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('content');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF title, body, full_content, series_title, subject_title, subject_sub, spoiler_label, source, options ON public.dispatch_posts
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('title', 'body', 'full_content', 'series_title', 'subject_title', 'subject_sub', 'spoiler_label', 'source', 'options.title');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF body ON public.dispatch_comments
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('body');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF title, excerpt, full_content ON public.dispatch_dossiers_legacy
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('title', 'excerpt', 'full_content');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF body ON public.dossier_comments_legacy
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('body');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF name, description ON public.lounges
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('name', 'description');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF content, reply_to_content ON public.lounge_messages
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('content', 'reply_to_content');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF notes, condition ON public.physical_archive
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('notes', 'condition');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF bio, display_name, persona, social_links ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('bio', 'display_name', 'persona', 'social_links.title');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF details, resolution_notes ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('details', 'resolution_notes');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF reason ON public.mod_actions
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('reason');
CREATE TRIGGER a_clean_member_text BEFORE INSERT OR UPDATE OF reason ON public.warnings
  FOR EACH ROW EXECUTE FUNCTION public.clean_member_words('reason');

-- The values already kept: each row whose words the cleaning would change is
-- written back to itself, and its trigger cleans it.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT g.tgrelid::regclass AS tbl,
           string_agg(DISTINCT format('%1$I = %1$I', split_part(a.arg, '.', 1)), ', ') AS sets,
           string_agg(CASE WHEN a.arg LIKE '%.%'
                           THEN format('EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(%1$I) = ''array'' THEN %1$I END) e'
                                       ' WHERE jsonb_typeof(e -> %2$L) = ''string'''
                                       ' AND e ->> %2$L IS DISTINCT FROM public.clean_member_text(e ->> %2$L))',
                                       split_part(a.arg, '.', 1), split_part(a.arg, '.', 2))
                           ELSE format('%1$I IS DISTINCT FROM public.clean_member_text(%1$I)', a.arg) END,
                      ' OR ') AS dirty
      FROM pg_trigger g
      CROSS JOIN LATERAL unnest(string_to_array(encode(g.tgargs, 'escape'), '\000')) AS a(arg)
     WHERE g.tgname = 'a_clean_member_text' AND a.arg <> ''
     GROUP BY g.tgrelid
  LOOP
    EXECUTE format('UPDATE %s SET %s WHERE %s', t.tbl, t.sets, t.dirty);
  END LOOP;
END;
$$;
