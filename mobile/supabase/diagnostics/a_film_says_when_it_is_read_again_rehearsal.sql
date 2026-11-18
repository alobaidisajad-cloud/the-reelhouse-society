-- ════════════════════════════════════════════════════════════════════════════
-- a_film_says_when_it_is_read_again_rehearsal.sql — 20261119_03. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_film_says_when_it_is_read_again_rehearsal.sql --with-train
--
-- The train applies 20261119_03 here (with_train), 20261119_00 to 20261119_02 already applied; a sealed copy already holds it.
-- Then the house and members in good standing, acting as themselves, find what it fixes holding (review round 13).
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 4;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 4) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_03_a_film_says_when_it_is_read_again.sql
\endif

-- ── H-C5.locks ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
UPDATE public.interactions SET created_at = created_at - interval '1 hour'
 WHERE user_id IN (SELECT id FROM rehearsal_members) AND created_at = now();
-- ── H-C5 (locks) rehearsal · the films' read bookkeeping is there, nullable, with no default ──
-- As the house: three columns, each nullable and empty by default, so no film already kept is rewritten.
SELECT pg_temp.rh_case('the films keep their read bookkeeping: three columns, nullable, no default',
  'release_date:date:YES:none,reread_after:timestamp with time zone:YES:none,sync_reads:smallint:YES:none',
  (SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, 'none'), ',' ORDER BY column_name)
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'films'
      AND column_name IN ('release_date', 'reread_after', 'sync_reads'))) AS done \gset rh_
SELECT count(*) AS films FROM public.films \gset c5_

-- As a member: the film page's verdict columns are read from the catalogue as before, every film.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.rh_case('a member reads every film''s verdict from the catalogue as before', :'c5_films',
  (SELECT count(*) FROM (SELECT f.avg_rating, f.rating_count, f.log_count FROM public.films f) x)::text) AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
