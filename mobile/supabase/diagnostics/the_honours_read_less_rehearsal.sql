-- ════════════════════════════════════════════════════════════════════════════
-- the_honours_read_less_rehearsal.sql — 20261112_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_honours_read_less_rehearsal.sql --with-train
--
-- The honours and passport of the members it reads (the 200 with the most logs, the 100 with the
-- most autopsies, 100 more), each as they ask for their own, are read by
-- get_public_profile_analytics as it stands; then the train applies 20261112_01 here (with_train),
-- and each is read again: the same answer for every one (on the load lab's full house too, where
-- the train runs this before it applies anything). The three decades of most logs are compared by
-- their counts: two decades of the same count may stand in either order, as they could before. A
-- private member read by a stranger is refused. Read each NOTICE as case|expected|got ; the last
-- line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rh_member (id uuid) ON COMMIT DROP;
INSERT INTO rh_member
  SELECT user_id FROM (SELECT user_id FROM public.logs GROUP BY user_id ORDER BY count(*) DESC, user_id LIMIT 200) most
  UNION
  SELECT user_id FROM (SELECT user_id FROM public.logs WHERE is_autopsied = true AND autopsy IS NOT NULL
                        GROUP BY user_id ORDER BY count(*) DESC, user_id LIMIT 100) autopsied
  UNION
  SELECT id FROM (SELECT id FROM public.profiles ORDER BY id LIMIT 100) any_member;
SELECT pg_temp.rh_found('a member with logs', (SELECT user_id FROM public.logs LIMIT 1)) AS done \gset rh_

-- Each member's honours as they ask for their own.
CREATE TEMP TABLE rh_honours (pass text, member uuid, said jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.rh_read(p_pass text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m record;
BEGIN
  FOR m IN SELECT id FROM rh_member LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m.id, 'role', 'authenticated')::text, true);
    INSERT INTO rh_honours SELECT p_pass, m.id, public.get_public_profile_analytics(m.id);
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
-- The answer with its three decades read as their counts, in order: a tie may stand either way.
CREATE FUNCTION pg_temp.rh_plain(j jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT CASE WHEN jsonb_typeof(j #> '{dna,top_decades}') = 'array'
    THEN jsonb_set(j, '{dna,top_decades}', coalesce((
      SELECT jsonb_agg(kv.v ORDER BY kv.v::text::numeric DESC)
        FROM jsonb_array_elements(j #> '{dna,top_decades}') e, LATERAL jsonb_each(e) kv(k, v)), '[]'::jsonb))
    ELSE j END
$$;
SELECT pg_temp.rh_read('before') AS done \gset rh_

-- The train applies it here first (with_train); a sealed copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261112_01_the_honours_read_less.sql
\endif

SELECT pg_temp.rh_read('after') AS done \gset rh_

SELECT pg_temp.rh_case('every member''s honours: the same answer', '0',
  (SELECT count(*) FROM rh_honours b JOIN rh_honours a ON a.member = b.member AND a.pass = 'after'
    WHERE b.pass = 'before' AND pg_temp.rh_plain(a.said) IS DISTINCT FROM pg_temp.rh_plain(b.said))::text) AS done \gset rh_
SELECT pg_temp.rh_case('every member read, twice', (SELECT count(*) * 2 FROM rh_member)::text,
  (SELECT count(*) FROM rh_honours)::text) AS done \gset rh_
-- The answer read the new way: only what is counted, the films joined once, the genres grouped
-- (what it costs is not something a rolled-back rehearsal can time, so the function as stored says it).
SELECT pg_temp.rh_case('each log carries only what is counted, the films joined once, the genres grouped', 'true',
  (SELECT p.prosrc LIKE '%films_read AS MATERIALIZED%' AND p.prosrc NOT LIKE '%SELECT *,%'
          AND p.prosrc NOT LIKE '%COUNT(DISTINCT g)%'
     FROM pg_proc p WHERE p.oid = 'public.get_public_profile_analytics(uuid)'::regprocedure)::text) AS done \gset rh_

-- A private member, read by someone who does not follow them: refused.
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000aa', 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.rh_case('a private member, read by a stranger, is refused', '{"error": "forbidden"}',
  public.get_public_profile_analytics((SELECT id FROM public.profiles WHERE is_social_private = true ORDER BY id LIMIT 1))::text) AS done \gset rh_
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
