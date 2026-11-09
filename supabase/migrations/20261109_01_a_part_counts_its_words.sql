-- ════════════════════════════════════════════════════════════════════════════
-- 20261109_01 — a filing's words, counted by the house as it is written.
-- ════════════════════════════════════════════════════════════════════════════
--   The series page reads every part's whole text (up to 24 essays at the
--   25,000-character ceiling, ~600 KB) only to print each part's read time.
--   `words` is that count, kept with the row: the text split on every space
--   JavaScript's \s knows, spelled out (Postgres's own \s follows the locale),
--   empty pieces dropped, of full_content, else body: readTimeOf's count
--   (mobile/src/components/dispatch/readTime.ts), over the text as the house
--   keeps it (clean_member_words runs first, so a reader is sent the same text
--   it was counted from). Stored, so a read pays nothing: the load lab
--   (2026-11-09) read a whole series at the ceiling in 0.2 ms this way, and in
--   56 ms counted on the read. Production's table holds 2 rows (208 kB): the
--   column's rewrite is that small. Readable as the table is (SELECT on the
--   whole table, to anon and authenticated).
-- Undo: mobile/supabase/migrations-down/20261109_01_a_part_counts_its_words.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.dispatch_posts ADD COLUMN words integer GENERATED ALWAYS AS (
  cardinality(array_remove(regexp_split_to_array(coalesce(full_content, body, ''),
    '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+'), ''))
) STORED;
