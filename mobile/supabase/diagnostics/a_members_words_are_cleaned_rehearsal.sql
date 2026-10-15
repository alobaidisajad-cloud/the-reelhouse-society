-- ════════════════════════════════════════════════════════════════════════════
-- a_members_words_are_cleaned_rehearsal.sql — 20261003_05. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   cd mobile; psql "$SUPABASE_DB_URL" -X -q -t -A -f supabase/diagnostics/a_members_words_are_cleaned_rehearsal.sql
--
-- Run from mobile/: the corpus is read from e2e/db/member-text.corpus.json.
-- The database answers every case in the corpus as the app does; every value
-- the house keeps is already its own cleaning; a member writing through the
-- API is cleaned on every kind of column (text, a link's title, a past
-- viewing); the cleaning runs first on each table; no API role can call it.
-- Production runs it by hand; db-integration.yml runs it on the sealed copy
-- (e2e/db/rehearsals.mjs). Read each NOTICE as  case|expected|got ; the last
-- line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

CREATE TEMP TABLE mw_corpus_lines (n serial, t text) ON COMMIT DROP;
\copy mw_corpus_lines (t) FROM 'e2e/db/member-text.corpus.json' WITH (FORMAT csv, DELIMITER E'\x01', QUOTE E'\x02')

-- Every member's word the house keeps, stated here on its own so a column the
-- cleaning forgot is a value left uncleaned.
CREATE TEMP VIEW mw_words AS
          SELECT 'logs' AS tbl, id::text AS id, 'review' AS col, review AS v FROM public.logs
UNION ALL SELECT 'logs', id::text, 'pull_quote', pull_quote FROM public.logs
UNION ALL SELECT 'logs', id::text, 'watched_with', watched_with FROM public.logs
UNION ALL SELECT 'logs', id::text, 'private_notes', private_notes FROM public.logs
UNION ALL SELECT 'logs', id::text, 'abandoned_reason', abandoned_reason FROM public.logs
UNION ALL SELECT 'logs', l.id::text, 'viewing_history.' || n || '.' || k, e ->> k
            FROM public.logs l, jsonb_array_elements(CASE WHEN jsonb_typeof(l.viewing_history) = 'array' THEN l.viewing_history END) WITH ORDINALITY AS h(e, n),
                 unnest(ARRAY['review', 'pullQuote', 'watchedWith', 'abandonedReason']) AS k
           WHERE jsonb_typeof(e -> k) = 'string'
UNION ALL SELECT 'log_private_notes', viewing_id::text, 'notes', notes FROM public.log_private_notes
UNION ALL SELECT 'log_comments', id::text, 'body', body FROM public.log_comments
UNION ALL SELECT 'lists', id::text, 'title', title FROM public.lists
UNION ALL SELECT 'lists', id::text, 'description', description FROM public.lists
UNION ALL SELECT 'list_comments', id::text, 'content', content FROM public.list_comments
UNION ALL SELECT 'dispatch_posts', id::text, c.col, c.v FROM public.dispatch_posts p,
            LATERAL (VALUES ('title', p.title), ('body', p.body), ('full_content', p.full_content), ('series_title', p.series_title),
                            ('subject_title', p.subject_title), ('subject_sub', p.subject_sub), ('spoiler_label', p.spoiler_label),
                            ('source', p.source)) AS c(col, v)
UNION ALL SELECT 'dispatch_posts', p.id::text, 'options.' || n, e ->> 'title'
            FROM public.dispatch_posts p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.options) = 'array' THEN p.options END) WITH ORDINALITY AS o(e, n)
UNION ALL SELECT 'dispatch_comments', id::text, 'body', body FROM public.dispatch_comments
UNION ALL SELECT 'dispatch_dossiers_legacy', id::text, c.col, c.v FROM public.dispatch_dossiers_legacy d,
            LATERAL (VALUES ('title', d.title), ('excerpt', d.excerpt), ('full_content', d.full_content)) AS c(col, v)
UNION ALL SELECT 'dossier_comments_legacy', id::text, 'body', body FROM public.dossier_comments_legacy
UNION ALL SELECT 'lounges', id::text, 'name', name FROM public.lounges
UNION ALL SELECT 'lounges', id::text, 'description', description FROM public.lounges
UNION ALL SELECT 'lounge_messages', id::text, 'content', content FROM public.lounge_messages
UNION ALL SELECT 'lounge_messages', id::text, 'reply_to_content', reply_to_content FROM public.lounge_messages
UNION ALL SELECT 'physical_archive', id::text, 'notes', notes FROM public.physical_archive
UNION ALL SELECT 'physical_archive', id::text, 'condition', condition FROM public.physical_archive
UNION ALL SELECT 'profiles', id::text, 'bio', bio FROM public.profiles
UNION ALL SELECT 'profiles', id::text, 'display_name', display_name FROM public.profiles
UNION ALL SELECT 'profiles', id::text, 'persona', persona FROM public.profiles
UNION ALL SELECT 'profiles', p.id::text, 'social_links.' || n, e ->> 'title'
            FROM public.profiles p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.social_links) = 'array' THEN p.social_links END) WITH ORDINALITY AS s(e, n)
UNION ALL SELECT 'reports', id::text, 'details', details FROM public.reports
UNION ALL SELECT 'reports', id::text, 'resolution_notes', resolution_notes FROM public.reports
UNION ALL SELECT 'mod_actions', id::text, 'reason', reason FROM public.mod_actions
UNION ALL SELECT 'warnings', id::text, 'reason', reason FROM public.warnings;

-- What the house keeps now, and what the cleaning makes of each value (asked only if it exists).
CREATE TEMP TABLE mw_kept ON COMMIT DROP AS SELECT * FROM mw_words WHERE v IS NOT NULL;
SELECT pg_temp.rh_need('member''s word kept in the house', (SELECT count(*) FROM mw_kept), 1) AS done \gset rh_
CREATE TEMP TABLE mw_expected (tbl text, id text, col text, was text, should text) ON COMMIT DROP;
DO $$
BEGIN
  IF to_regprocedure('public.clean_member_text(text)') IS NOT NULL THEN
    EXECUTE 'INSERT INTO mw_expected SELECT tbl, id, col, v, public.clean_member_text(v) FROM mw_kept';
  END IF;
END $$;

-- A member writes through the API, as either app or the website would.
CREATE TEMP TABLE mw_cast ON COMMIT DROP AS
SELECT l.user_id AS member, l.id AS log_id
  FROM public.logs l JOIN public.profiles p ON p.id = l.user_id
 WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until < now())
 ORDER BY l.created_at LIMIT 1;
SELECT pg_temp.rh_need('log by a member in good standing', (SELECT count(*) FROM mw_cast), 1) AS done \gset rh_
CREATE TEMP TABLE mw_out (k text, got text) ON COMMIT DROP;
GRANT ALL ON mw_out TO authenticated;
GRANT SELECT ON mw_cast TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT member FROM mw_cast)::text, 'role', 'authenticated')::text, true) AS done \gset rh_
WITH u AS (
  UPDATE public.logs SET review = ' a' || chr(8238) || 'b' || chr(8203) || ' ' || chr(8232)
   WHERE id = (SELECT log_id FROM mw_cast) RETURNING review)
INSERT INTO mw_out SELECT 'review', review FROM u;
WITH u AS (
  UPDATE public.profiles
     SET bio = chr(160) || 'Cinephile' || chr(8203) || '.',
         social_links = jsonb_build_array(jsonb_build_object('title', ' Blog' || chr(8238) || ' ', 'url', 'https://example.com'))
   WHERE id = (SELECT member FROM mw_cast) RETURNING bio, social_links)
INSERT INTO mw_out SELECT 'bio', bio FROM u UNION ALL SELECT 'link', social_links ->> 0 FROM u;
RESET ROLE;

-- A past viewing written straight to the row, as an older client still can.
SELECT pg_temp.rh_need('log with a past viewing',
  (SELECT count(*) FROM public.logs WHERE jsonb_typeof(viewing_history) = 'array' AND jsonb_array_length(viewing_history) > 0), 1) AS done \gset rh_
WITH target AS (
  SELECT id FROM public.logs WHERE jsonb_typeof(viewing_history) = 'array' AND jsonb_array_length(viewing_history) > 0 ORDER BY created_at LIMIT 1),
u AS (
  UPDATE public.logs l SET viewing_history = jsonb_set(l.viewing_history, '{0,review}', to_jsonb('x' || chr(8238) || 'y  '))
    FROM target WHERE l.id = target.id RETURNING l.viewing_history -> 0 ->> 'review' AS review)
INSERT INTO mw_out SELECT 'viewing', review FROM u;

-- How long the longest essay takes, twenty times over.
CREATE TEMP TABLE mw_time (ms numeric) ON COMMIT DROP;
DO $$
DECLARE essay text; t0 timestamptz;
BEGIN
  IF to_regprocedure('public.clean_member_text(text)') IS NOT NULL THEN
    SELECT e ->> 'input' INTO essay
      FROM jsonb_array_elements((SELECT string_agg(t, E'\n' ORDER BY n) FROM mw_corpus_lines)::jsonb) e
     WHERE e ->> 'case' LIKE 'an essay%';
    t0 := clock_timestamp();
    FOR i IN 1..20 LOOP PERFORM public.clean_member_text(essay || i); END LOOP;
    INSERT INTO mw_time VALUES (extract(epoch FROM clock_timestamp() - t0) * 1000 / 20);
  END IF;
END $$;

DO $$
DECLARE
  has_fn boolean := to_regprocedure('public.clean_member_text(text)') IS NOT NULL;
  corpus jsonb := (SELECT string_agg(t, E'\n' ORDER BY n) FROM mw_corpus_lines)::jsonb;
  disagree integer;
BEGIN
  IF has_fn THEN
    EXECUTE 'SELECT count(*) FROM jsonb_array_elements($1) e WHERE public.clean_member_text(e ->> ''input'') IS DISTINCT FROM e ->> ''output'''
      INTO disagree USING corpus;
  END IF;
  PERFORM pg_temp.rh_case('the corpus holds its cases', '230', jsonb_array_length(corpus)::text);
  PERFORM pg_temp.rh_case('the database answers every case as the app does', '0', disagree::text);
  PERFORM pg_temp.rh_case('every value the house keeps is already its own cleaning (of ' || (SELECT count(*) FROM mw_kept) || ')', '0',
    CASE WHEN has_fn THEN (SELECT count(*)::text FROM mw_expected WHERE was IS DISTINCT FROM should) END);
  PERFORM pg_temp.rh_case('a member''s review is kept cleaned', 'ab', (SELECT got FROM mw_out WHERE k = 'review'));
  PERFORM pg_temp.rh_case('a member''s bio is kept cleaned', 'Cinephile.', (SELECT got FROM mw_out WHERE k = 'bio'));
  PERFORM pg_temp.rh_case('a member''s link title is kept cleaned, its address as given', '{"url": "https://example.com", "title": "Blog"}',
    (SELECT got FROM mw_out WHERE k = 'link'));
  PERFORM pg_temp.rh_case('a past viewing''s review is kept cleaned', 'xy', (SELECT got FROM mw_out WHERE k = 'viewing'));
  PERFORM pg_temp.rh_case('the tables that clean a member''s words', '16', (SELECT count(*)::text FROM pg_trigger WHERE tgname = 'a_clean_member_text'));
  PERFORM pg_temp.rh_case('on each, the cleaning runs before every other trigger', '0',
    (SELECT count(*)::text FROM pg_trigger a JOIN pg_trigger o ON o.tgrelid = a.tgrelid
      WHERE a.tgname = 'a_clean_member_text' AND NOT o.tgisinternal AND (o.tgtype & 2) <> 0 AND (o.tgtype & 1) <> 0
        AND o.tgname < a.tgname));
  PERFORM pg_temp.rh_case('a member cannot call the cleaning', 'false',
    has_function_privilege('authenticated', to_regprocedure('public.clean_member_text(text)'), 'EXECUTE')::text);
  PERFORM pg_temp.rh_case('a visitor cannot call the cleaning', 'false',
    has_function_privilege('anon', to_regprocedure('public.clean_member_text(text)'), 'EXECUTE')::text);
  PERFORM pg_temp.rh_case('nor its trigger function', 'false',
    has_function_privilege('authenticated', to_regprocedure('public.clean_member_words()'), 'EXECUTE')::text);
  PERFORM pg_temp.rh_case('the longest essay is cleaned in under 50 ms', 'true', (SELECT (ms < 50)::text FROM mw_time));
  RAISE NOTICE 'the longest essay took % ms', (SELECT round(ms, 2) FROM mw_time);
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
