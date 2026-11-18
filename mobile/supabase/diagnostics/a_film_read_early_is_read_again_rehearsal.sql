-- ════════════════════════════════════════════════════════════════════════════
-- a_film_read_early_is_read_again_rehearsal.sql — 20261119_17. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_film_read_early_is_read_again_rehearsal.sql --with-train
--
-- The train applies 20261119_17 here (with_train), 20261119_00 to 20261119_16 already applied; a sealed copy already holds it.
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

-- The piece's own tables, made before the train, empty: the piece fills them as it runs.
CREATE TEMP TABLE rh_c5_taste (at text, v jsonb) ON COMMIT DROP;
GRANT ALL ON rh_c5_taste TO authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_17_a_film_read_early_is_read_again.sql
\endif

-- ── H-C5 ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
DELETE FROM public.interaction_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interaction_churn WHERE user_id IN (SELECT id FROM rehearsal_members);
-- ── H-C5 rehearsal · a film read too early is claimed again, and a taste counts a film known only with its details ──
-- As the house: the films below stand for every case. The claim's films carry ids below zero (no
-- TMDB film has one, so production's films sort after them); the taste's films are of ids no TMDB
-- film has yet. The films nobody has read in production are held as claimed for this transaction,
-- so the claim's first answer is the rehearsal's own.
SELECT set_config('request.jwt.claims', '', true) AS done;
UPDATE public.films SET sync_claimed_at = now()
 WHERE (synced_at IS NULL OR popularity IS NULL) AND sync_failed < 3;

INSERT INTO public.films (id, title, year, genres, cast_ids, cast_names, cast_profiles, director_id, director,
                          popularity, synced_at, release_date, reread_after, sync_reads)
VALUES
  -- never read
  (-990001, 'Rehearsal: never read',             NULL, '{}', '{}', '{}', '{}', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  -- read before it settled, its time come (sync-films set reread_after)
  (-990002, 'Rehearsal: read early, now due',    2026, '{}', '{}', '{}', '{}', NULL, NULL, 1.5, '1900-01-01', '2026-06-01', '1900-01-01', 0),
  -- read before the house counted, blank: may have been read too early
  (-990003, 'Rehearsal: read blank, uncounted',  1999, '{}', '{}', '{}', '{}', NULL, NULL, 1.5, '1900-01-02', NULL, NULL, NULL),
  -- settled, whole
  (-990004, 'Rehearsal: settled',                1999, '{Drama}', '{7}', '{An Actor}', '{""}', 9, 'A Director', 1.5, '1900-01-01', '1999-05-01', NULL, 1),
  -- read before the house counted, whole, of an old year: never read again
  (-990005, 'Rehearsal: whole, uncounted',       1999, '{Drama}', '{7}', '{An Actor}', '{""}', 9, 'A Director', 1.5, '1900-01-01', NULL, NULL, NULL),
  -- read early, its time not come
  (-990006, 'Rehearsal: read early, not due',    2027, '{}', '{}', '{}', '{}', NULL, NULL, 1.5, now(), '2027-06-01', now() + interval '30 days', 0),
  -- read early and due, but struck out by TMDB three times
  (-990007, 'Rehearsal: due, retired',           2026, '{}', '{}', '{}', '{}', NULL, NULL, 1.5, '1900-01-01', '2026-06-01', '1900-01-01', 0)
ON CONFLICT (id) DO NOTHING;
UPDATE public.films SET sync_failed = 3 WHERE id = -990007;


-- As sync-films (the service role, the claim's one caller): the films never read are taken first.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE rh_c5_first ON COMMIT DROP AS SELECT id FROM public.claim_films_to_sync(1);
CREATE TEMP TABLE rh_c5_then ON COMMIT DROP AS SELECT id, sync_reads FROM public.claim_films_to_sync(2);
CREATE TEMP TABLE rh_c5_more ON COMMIT DROP AS SELECT id FROM public.claim_films_to_sync(100);
RESET ROLE;
SELECT pg_temp.rh_case('the film never read is taken first', '-990001',
  (SELECT string_agg(id::text, ',' ORDER BY id) FROM rh_c5_first)) AS done \gset rh_
SELECT pg_temp.rh_case('then the two films read too early (the oldest due)', '-990003,-990002',
  (SELECT string_agg(id::text, ',' ORDER BY id) FROM rh_c5_then)) AS done \gset rh_
SELECT pg_temp.rh_case('each is handed back with its settled reads, so sync-films reads no more', '-990003:none,-990002:0',
  (SELECT string_agg(id::text || ':' || coalesce(sync_reads::text, 'none'), ',' ORDER BY id) FROM rh_c5_then)) AS done \gset rh_
SELECT pg_temp.rh_case('a film settled, whole, not due, retired or already claimed is never taken', '',
  coalesce((SELECT string_agg(id::text, ',' ORDER BY id) FROM rh_c5_more WHERE id < 0), '')) AS done \gset rh_
SELECT pg_temp.rh_case('each film taken is held as claimed', '3',
  (SELECT count(*) FROM public.films WHERE id IN (-990001, -990002, -990003) AND sync_claimed_at IS NOT NULL)::text) AS done \gset rh_

-- A member's taste: seven films logged. Unknown: the one never read, the one read before it settled,
-- and the one read blank before the house counted, of a year it may have been read early in. Known:
-- the whole one, the castless one read three times settled, the castless one read once settled and
-- still to be read again, and the one read before the house counted, of a year long settled.
INSERT INTO public.films (id, title, year, genres, cast_ids, cast_names, cast_profiles, director_id, director,
                          popularity, synced_at, release_date, reread_after, sync_reads)
VALUES
  (1999990001, 'Rehearsal taste: never read',      NULL, '{}', '{}', '{}', '{}', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (1999990002, 'Rehearsal taste: whole',           1999, '{Drama}', '{7}', '{An Actor}', '{""}', 9, 'A Director', 1.5, now(), '1999-05-01', NULL, 1),
  (1999990003, 'Rehearsal taste: settled, castless', 1999, '{Documentary}', '{}', '{}', '{}', 9, 'A Director', 1.5, now(), '1999-05-01', NULL, 3),
  (1999990004, 'Rehearsal taste: read early',      2026, '{}', '{}', '{}', '{}', NULL, NULL, 1.5, now(), '2026-12-01', now() + interval '30 days', 0),
  (1999990005, 'Rehearsal taste: blank, uncounted', 1999, '{}', '{}', '{}', '{}', NULL, NULL, 1.5, now(), NULL, NULL, NULL),
  (1999990006, 'Rehearsal taste: castless, read once settled', 1999, '{Documentary}', '{}', '{}', '{}', 9, 'A Director', 1.5, now(), '1999-05-01', now() + interval '14 days', 1),
  (1999990007, 'Rehearsal taste: blank, uncounted, this year', 2026, '{}', '{}', '{}', '{}', NULL, NULL, 1.5, now(), NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
-- The member keeps none of the seven already (a rehearsal before may have left none; this one adds them).
DELETE FROM public.logs WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1)
   AND film_id BETWEEN 1999990001 AND 1999990007;

-- As the member: their taste read before and after their five films are logged, as the app logs one.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
INSERT INTO rh_c5_taste SELECT 'before', public.get_taste_profile((SELECT id FROM rehearsal_members WHERE n = 1))::jsonb;
INSERT INTO public.logs (user_id, film_id, film_title, watched_date, status)
SELECT (SELECT id FROM rehearsal_members WHERE n = 1), f.id, f.title, current_date, 'watched'
  FROM (VALUES (1999990001, 'Rehearsal taste: never read'), (1999990002, 'Rehearsal taste: whole'),
               (1999990003, 'Rehearsal taste: settled, castless'), (1999990004, 'Rehearsal taste: read early'),
               (1999990005, 'Rehearsal taste: blank, uncounted'), (1999990006, 'Rehearsal taste: castless, read once settled'),
               (1999990007, 'Rehearsal taste: blank, uncounted, this year')) AS f(id, title);
INSERT INTO rh_c5_taste SELECT 'after', public.get_taste_profile((SELECT id FROM rehearsal_members WHERE n = 1))::jsonb;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- Seven more films counted, four of them known; their genre, director and actor drawn.
CREATE TEMP TABLE rh_c5_ba ON COMMIT DROP AS
  SELECT (SELECT v FROM rh_c5_taste WHERE at = 'before') AS b, (SELECT v FROM rh_c5_taste WHERE at = 'after') AS a;
SELECT pg_temp.rh_case('the member reads their own taste', 'false',
  (SELECT (a ? 'error' OR b ? 'error')::text FROM rh_c5_ba)) AS done \gset rh_
SELECT pg_temp.rh_case('the seven films logged are counted', '7',
  (SELECT ((a->>'films_total')::int - (b->>'films_total')::int)::text FROM rh_c5_ba)) AS done \gset rh_
SELECT pg_temp.rh_case('of the seven, the four read whole or once settled are counted known', '4',
  (SELECT ((a->>'films_known')::int - (b->>'films_known')::int)::text FROM rh_c5_ba)) AS done \gset rh_
SELECT pg_temp.rh_case('the films read whole are drawn in the taste: their genre, director and actor', 'true',
  (SELECT (EXISTS (SELECT 1 FROM jsonb_array_elements(a->'genres') g WHERE g->>'name' = 'Documentary')
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(a->'directors') d WHERE (d->>'id')::int = 9)
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(a->'actors') x WHERE (x->>'id')::int = 7))::text FROM rh_c5_ba)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
