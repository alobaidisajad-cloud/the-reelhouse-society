-- ════════════════════════════════════════════════════════════════════════════
-- a_handle_is_judged_by_its_words_rehearsal.sql — 20261002_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/a_handle_is_judged_by_its_words_rehearsal.sql
--
-- One member is renamed to each handle below, through the real trigger, and
-- the answer is read: names and words that only look like a slur are welcome,
-- a slur anywhere, stretched or in digits, is refused; and no member holds a
-- handle the filter would refuse today. Production runs it by hand;
-- db-integration.yml runs it on the sealed copy (e2e/db/rehearsals.mjs).
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

CREATE TEMP TABLE handle_cases (handle text, expected text) ON COMMIT DROP;
INSERT INTO handle_cases VALUES
  -- names and words the old filter refused
  ('moby_dick', 'ok'), ('philip_k_dick', 'ok'), ('dickens_reader', 'ok'),
  ('matsushita', 'ok'), ('kshitij', 'ok'), ('shiitake_fan', 'ok'),
  ('scunthorpe', 'ok'), ('pussycat_fan', 'ok'), ('flame_retardant', 'ok'),
  ('niggle_and_fuss', 'ok'), ('who_reviews', 'ok'), ('slutsky_reads', 'ok'),
  -- refused anywhere inside a word, stretched or in digits
  ('fuuuck', 'refused'), ('testfuck', 'refused'), ('b1tch_please', 'refused'),
  ('n1gger_x', 'refused'), ('xniggaz', 'refused'), ('a55hole', 'refused'),
  ('wh0re', 'refused'), ('faggot', 'refused'),
  -- refused where a word begins or ends with it
  ('bullshit_critic', 'refused'), ('shitty_films', 'refused'), ('5hit', 'refused'),
  ('cunty', 'refused'),
  -- refused as a whole word
  ('big_pussy', 'refused'), ('retard', 'refused'), ('slut_cinema', 'refused'),
  ('tranny_x', 'refused');

DO $$
DECLARE
  m uuid := pg_temp.rh_found('a member to rename', (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1));
  c record;
  got text;
  live_refused integer;
BEGIN
  FOR c IN SELECT * FROM handle_cases LOOP
    BEGIN
      UPDATE public.profiles SET username = c.handle WHERE id = m;
      got := 'ok';
    EXCEPTION WHEN check_violation THEN
      got := CASE WHEN SQLERRM = 'This username is not allowed.' THEN 'refused' ELSE SQLERRM END;
    END;
    PERFORM pg_temp.rh_case(c.handle, c.expected, got);
  END LOOP;

  -- No member who holds a handle today is one the filter would refuse.
  IF to_regprocedure('public.handle_is_unwelcome(text)') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.profiles WHERE public.handle_is_unwelcome(username)' INTO live_refused;
  END IF;
  PERFORM pg_temp.rh_case('live handles the filter refuses (of ' || (SELECT count(*) FROM public.profiles) || ')',
    '0', coalesce(live_refused::text, 'no function'));
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
