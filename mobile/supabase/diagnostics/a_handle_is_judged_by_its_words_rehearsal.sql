-- ════════════════════════════════════════════════════════════════════════════
-- a_handle_is_judged_by_its_words_rehearsal.sql — 20261002_02. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/a_handle_is_judged_by_its_words_rehearsal.sql
--
-- One member is renamed to each handle below, through the real trigger, and
-- the answer is read. Without with_fix the live filter answers, and the cases
-- on names (moby_dick, matsushita) and on digits (n1gger) FAIL: the rehearsal
-- can say no. Read each NOTICE as  case | expected | got. The last line counts
-- failures.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261002_02_a_handle_is_judged_by_its_words.sql
\endif

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
  m uuid := (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1);
  c record;
  got text;
  failed integer := 0;
  live_refused integer;
BEGIN
  FOR c IN SELECT * FROM handle_cases LOOP
    BEGIN
      UPDATE public.profiles SET username = c.handle WHERE id = m;
      got := 'ok';
    EXCEPTION WHEN check_violation THEN
      got := CASE WHEN SQLERRM = 'This username is not allowed.' THEN 'refused' ELSE SQLERRM END;
    END;
    IF got IS DISTINCT FROM c.expected THEN failed := failed + 1; END IF;
    RAISE NOTICE '% | % | %', c.handle, c.expected, got;
  END LOOP;

  -- No member who holds a handle today is one the filter would refuse.
  IF to_regprocedure('public.handle_is_unwelcome(text)') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.profiles WHERE public.handle_is_unwelcome(username)' INTO live_refused;
  END IF;
  RAISE NOTICE '% | % | %', 'live handles the filter refuses', '0', coalesce(live_refused::text, 'no function');
  IF live_refused IS DISTINCT FROM 0 THEN failed := failed + 1; END IF;

  RAISE NOTICE 'FAILED: %', failed;
END $$;

ROLLBACK;
