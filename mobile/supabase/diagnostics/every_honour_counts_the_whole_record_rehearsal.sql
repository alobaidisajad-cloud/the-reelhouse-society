-- ════════════════════════════════════════════════════════════════════════════
-- every_honour_counts_the_whole_record_rehearsal.sql — does the summary count
-- every honour over the whole record, and change nothing else?
-- ════════════════════════════════════════════════════════════════════════════
-- Runs against production inside one transaction that ROLLS BACK: every
-- member's summary is read as that member, the migration is applied, and read
-- again. Nothing is kept.
--
--   psql "$SUPABASE_DB_URL" -X -q -t -A -v with_fix=1 -f mobile/supabase/diagnostics/every_honour_counts_the_whole_record_rehearsal.sql
--
-- `with_fix=1` applies 20261002_01 between the two reads. Without it the
-- "after" read is the live function, and the cases on the new counts FAIL:
-- the rehearsal can say no.
-- Read each NOTICE as  case | expected | got. The last line counts failures.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE honours_cast ON COMMIT DROP AS
  SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id;

CREATE TEMP TABLE honours_before (id uuid, out jsonb) ON COMMIT DROP;
CREATE TEMP TABLE honours_after  (id uuid, out jsonb) ON COMMIT DROP;

-- Each member reads their own summary (can_view_user_data admits oneself).
DO $$
DECLARE m uuid;
BEGIN
  FOR m IN SELECT id FROM honours_cast LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
    INSERT INTO honours_before SELECT m, public.get_public_profile_analytics(m);
  END LOOP;
END $$;

\if :{?with_fix}
\ir ../../../supabase/migrations/20261002_01_every_honour_counts_the_whole_record.sql
\endif

DO $$
DECLARE m uuid;
BEGIN
  FOR m IN SELECT id FROM honours_cast LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
    INSERT INTO honours_after SELECT m, public.get_public_profile_analytics(m);
  END LOOP;
END $$;

CREATE TEMP TABLE honours_cases (label text, expected text, got text) ON COMMIT DROP;

-- 1. Every figure that was there is unchanged (THE RETURNER's excepted: it is meant to move).
INSERT INTO honours_cases
SELECT 'every old figure unchanged, for every member', '0',
       COUNT(*) FILTER (WHERE
         (b.out->'stamps') - 'has_rewatched' IS DISTINCT FROM
         ((a.out->'stamps') - 'has_rewatched' - 'reviews_count' - 'unrated_count' - 'busiest_day_count' - 'genres_count')
         OR b.out->'dna' IS DISTINCT FROM a.out->'dna'
         OR b.out->'autopsy_math' IS DISTINCT FROM a.out->'autopsy_math')::text
FROM honours_before b JOIN honours_after a USING (id);

-- 2. The four new counts are there, as numbers, for every member.
INSERT INTO honours_cases
SELECT 'the four counts present for every member', (SELECT COUNT(*) FROM honours_cast)::text,
       COUNT(*) FILTER (WHERE jsonb_typeof(out->'stamps'->'reviews_count') = 'number'
                         AND jsonb_typeof(out->'stamps'->'unrated_count') = 'number'
                         AND jsonb_typeof(out->'stamps'->'busiest_day_count') = 'number'
                         AND jsonb_typeof(out->'stamps'->'genres_count') = 'number')::text
FROM honours_after;

-- 3. Each count agrees with the same fact asked a different way.
WITH truth AS (
  SELECT c.id,
    (SELECT COUNT(*) FROM public.logs l WHERE l.user_id = c.id AND char_length(l.review) > 20) AS reviews,
    (SELECT COUNT(*) FROM public.logs l WHERE l.user_id = c.id AND (l.rating IS NULL OR l.rating <= 0)) AS unrated,
    (SELECT coalesce(max(n), 0) FROM (
       SELECT COUNT(*) n FROM public.logs l WHERE l.user_id = c.id
        GROUP BY coalesce(l.watched_date, (l.created_at AT TIME ZONE 'UTC')::date)) d) AS busiest,
    (SELECT COUNT(*) FROM (
       SELECT DISTINCT unnest(f.genres) FROM public.films f
        WHERE f.id IN (SELECT l.film_id FROM public.logs l WHERE l.user_id = c.id AND l.film_id > 0)) g) AS genres,
    EXISTS (SELECT 1 FROM public.logs l WHERE l.user_id = c.id AND (l.status = 'rewatched' OR coalesce(l.view_count, 1) > 1)) AS rewatched
  FROM honours_cast c
)
INSERT INTO honours_cases
SELECT 'reviews_count agrees', '0', COUNT(*) FILTER (WHERE (a.out->'stamps'->>'reviews_count')::int IS DISTINCT FROM t.reviews)::text
  FROM truth t JOIN honours_after a USING (id)
UNION ALL
SELECT 'unrated_count agrees', '0', COUNT(*) FILTER (WHERE (a.out->'stamps'->>'unrated_count')::int IS DISTINCT FROM t.unrated)::text
  FROM truth t JOIN honours_after a USING (id)
UNION ALL
SELECT 'busiest_day_count agrees', '0', COUNT(*) FILTER (WHERE (a.out->'stamps'->>'busiest_day_count')::int IS DISTINCT FROM t.busiest)::text
  FROM truth t JOIN honours_after a USING (id)
UNION ALL
SELECT 'genres_count agrees', '0', COUNT(*) FILTER (WHERE (a.out->'stamps'->>'genres_count')::int IS DISTINCT FROM t.genres)::text
  FROM truth t JOIN honours_after a USING (id)
UNION ALL
SELECT 'has_rewatched agrees with the logs', '0', COUNT(*) FILTER (WHERE (a.out->'stamps'->>'has_rewatched')::boolean IS DISTINCT FROM t.rewatched)::text
  FROM truth t JOIN honours_after a USING (id)
UNION ALL
SELECT 'a member who rewatched has THE RETURNER', 'true', (COUNT(*) FILTER (WHERE t.rewatched AND (a.out->'stamps'->>'has_rewatched')::boolean) > 0)::text
  FROM truth t JOIN honours_after a USING (id);

-- 4. Who may read it is unchanged: nobody signed in, and a visitor to a
--    private member they do not follow, are both refused.
DO $$
DECLARE priv uuid; stranger uuid; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  r := public.get_public_profile_analytics((SELECT id FROM honours_cast LIMIT 1));
  INSERT INTO honours_cases VALUES ('nobody signed in is refused', 'forbidden', r->>'error');

  -- A private member, made private for this transaction only if none is.
  SELECT p.id INTO priv FROM public.profiles p JOIN honours_cast c ON c.id = p.id
   WHERE coalesce(p.is_social_private, false) LIMIT 1;
  IF priv IS NULL THEN
    SELECT p.id INTO priv FROM public.profiles p JOIN honours_cast c ON c.id = p.id
     WHERE coalesce(p.role, '') <> 'admin' LIMIT 1;
    UPDATE public.profiles SET is_social_private = true WHERE id = priv;
  END IF;
  IF priv IS NOT NULL THEN
    SELECT c.id INTO stranger FROM honours_cast c
     WHERE c.id <> priv
       AND NOT EXISTS (SELECT 1 FROM public.interactions i WHERE i.user_id = c.id AND i.target_user_id = priv AND i.type = 'follow')
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.id AND p.role = 'admin')
     LIMIT 1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    r := public.get_public_profile_analytics(priv);
    INSERT INTO honours_cases VALUES ('a stranger to a private member is refused', 'forbidden', r->>'error');
  ELSE
    INSERT INTO honours_cases VALUES ('a stranger to a private member is refused', 'forbidden', '(no private member to ask)');
  END IF;
END $$;

DO $$
DECLARE c record; failed int := 0;
BEGIN
  FOR c IN SELECT * FROM honours_cases LOOP
    RAISE NOTICE '% | % | %', c.label, c.expected, c.got;
    IF c.got IS DISTINCT FROM c.expected THEN failed := failed + 1; END IF;
  END LOOP;
  RAISE NOTICE 'FAILED: %', failed;
END $$;

ROLLBACK;
