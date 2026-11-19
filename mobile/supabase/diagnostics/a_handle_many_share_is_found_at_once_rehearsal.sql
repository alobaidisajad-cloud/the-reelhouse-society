-- ════════════════════════════════════════════════════════════════════════════
-- a_handle_many_share_is_found_at_once_rehearsal.sql — 20261119_25. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_handle_many_share_is_found_at_once_rehearsal.sql --with-train
--
-- The train applies 20261119_25 here (with_train), every car before it already applied; a sealed copy
-- already holds it. Round 12's search_members is kept beside it, in this transaction alone (pg_temp), and
-- members in good standing, and a visitor, ask both the same questions of the house's own members: the
-- whole handle, its beginning, a letter, a piece, a name's beginning, handles only, a page and the next
-- past its cursor, an escaped wildcard, a word none holds and none at all. Each answer is the same
-- members, each at the same closeness, in the same order.
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
-- Member 1's handle and name, the words every question is made of.
CREATE TEMP TABLE sm_who ON COMMIT DROP AS
  SELECT m.n, p.username, p.display_name FROM rehearsal_members m JOIN public.profiles p ON p.id = m.id;
GRANT SELECT ON sm_who TO anon, authenticated;
SELECT pg_temp.rh_need('a member with a handle', (SELECT count(*) FROM sm_who WHERE n = 1 AND username <> ''), 1) AS done \gset rh_

-- Round 12's search, as 20261118_01 made it, kept beside the new one for this transaction alone.
CREATE FUNCTION pg_temp.sm_before(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, username text, avatar_url text, role text, closeness integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT m.id, m.username, m.avatar_url, m.role, m.closeness
    FROM (
      SELECT p.id, p.username, p.avatar_url, p.role,
             CASE WHEN p.username ILIKE p_pattern ESCAPE '\' THEN 0
                  WHEN p.username ILIKE p_pattern || '%' ESCAPE '\' THEN 1
                  WHEN NOT COALESCE(p_handles_only, false) AND p.display_name ILIKE p_pattern || '%' ESCAPE '\' THEN 2
                  ELSE 3 END AS closeness
        FROM public.profiles p
       WHERE COALESCE(p_pattern, '') <> ''
         AND (p.username ILIKE '%' || p_pattern || '%' ESCAPE '\'
              OR (NOT COALESCE(p_handles_only, false) AND p.display_name ILIKE '%' || p_pattern || '%' ESCAPE '\'))
         AND NOT COALESCE(p.id = ANY ((SELECT public.hidden_authors())::uuid[]), false)
    ) m
   WHERE p_cursor_closeness IS NULL OR (m.closeness, m.username) > (p_cursor_closeness, p_cursor_username)
   ORDER BY m.closeness, m.username
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
$$;
-- Supabase gives a new function to no one (its default privileges): the readers asked as below are granted it.
GRANT EXECUTE ON FUNCTION pg_temp.sm_before(text, boolean, integer, text, integer) TO authenticated, anon;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261119_25_a_handle_many_share_is_found_at_once.sql
\endif

-- As member 1, themselves.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: its whole handle, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT username FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT username FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: its first two letters, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT left(username, 2) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT left(username, 2) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: its first letter, the most a page holds, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT left(username, 1) FROM sm_who WHERE n = 1), false, NULL, NULL, 51) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT left(username, 1) FROM sm_who WHERE n = 1), false, NULL, NULL, 51) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: its first letter, handles only, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT left(username, 1) FROM sm_who WHERE n = 1), true, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT left(username, 1) FROM sm_who WHERE n = 1), true, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: a piece of its handle, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT substr(username, 2, 3) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT substr(username, 2, 3) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: the beginning of its name, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT left(coalesce(display_name, username), 3) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT left(coalesce(display_name, username), 3) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: a page of two, then the next past its cursor, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT left(username, 1) FROM sm_who WHERE n = 1), false, 1, (SELECT username FROM sm_who WHERE n = 1), 2) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT left(username, 1) FROM sm_who WHERE n = 1), false, 1, (SELECT username FROM sm_who WHERE n = 1), 2) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: a cursor in the last closeness, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT left(username, 1) FROM sm_who WHERE n = 1), false, 3, '', 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT left(username, 1) FROM sm_who WHERE n = 1), false, 3, '', 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: an escaped underscore, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members('\_', false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before('\_', false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: a word none holds, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members('rh-zz-none', false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before('rh-zz-none', false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a member: no words, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members('', false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before('', false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
RESET ROLE;

-- As a visitor.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true) AS done \gset rh_
SET LOCAL ROLE anon;
SELECT pg_temp.rh_case('as a visitor: its whole handle, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT username FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT username FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a visitor: its first two letters, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT left(username, 2) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT left(username, 2) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a visitor: a piece of its handle, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT substr(username, 2, 3) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT substr(username, 2, 3) FROM sm_who WHERE n = 1), false, NULL, NULL, 20) x) b), ''))::text)) AS done \gset rh_
SELECT pg_temp.rh_case('as a visitor: a page of two, then the next past its cursor, the same members in the same order', 'true',
  (SELECT (coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM public.search_members((SELECT left(username, 1) FROM sm_who WHERE n = 1), false, 1, (SELECT username FROM sm_who WHERE n = 1), 2) x) a), '')
         = coalesce((SELECT string_agg(id::text || ':' || closeness, ',' ORDER BY ord) FROM (SELECT x.*, row_number() OVER () AS ord FROM pg_temp.sm_before((SELECT left(username, 1) FROM sm_who WHERE n = 1), false, 1, (SELECT username FROM sm_who WHERE n = 1), 2) x) b), ''))::text)) AS done \gset rh_
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
