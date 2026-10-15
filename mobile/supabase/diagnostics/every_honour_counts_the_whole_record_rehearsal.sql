-- ════════════════════════════════════════════════════════════════════════════
-- every_honour_counts_the_whole_record_rehearsal.sql — 20261002_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/every_honour_counts_the_whole_record_rehearsal.sql
--
-- Every member's summary is read as that member: each honour's count is there,
-- as a number, and agrees with the same fact asked of the logs another way;
-- nobody signed in, and a stranger to a private member, are refused.
-- Production runs it by hand; db-integration.yml runs it on the sealed copy
-- (e2e/db/rehearsals.mjs). Read each NOTICE as  case|expected|got ; the last
-- line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

CREATE TEMP TABLE honours_cast ON COMMIT DROP AS
  SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id;
SELECT pg_temp.rh_need('members with a sign-in', (SELECT count(*) FROM honours_cast), 2) AS done \gset rh_

CREATE TEMP TABLE honours_after (id uuid, out jsonb) ON COMMIT DROP;

-- Each member reads their own summary (can_view_user_data admits oneself).
DO $$
DECLARE m uuid;
BEGIN
  FOR m IN SELECT id FROM honours_cast LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
    INSERT INTO honours_after SELECT m, public.get_public_profile_analytics(m);
  END LOOP;
END $$;

-- 1. The four counts are there, as numbers, for every member.
DO $$ BEGIN
  PERFORM pg_temp.rh_case('the four counts present for every member', (SELECT count(*) FROM honours_cast)::text,
    (SELECT count(*) FILTER (WHERE jsonb_typeof(out->'stamps'->'reviews_count') = 'number'
                              AND jsonb_typeof(out->'stamps'->'unrated_count') = 'number'
                              AND jsonb_typeof(out->'stamps'->'busiest_day_count') = 'number'
                              AND jsonb_typeof(out->'stamps'->'genres_count') = 'number')::text
       FROM honours_after));
END $$;

-- 2. Each count agrees with the same fact asked a different way.
CREATE TEMP TABLE honours_truth ON COMMIT DROP AS
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
FROM honours_cast c;

DO $$ BEGIN
  PERFORM pg_temp.rh_case('reviews_count agrees', '0', (SELECT COUNT(*) FILTER (WHERE (a.out->'stamps'->>'reviews_count')::int IS DISTINCT FROM t.reviews)::text
    FROM honours_truth t JOIN honours_after a USING (id)));
  PERFORM pg_temp.rh_case('unrated_count agrees', '0', (SELECT COUNT(*) FILTER (WHERE (a.out->'stamps'->>'unrated_count')::int IS DISTINCT FROM t.unrated)::text
    FROM honours_truth t JOIN honours_after a USING (id)));
  PERFORM pg_temp.rh_case('busiest_day_count agrees', '0', (SELECT COUNT(*) FILTER (WHERE (a.out->'stamps'->>'busiest_day_count')::int IS DISTINCT FROM t.busiest)::text
    FROM honours_truth t JOIN honours_after a USING (id)));
  PERFORM pg_temp.rh_case('genres_count agrees', '0', (SELECT COUNT(*) FILTER (WHERE (a.out->'stamps'->>'genres_count')::int IS DISTINCT FROM t.genres)::text
    FROM honours_truth t JOIN honours_after a USING (id)));
  PERFORM pg_temp.rh_case('has_rewatched agrees with the logs', '0', (SELECT COUNT(*) FILTER (WHERE (a.out->'stamps'->>'has_rewatched')::boolean IS DISTINCT FROM t.rewatched)::text
    FROM honours_truth t JOIN honours_after a USING (id)));
  PERFORM pg_temp.rh_case('a member who rewatched has THE RETURNER', 'true',
    (SELECT (COUNT(*) FILTER (WHERE t.rewatched AND (a.out->'stamps'->>'has_rewatched')::boolean) > 0)::text
       FROM honours_truth t JOIN honours_after a USING (id)));
END $$;

-- 3. Who may read it: nobody signed in, and a visitor to a private member they
--    do not follow, are both refused.
DO $$
DECLARE priv uuid; stranger uuid; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  r := public.get_public_profile_analytics((SELECT id FROM honours_cast LIMIT 1));
  PERFORM pg_temp.rh_case('nobody signed in is refused', 'forbidden', r->>'error');

  -- A private member, made private for this transaction only if none is.
  SELECT p.id INTO priv FROM public.profiles p JOIN honours_cast c ON c.id = p.id
   WHERE coalesce(p.is_social_private, false) LIMIT 1;
  IF priv IS NULL THEN
    SELECT p.id INTO priv FROM public.profiles p JOIN honours_cast c ON c.id = p.id
     WHERE coalesce(p.role, '') <> 'admin' LIMIT 1;
    UPDATE public.profiles SET is_social_private = true WHERE id = priv;
  END IF;
  priv := pg_temp.rh_found('a private member (or one to make private)', priv);
  stranger := pg_temp.rh_found('a member who neither follows the private member nor is an admin', (
    SELECT c.id FROM honours_cast c
     WHERE c.id <> priv
       AND NOT EXISTS (SELECT 1 FROM public.interactions i WHERE i.user_id = c.id AND i.target_user_id = priv AND i.type = 'follow')
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.id AND p.role = 'admin')
     LIMIT 1));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  r := public.get_public_profile_analytics(priv);
  PERFORM pg_temp.rh_case('a stranger to a private member is refused', 'forbidden', r->>'error');
END $$;

SELECT pg_temp.rh_verdict();
ROLLBACK;
