-- ════════════════════════════════════════════════════════════════════════════
-- a_member_is_found_by_their_short_words_rehearsal.sql — 20261122_14. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_member_is_found_by_their_short_words_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_14
-- alone, in its turn, and this checks it holds: the index is there and whole, and a member planted with a
-- rare pair of letters in their handle, and another in their name, is found through it.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the members'' short words is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.profiles_short_grams')), 'missing')) AS done \gset rh_

-- Two members: one whose handle holds a pair of letters no other member holds, one whose name does.
CREATE TEMP TABLE msw_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n FROM auth.users u JOIN public.profiles p ON p.id = u.id
   ORDER BY u.created_at LIMIT 2;
SELECT pg_temp.rh_need('two members', (SELECT count(*) FROM msw_members), 2) AS done \gset rh_
-- (A handle holds lowercase letters, digits and underscores; md5's letters stop at f, so no other planted
-- piece holds the q.)
UPDATE public.profiles SET username = 'rh_9q_' || substr(md5(id::text), 1, 6) WHERE id = (SELECT id FROM msw_members WHERE n = 1);
UPDATE public.profiles SET display_name = 'Rh ǁǂ' WHERE id = (SELECT id FROM msw_members WHERE n = 2);

SET LOCAL enable_seqscan = off;
CREATE FUNCTION pg_temp.msw_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXPLAIN SELECT p.id FROM public.profiles p WHERE private.search_grams(p.username, p.display_name) @> ARRAY['9q'] LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('a pair of letters is looked up in it', 'true', (position('profiles_short_grams' in pg_temp.msw_plan()) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the member whose handle holds it is found, and the one whose name holds the other', '1|2',
  (SELECT (SELECT string_agg(m.n::text, ',') FROM public.profiles p JOIN msw_members m ON m.id = p.id
            WHERE private.search_grams(p.username, p.display_name) @> ARRAY['9q']) || '|'
       || (SELECT string_agg(m.n::text, ',') FROM public.profiles p JOIN msw_members m ON m.id = p.id
            WHERE private.search_grams(p.username, p.display_name) @> ARRAY['ǁǂ']))) AS done \gset rh_

-- A member writes their own name as themselves: the index works out its pieces as the member.
GRANT SELECT ON msw_members TO authenticated;
CREATE FUNCTION pg_temp.msw_writes_own_name() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM msw_members WHERE n = 2), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE public.profiles SET display_name = 'Rh ǁǂ Again' WHERE id = (SELECT id FROM msw_members WHERE n = 2);
    v := 'written';
  EXCEPTION WHEN OTHERS THEN v := SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.msw_writes_own_name() TO authenticated;
SELECT pg_temp.rh_case('a member writes their own name, as themselves', 'written', (SELECT pg_temp.msw_writes_own_name())) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
