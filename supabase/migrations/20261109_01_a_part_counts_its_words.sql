-- ════════════════════════════════════════════════════════════════════════════
-- 20261109_01 — a filing's words, counted by the house as it is written.
-- ════════════════════════════════════════════════════════════════════════════
--   The series page reads every part's whole text (up to 24 essays at the
--   25,000-character ceiling, ~600 KB) only to print each part's read time.
--   `words` is that count, kept with the row: the text split on every space
--   JavaScript's \s knows, spelled out (Postgres's own \s follows the locale),
--   empty pieces dropped, of full_content, else body: readTimeOf's count
--   (mobile/src/components/dispatch/readTime.ts), over the text as the house
--   keeps it (z_counts_its_words runs after a_clean_member_text, so a reader is
--   sent the text it was counted from). Kept, so a read pays nothing: the load
--   lab (2026-11-09) read a whole series at the ceiling in 0.2 ms so, and in
--   56 ms counted on the read.
--   Not a generated column: adding one rewrites the table under an exclusive
--   lock (3.4 s on the lab's 40,000 filings). A plain column is added in place;
--   the trigger counts every filing written or whose text changes from now on,
--   and any count written by hand is counted again. The filings already
--   written are counted where the count is read, the parts of a series; the
--   rest keep NULL (not counted) until their text next changes, and no client
--   reads it of them. Production holds 2 filings and no series part.
-- Undo: mobile/supabase/migrations-down/20261109_01_a_part_counts_its_words.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.dispatch_posts ADD COLUMN words integer;

CREATE FUNCTION public.dispatch_post_words(p_text text) RETURNS integer
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT cardinality(array_remove(regexp_split_to_array(coalesce(p_text, ''),
    '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+'), ''))
$$;
-- add-only (1): no shipped client uses it: a function this migration makes, named by no client before it (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.dispatch_post_words(text) FROM PUBLIC;
-- A member's own write counts its words through it (the trigger runs as the writer): theirs to
-- call. It reads nothing but the text it is given.
GRANT EXECUTE ON FUNCTION public.dispatch_post_words(text) TO authenticated;
GRANT ALL ON FUNCTION public.dispatch_post_words(text) TO service_role;

CREATE FUNCTION public.dispatch_posts_count_words() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.words IS NULL
     OR NEW.full_content IS DISTINCT FROM OLD.full_content OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.words IS DISTINCT FROM OLD.words THEN
    NEW.words := public.dispatch_post_words(coalesce(NEW.full_content, NEW.body));
  END IF;
  RETURN NEW;
END;
$$;
-- add-only (1): no shipped client uses it: a trigger's function this migration makes, run by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION public.dispatch_posts_count_words() FROM PUBLIC;
GRANT ALL ON FUNCTION public.dispatch_posts_count_words() TO service_role;

-- add-only (3): it only widens or fixes: it sets the column this migration adds and changes nothing a client writes; every insert and update of a filing replayed in the rehearsal (a_part_counts_its_words_rehearsal)
CREATE TRIGGER z_counts_its_words BEFORE INSERT OR UPDATE ON public.dispatch_posts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_posts_count_words();

-- The parts of a series already written, the only filings whose count a client reads.
UPDATE public.dispatch_posts SET words = public.dispatch_post_words(coalesce(full_content, body))
 WHERE series_id IS NOT NULL;
