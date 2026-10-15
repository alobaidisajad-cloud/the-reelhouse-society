-- ════════════════════════════════════════════════════════════════════════════
-- 20261015_03 — a new function in public is run only by the roles its migration grants.
-- ════════════════════════════════════════════════════════════════════════════
-- Supabase sets this database so that each function the postgres role makes in
-- public may be run by visitors (anon) and members (authenticated) unless its
-- migration takes that away. So the three functions of 20261015_01, granted to
-- members alone, could be run by visitors too: send_salon_typing found no seat
-- for them and sent nothing, and the two channel rules said only whether a
-- salon is open, which a visitor may see anyway.
-- Visitors lose those three, and from now on a new function starts closed to
-- both: each migration grants it to the roles that call it, by name, and one
-- that forgets fails closed.
-- Undo: mobile/supabase/migrations-down/20261015_03_a_new_function_is_closed_until_granted.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses them as a visitor: TestFlight build 41 and the website call none of the three
REVOKE EXECUTE ON FUNCTION
    public.salon_channel_readable(text),
    public.salon_channel_seated(text),
    public.send_salon_typing(uuid)
  FROM anon;

-- add-only (1): no shipped client uses it: it changes only functions made after it, and every function a client calls exists
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
