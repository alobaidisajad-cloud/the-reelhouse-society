-- ════════════════════════════════════════════════════════════════════════════
-- stack_save_rehearsal.sql — is a stack saved whole, or not at all?
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$SUPABASE_DB_URL" -X -q -t -A -f mobile/supabase/diagnostics/stack_save_rehearsal.sql
--
-- Runs against LIVE rules as two members in good standing, inside one
-- transaction that ROLLS BACK. Nothing is kept: the stack is made up (a fixed,
-- made-up id), and every write here is undone with it. Production runs it by
-- hand; db-integration.yml runs it on the sealed copy (e2e/db/rehearsals.mjs).
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and
-- any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 2;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 2) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  a uuid := (SELECT id FROM rehearsal_members WHERE n = 1);
  b uuid := (SELECT id FROM rehearsal_members WHERE n = 2);
  s CONSTANT uuid := '5ac0c0de-0000-4000-8000-00000000cafe';
  t CONSTANT uuid := '5ac0c0de-0000-4000-8000-00000000beef';
  as_member CONSTANT text := '{"sub":"%s","role":"authenticated"}';
  got text;
  n int;
  films3 CONSTANT jsonb := '[{"film_id":11,"film_title":"Sunrise","rank_position":0},{"film_id":22,"film_title":"Greed","rank_position":1},{"film_id":33,"film_title":"Metropolis","rank_position":2}]';
BEGIN
  PERFORM set_config('request.jwt.claims', format(as_member, a), true);

  PERFORM public.save_stack(s, 'Silents', 'Before sound.', false, true, films3, true);
  SELECT count(*) INTO n FROM public.list_items WHERE list_id = s;
  PERFORM pg_temp.rh_case('made with its three films', '3', n::text);

  -- The answer was lost; the offline queue sends it again.
  PERFORM public.save_stack(s, 'Silents', 'Before sound.', false, true, films3, true);
  SELECT count(*) INTO n FROM public.lists WHERE id = s;
  PERFORM pg_temp.rh_case('a replayed create is one stack, not a failure', '1', n::text);

  -- Reordered, one removed, one added.
  PERFORM public.save_stack(s, p_films => '[{"film_id":33,"film_title":"Metropolis","rank_position":0},{"film_id":11,"film_title":"Sunrise","rank_position":1},{"film_id":44,"film_title":"Nosferatu","rank_position":2}]');
  SELECT string_agg(film_id::text, ',' ORDER BY rank_position) INTO got FROM public.list_items WHERE list_id = s;
  PERFORM pg_temp.rh_case('exactly the films saved, in their order', '33,11,44', got);

  PERFORM public.save_stack(s, p_title => 'Silent Masters');
  SELECT title || '/' || (SELECT count(*) FROM public.list_items WHERE list_id = s) INTO got FROM public.lists WHERE id = s;
  PERFORM pg_temp.rh_case('a rename leaves the films alone', 'Silent Masters/3', got);

  PERFORM public.save_stack(s, p_films => '[]');
  SELECT count(*) INTO n FROM public.list_items WHERE list_id = s;
  PERFORM pg_temp.rh_case('emptied when emptied', '0', n::text);

  -- Another member cannot save it.
  PERFORM set_config('request.jwt.claims', format(as_member, b), true);
  got := 'saved';
  BEGIN
    PERFORM public.save_stack(s, p_title => 'Taken');
  EXCEPTION WHEN SQLSTATE 'P0002' THEN got := 'refused';
  END;
  PERFORM pg_temp.rh_case('another member''s save is refused', 'refused', got);

  -- All or nothing: a film the ceilings refuse refuses the whole create.
  PERFORM set_config('request.jwt.claims', format(as_member, a), true);
  got := 'made';
  BEGIN
    PERFORM public.save_stack(t, 'Doomed', '', false, false,
      jsonb_build_array(jsonb_build_object('film_id', 1, 'film_title', 'ok', 'rank_position', 0),
                        jsonb_build_object('film_id', 2, 'film_title', repeat('x', 301), 'rank_position', 1)), true);
  EXCEPTION WHEN check_violation THEN got := 'refused';
  END;
  SELECT count(*) INTO n FROM public.lists WHERE id = t;
  PERFORM pg_temp.rh_case('a refused film leaves no stack behind', 'refused/0', got || '/' || n);
END $$;

-- A visitor cannot call it at all.
SET LOCAL ROLE anon;
DO $$
DECLARE got text := 'called';
BEGIN
  BEGIN
    PERFORM public.save_stack('5ac0c0de-0000-4000-8000-00000000cafe');
  EXCEPTION WHEN insufficient_privilege THEN got := 'refused';
  END;
  PERFORM pg_temp.rh_case('a visitor may not call it', 'refused', got);
END $$;
RESET ROLE;

SELECT pg_temp.rh_verdict();
ROLLBACK;
