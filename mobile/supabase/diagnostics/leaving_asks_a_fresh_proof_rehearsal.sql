-- ════════════════════════════════════════════════════════════════════════════
-- leaving_asks_a_fresh_proof_rehearsal.sql — 20261126_12. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs leaving_asks_a_fresh_proof_rehearsal.sql --with-train
--
-- The train applies 20261126_12 here (with_train), every car before it already applied; a sealed copy already holds it.
-- Seven members are planted, each signed in as the app signs in, each token recording its sign-ins (amr)
-- differently; each asks to delete their own account. Those signed in within the last fifteen minutes
-- leave; every other is refused with 42501 'REAUTH' and keeps their account. Every row here is undone.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

\if :{?with_train}
\ir ../../../supabase/migrations/20261126_12_leaving_asks_a_fresh_proof.sql
\endif

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- Seven members of the rehearsal's own, numbered 1 to 7.
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT format('c25e0000-0000-4000-8000-00000000012%s', n)::uuid, 'authenticated', 'authenticated',
       format('qzc25f%s@rehearsal.test', n), jsonb_build_object('username', format('qzc25f%s', n)),
       '{"provider":"email"}'::jsonb, now() - interval '60 days', now(), now() - interval '60 days'
  FROM generate_series(1, 7) AS n;

-- Member n asks to leave, signed in with a token whose amr is the one given (NULL: a token with none).
-- Said as what came back ('ok', or SQLSTATE: words) and whether their account is gone.
CREATE FUNCTION pg_temp.fp_leave(p_n int, p_amr jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_id  uuid := format('c25e0000-0000-4000-8000-00000000012%s', p_n)::uuid;
  v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', (jsonb_build_object('sub', v_id, 'role', 'authenticated', 'aal', 'aal1')
    || CASE WHEN p_amr IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('amr', p_amr) END)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM public.request_account_deletion();
    v_got := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_got := SQLSTATE || ': ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_got || '|' || CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = v_id) THEN 'stays' ELSE 'gone' END;
END $$;

-- A sign-in made s seconds ago, by a method.
CREATE FUNCTION pg_temp.fp_proof(p_method text, p_ago int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('method', p_method, 'timestamp', floor(extract(epoch FROM now())) - p_ago)
$$;

SELECT pg_temp.rh_case('a token with no record of its sign-in is refused, and the account stays', '42501: REAUTH|stays',
  pg_temp.fp_leave(1, NULL)) AS done \gset rh_
SELECT pg_temp.rh_case('a session signed in thirty days ago is refused', '42501: REAUTH|stays',
  pg_temp.fp_leave(2, jsonb_build_array(pg_temp.fp_proof('password', 30 * 86400)))) AS done \gset rh_
SELECT pg_temp.rh_case('so is one signed in sixteen minutes ago', '42501: REAUTH|stays',
  pg_temp.fp_leave(3, jsonb_build_array(pg_temp.fp_proof('otp', 16 * 60)))) AS done \gset rh_
SELECT pg_temp.rh_case('a record that is no list of sign-ins proves nothing', '42501: REAUTH|stays',
  pg_temp.fp_leave(4, '"password"'::jsonb)) AS done \gset rh_
SELECT pg_temp.rh_case('nor does a sign-in whose time is not a number', '42501: REAUTH|stays',
  pg_temp.fp_leave(5, jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', 'now')))) AS done \gset rh_
SELECT pg_temp.rh_case('the emailed code entered a minute ago lets the member leave, an old password beside it', 'ok|gone',
  pg_temp.fp_leave(6, jsonb_build_array(pg_temp.fp_proof('password', 30 * 86400), pg_temp.fp_proof('otp', 60)))) AS done \gset rh_
SELECT pg_temp.rh_case('as does a password entered fourteen minutes ago', 'ok|gone',
  pg_temp.fp_leave(7, jsonb_build_array(pg_temp.fp_proof('password', 14 * 60)))) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
