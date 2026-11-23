-- ════════════════════════════════════════════════════════════════════════════
-- the_lobbys_notices_are_found_by_their_piece_rehearsal.sql — 20261122_64. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_lobbys_notices_are_found_by_their_piece_rehearsal.sql
--
-- An index built CONCURRENTLY cannot be built inside this file's transaction, so the train builds 20261122_64
-- alone, in its turn, and this checks it holds: the index is there and whole, a piece's Lobby notice is
-- asked for by one lookup of it, and of two planted notices with the same piece, the Lobby's is found
-- through it and another kind's is not.
-- Every row here is undone with the transaction. Read each NOTICE as  case|expected|got ; the last line
-- is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
SELECT pg_temp.rh_case('the index of the Lobby''s notices is built, and whole', 'true',
  coalesce((SELECT i.indisvalid::text FROM pg_index i WHERE i.indexrelid = to_regclass('public.notifications_lobby_told')), 'missing')) AS done \gset rh_

CREATE TEMP TABLE lt_member ON COMMIT DROP AS
  SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id ORDER BY u.created_at LIMIT 1;
SELECT pg_temp.rh_need('a member', (SELECT count(*) FROM lt_member), 1) AS done \gset rh_
-- Two notices naming one planted piece: the Lobby's, and another kind's.
INSERT INTO public.notifications (user_id, type, message, group_key)
SELECT m.id, 'featured', 'Your log hangs in the Lobby today.', 'lobby:log:5eed0000-0000-4000-8000-0000000b0c64' FROM lt_member m;
INSERT INTO public.notifications (user_id, type, message, group_key)
SELECT m.id, 'system', 'A word of the house.', 'lobby:log:5eed0000-0000-4000-8000-0000000b0c65' FROM lt_member m;

SET LOCAL enable_seqscan = off;
CREATE FUNCTION pg_temp.lt_plan() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := ''; r record;
BEGIN
  FOR r IN EXPLAIN SELECT 1 FROM public.notifications n
                    WHERE n.type = 'featured' AND n.group_key = 'lobby:log:5eed0000-0000-4000-8000-0000000b0c64' LOOP
    v := v || r."QUERY PLAN" || ' ';
  END LOOP;
  RETURN v;
END $$;
SELECT pg_temp.rh_case('a piece''s Lobby notice is asked for by one lookup of it', 'true',
  (position('notifications_lobby_told' in (SELECT pg_temp.lt_plan())) > 0)::text) AS done \gset rh_
SELECT pg_temp.rh_case('the Lobby''s notice of the piece is found, and not another kind''s', 'true|false',
  (EXISTS (SELECT 1 FROM public.notifications n WHERE n.type = 'featured'
             AND n.group_key = 'lobby:log:5eed0000-0000-4000-8000-0000000b0c64'))::text || '|'
    || (EXISTS (SELECT 1 FROM public.notifications n WHERE n.type = 'featured'
             AND n.group_key = 'lobby:log:5eed0000-0000-4000-8000-0000000b0c65'))::text) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
