-- ════════════════════════════════════════════════════════════════════════════
-- a_part_counts_its_words_rehearsal.sql — 20261109_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_part_counts_its_words_rehearsal.sql
--
-- A filing's words are counted by the house as the app counts them
-- (readTimeOf: split on JavaScript's \s, empty pieces dropped, of full_content,
-- else body), over the text as the house keeps it. Filings are written with an
-- essay of every kind: none (its excerpt counted), an empty one (no words, as
-- the reader counts it), one word, words parted by every space JavaScript
-- splits on, by characters it does not split on, Arabic, and runs of spaces at
-- both ends. One is rewritten and counted again. A visitor and a member read
-- the count as they read the filing. Read each NOTICE as case|expected|got ;
-- the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql
\ir ../../../supabase/migrations/20261109_01_a_part_counts_its_words.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT set_config('rehearsal.author', pg_temp.rh_found('a member to write the filings',
  (SELECT id FROM public.profiles WHERE role IS DISTINCT FROM 'admin' ORDER BY id LIMIT 1))::text, true) AS done \gset rh_

-- Each filing: what it holds, its essay (NULL, none), its excerpt, and the words the app counts in
-- the text a reader is sent (the house's cleaning runs first: a line separator is a break, a
-- zero-width space is taken out).
CREATE TEMP TABLE rh_filing (what text PRIMARY KEY, essay text, excerpt text, expected integer, id uuid) ON COMMIT DROP;
INSERT INTO rh_filing (what, essay, excerpt, expected) VALUES
  ('no essay: its excerpt is counted', NULL, 'one two  three', 3),
  ('an empty essay counts no words, as the reader counts it', '', 'an excerpt of five words', 0),
  ('one word', 'word', 'x', 1),
  ('words parted by every space JavaScript splits on', 'a' || chr(160) || 'b' || chr(5760) || 'c' || chr(8192) || 'd'
     || chr(8202) || 'e' || chr(8232) || 'f' || chr(8233) || 'g' || chr(8239) || 'h' || chr(8287) || 'i'
     || chr(12288) || 'j' || chr(9) || 'k' || chr(10) || 'l' || chr(13) || 'm' || ' ' || 'n', 'x', 14),
  ('characters JavaScript does not split on part nothing', 'a' || chr(133) || 'b' || chr(6158) || 'c' || chr(8203) || 'd', 'x', 1),
  ('Arabic', 'مقال طويل جدا', 'x', 3),
  ('runs of spaces, and at both ends', '   many    spaces  here   ', 'x', 3);
UPDATE rh_filing SET id = gen_random_uuid();
INSERT INTO public.dispatch_posts (id, kind, user_id, author_username, title, body, full_content, is_published)
-- Takes, which no rank gates: the count reads the row's text alone, whatever its kind.
SELECT id, 'take', current_setting('rehearsal.author')::uuid, 'rh', NULL, excerpt, essay, false FROM rh_filing;
-- Read as each reader asks, so a refusal is the table's own, never this one's.
GRANT SELECT ON rh_filing TO authenticated, anon;

-- One filing's essay rewritten: its count follows.
UPDATE public.dispatch_posts SET full_content = 'now two'
 WHERE id = (SELECT id FROM rh_filing WHERE what = 'one word');

-- A count written by hand is refused: the house keeps it.
CREATE TEMP TABLE rh_hand (got text) ON COMMIT DROP;
DO $$
BEGIN
  UPDATE public.dispatch_posts SET words = 999 WHERE id = (SELECT id FROM rh_filing WHERE what = 'Arabic');
  INSERT INTO rh_hand VALUES ('written');
EXCEPTION WHEN generated_always THEN
  INSERT INTO rh_hand VALUES ('refused');
END $$;

-- ── the verdict ──────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT f.what, f.expected, p.words FROM rh_filing f JOIN public.dispatch_posts p ON p.id = f.id
            WHERE f.what <> 'one word' ORDER BY f.what LOOP
    PERFORM pg_temp.rh_case(r.what, r.expected::text, coalesce(r.words::text, 'none'));
  END LOOP;
  PERFORM pg_temp.rh_case('an essay rewritten is counted again', '2',
    (SELECT words::text FROM public.dispatch_posts WHERE id = (SELECT id FROM rh_filing WHERE what = 'one word')));
  PERFORM pg_temp.rh_case('a visitor and a member read the count as they read the filing', 'true|true',
    has_column_privilege('anon', 'public.dispatch_posts', 'words', 'SELECT')::text || '|'
    || has_column_privilege('authenticated', 'public.dispatch_posts', 'words', 'SELECT')::text);
  PERFORM pg_temp.rh_case('a count written by hand is refused: the house keeps it', 'refused',
    (SELECT got FROM rh_hand));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
