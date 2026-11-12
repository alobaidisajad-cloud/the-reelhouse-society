-- ════════════════════════════════════════════════════════════════════════════
-- the_stacks_search_finds_its_matches_rehearsal.sql — 20261112_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_stacks_search_finds_its_matches_rehearsal.sql --with-train
--
-- The Reel's stacks, searched by 30 members each, are read by get_filtered_stacks_auth_cursor_v2 as
-- it stands; then the train applies 20261112_02 here (with_train), and each search is read again:
-- the same stacks in the same order, for every member and every search (on the load lab's full house
-- too, where the train runs this before it applies anything). The searches come from the house's
-- own stacks and members: no word; three pieces of real titles; two pieces of real authors'
-- handles; a word of two letters and one of one; each again behind the following filter; and the
-- next page, after the tenth of the first. Read each NOTICE as case|expected|got ; the last line is
-- the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_member (id uuid) ON COMMIT DROP;
INSERT INTO rh_member SELECT id FROM public.profiles ORDER BY id LIMIT 30;
SELECT pg_temp.rh_found('a public stack', (SELECT id FROM public.lists WHERE is_private = false LIMIT 1)) AS done \gset rh_

-- The words: from the house's own titles and handles, so a search finds what production holds.
CREATE TEMP TABLE rh_word (word text) ON COMMIT DROP;
INSERT INTO rh_word VALUES (''), ('a'), ('th');
INSERT INTO rh_word
  SELECT DISTINCT substr(title, 1 + char_length(title) / 3, 5) FROM (
    SELECT title FROM public.lists WHERE is_private = false AND char_length(title) >= 8 ORDER BY id LIMIT 3) t;
INSERT INTO rh_word
  SELECT DISTINCT substr(p.username, 1, 4) FROM (
    SELECT DISTINCT l.user_id FROM public.lists l WHERE l.is_private = false ORDER BY l.user_id LIMIT 2) a
  JOIN public.profiles p ON p.id = a.user_id WHERE char_length(p.username) >= 4;

-- Each member's page for each word (and behind the following filter), and the page after the tenth.
CREATE TEMP TABLE rh_page (pass text, member uuid, word text, following boolean, after_tenth boolean, ids text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.rh_read(p_pass text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m record; w record; f boolean; tenth record;
BEGIN
  FOR m IN SELECT id FROM rh_member LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m.id, 'role', 'authenticated')::text, true);
    FOR w IN SELECT word FROM rh_word LOOP
      FOREACH f IN ARRAY ARRAY[false, true] LOOP
        INSERT INTO rh_page SELECT p_pass, m.id, w.word, f, false,
          coalesce(string_agg(s.id::text, ',' ORDER BY s.n), '')
          FROM public.get_filtered_stacks_auth_cursor_v2(w.word, f, 60) WITH ORDINALITY
               AS s(id, title, description, username, user_id, created_at, films, film_count, certify_count, is_ranked, n);
      END LOOP;
      SELECT s.id, s.created_at INTO tenth
        FROM public.get_filtered_stacks_auth_cursor_v2(w.word, false, 10) s ORDER BY s.created_at, s.id LIMIT 1;
      IF tenth.id IS NOT NULL THEN
        INSERT INTO rh_page SELECT p_pass, m.id, w.word, false, true,
          coalesce(string_agg(s.id::text, ',' ORDER BY s.n), '')
          FROM public.get_filtered_stacks_auth_cursor_v2(w.word, false, 60, tenth.created_at, tenth.id) WITH ORDINALITY
               AS s(id, title, description, username, user_id, created_at, films, film_count, certify_count, is_ranked, n);
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
SELECT pg_temp.rh_read('before') AS done \gset rh_

-- The train applies it here first (with_train); a sealed copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261112_02_the_stacks_search_finds_its_matches.sql
\endif

SELECT pg_temp.rh_read('after') AS done \gset rh_

SELECT pg_temp.rh_case('every member''s every search: the same stacks in the same order', '0',
  (SELECT count(*) FROM rh_page b JOIN rh_page a
      ON a.pass = 'after' AND a.member = b.member AND a.word = b.word AND a.following = b.following AND a.after_tenth = b.after_tenth
    WHERE b.pass = 'before' AND a.ids IS DISTINCT FROM b.ids)::text) AS done \gset rh_
SELECT pg_temp.rh_case('every page read, twice', '0',
  (SELECT abs((SELECT count(*) FROM rh_page WHERE pass = 'before') - (SELECT count(*) FROM rh_page WHERE pass = 'after')))::text) AS done \gset rh_
SELECT pg_temp.rh_case('a search found something', 'true',
  (SELECT bool_or(ids <> '') FROM rh_page WHERE pass = 'after' AND word <> '')::text) AS done \gset rh_
-- The search read the new way: counted by the trigram indexes, its few matches read by them
-- (what it costs is not something a rolled-back rehearsal can time, so the function as stored says it).
SELECT pg_temp.rh_case('a search counts its matches, and reads few by the trigram indexes', 'true',
  (SELECT p.prosrc LIKE '%many AS MATERIALIZED%' AND p.prosrc LIKE '%matched AS MATERIALIZED%'
          AND p.prosrc NOT LIKE '%l.user_id IN (%'
     FROM pg_proc p WHERE p.oid = 'public.get_filtered_stacks_auth_cursor_v2(text, boolean, integer, timestamp with time zone, uuid, integer)'::regprocedure)::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
