-- ════════════════════════════════════════════════════════════════════════════
-- db_security.test.sql — REAL database security integration tests
-- ════════════════════════════════════════════════════════════════════════════
-- Runs against a throwaway Postgres (locally or in CI — see
-- .github/workflows/db-integration.yml). Unlike the Jest suite (which mocks
-- Supabase), this exercises the ACTUAL RLS policies + helper logic that protect
-- your data — the exact layer where the 2026-06-26 gaps were hiding.
--
-- It rebuilds a minimal Supabase-compatible environment (auth.uid() shim, roles,
-- the privacy helper, the real policies) and asserts the security guarantees by
-- impersonating different users. Any failed assertion RAISEs and the script exits
-- non-zero (fails CI). Self-contained and idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Supabase-compatible shim (roles + auth.uid) ──────────────────────────────
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ── Minimal schema (mirrors the columns the real policies depend on) ─────────
DROP TABLE IF EXISTS public.notifications, public.interactions, public.logs, public.profiles CASCADE;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  username text,
  is_social_private boolean DEFAULT false
);
CREATE TABLE public.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id),
  review text
);
CREATE TABLE public.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  target_user_id uuid,
  type text
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  from_user_id uuid,
  type text,
  message text NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- ── The REAL privacy helper (identical to production) ────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_user_data(target_uid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE is_private boolean; is_following boolean;
BEGIN
  IF auth.uid() = target_uid THEN RETURN TRUE; END IF;
  SELECT is_social_private INTO is_private FROM public.profiles WHERE id = target_uid;
  IF NOT COALESCE(is_private, false) THEN RETURN TRUE; END IF;
  SELECT EXISTS (SELECT 1 FROM public.interactions
    WHERE type='follow' AND user_id=auth.uid() AND target_user_id=target_uid) INTO is_following;
  RETURN is_following;
END $$;

-- ── The REAL policies under test ─────────────────────────────────────────────
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY logs_owner ON public.logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY logs_select_authorized ON public.logs FOR SELECT USING (public.can_view_user_data(user_id));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_select_own ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notif_no_client_insert ON public.notifications FOR INSERT TO authenticated, anon WITH CHECK (false);

-- ── Seed ─────────────────────────────────────────────────────────────────────
-- alice = public, bob = private, carol follows bob, dave = unrelated.
INSERT INTO public.profiles (id, username, is_social_private) VALUES
  ('11111111-1111-1111-1111-111111111111','alice', false),
  ('22222222-2222-2222-2222-222222222222','bob',   true),
  ('33333333-3333-3333-3333-333333333333','carol', false),
  ('44444444-4444-4444-4444-444444444444','dave',  false);
INSERT INTO public.logs (user_id, review) VALUES
  ('11111111-1111-1111-1111-111111111111','alice public review'),
  ('22222222-2222-2222-2222-222222222222','bob private review');
INSERT INTO public.interactions (user_id, target_user_id, type) VALUES
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','follow');

-- ── Assertion helpers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.as_count(p_role text, p_uid text, p_sql text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid,''), true);
  EXECUTE p_sql INTO n;
  RESET ROLE;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_actual int, p_expected int, p_msg text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL: % (expected %, got %)', p_msg, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'PASS: %', p_msg;
END $$;

-- ── Privacy RLS assertions ───────────────────────────────────────────────────
DO $$
DECLARE bob uuid := '22222222-2222-2222-2222-222222222222';
        alice uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  -- anonymous (logged out)
  PERFORM pg_temp.expect(
    pg_temp.as_count('anon', NULL, format('SELECT count(*) FROM public.logs WHERE user_id=%L', alice)),
    1, 'anon CAN see a public user''s logs');
  PERFORM pg_temp.expect(
    pg_temp.as_count('anon', NULL, format('SELECT count(*) FROM public.logs WHERE user_id=%L', bob)),
    0, 'anon CANNOT see a private user''s logs');
  -- stranger (logged in, not following)
  PERFORM pg_temp.expect(
    pg_temp.as_count('authenticated', '44444444-4444-4444-4444-444444444444',
      format('SELECT count(*) FROM public.logs WHERE user_id=%L', bob)),
    0, 'non-follower CANNOT see a private user''s logs');
  -- follower
  PERFORM pg_temp.expect(
    pg_temp.as_count('authenticated', '33333333-3333-3333-3333-333333333333',
      format('SELECT count(*) FROM public.logs WHERE user_id=%L', bob)),
    1, 'a follower CAN see a private user''s logs');
  -- owner
  PERFORM pg_temp.expect(
    pg_temp.as_count('authenticated', bob::text,
      format('SELECT count(*) FROM public.logs WHERE user_id=%L', bob)),
    1, 'the owner CAN see their own private logs');
END $$;

-- ── Notification-spoofing assertion (must be blocked) ────────────────────────
DO $$
DECLARE blocked boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  BEGIN
    INSERT INTO public.notifications (user_id, from_user_id, type, message)
    VALUES ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','follow','spoofed!');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    blocked := true;
  END;
  RESET ROLE;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL: a normal user was able to insert a spoofed notification';
  END IF;
  RAISE NOTICE 'PASS: client notification INSERT is blocked (no spoofing)';
END $$;

SELECT '✓ all database security integration tests passed' AS result;
