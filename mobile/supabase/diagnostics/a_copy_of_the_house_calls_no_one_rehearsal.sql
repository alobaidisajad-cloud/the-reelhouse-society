-- ════════════════════════════════════════════════════════════════════════════
-- a_copy_of_the_house_calls_no_one_rehearsal.sql — 20261126_11. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_copy_of_the_house_calls_no_one_rehearsal.sql --with-train
--
-- The train applies 20261126_11 here (with_train), every car before it already applied; a sealed copy already holds it.
-- The push trigger names no address of its own, and reads it from the Vault's notify_push_url. On the
-- train, the house holds that setting (made by the owner before the train; never read here). On a sealed
-- copy, a notice is queued to the address the Vault holds, and to none when it holds no address. A queued
-- request is never sent: the transaction that queued it is rolled back. Every row here is undone with it.
-- Read each NOTICE as  case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

\if :{?with_train}
\ir ../../../supabase/migrations/20261126_11_a_copy_of_the_house_calls_no_one.sql
\endif

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

-- ── the trigger names no address ──
SELECT pg_temp.rh_case('the push trigger names no address of its own', 'false',
  (pg_get_functiondef('public.tg_notify_push()'::regprocedure) ~ 'https?://[A-Za-z0-9.-]+[.](co|com|io|net|org)')::text) AS done \gset rh_
SELECT pg_temp.rh_case('it reads where to call from the Vault''s notify_push_url', 'true',
  (pg_get_functiondef('public.tg_notify_push()'::regprocedure) LIKE '%name = ''notify_push_url''%')::text) AS done \gset rh_

\if :{?with_train}
-- ── production holds the setting (its value is never read here) ──
SELECT pg_temp.rh_case('the house holds notify_push_url in its Vault', '1',
  (SELECT count(*)::text FROM vault.secrets WHERE name = 'notify_push_url')) AS done \gset rh_
\else
-- ── a sealed copy: a notice goes to the address the Vault holds, and nowhere without one ──
INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
VALUES ('c25e0000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'qzc25p@rehearsal.test',
        '{"username": "qzc25p"}'::jsonb, '{"provider":"email"}'::jsonb, now(), now(), now());
UPDATE public.house_settings SET pushes_sent = true;

-- The copy's notify_push_url set to a value, made when the copy holds none (the Vault's own calls).
CREATE FUNCTION pg_temp.cp_hold(p_value text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_id uuid := (SELECT id FROM vault.secrets WHERE name = 'notify_push_url');
BEGIN
  IF v_id IS NULL THEN PERFORM vault.create_secret(p_value, 'notify_push_url');
  ELSE PERFORM vault.update_secret(v_id, p_value); END IF;
END $$;

CREATE FUNCTION pg_temp.cp_queued(p_said text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_before bigint := (SELECT count(*) FROM net.http_request_queue);
BEGIN
  INSERT INTO public.notifications (user_id, type, message) VALUES ('c25e0000-0000-4000-8000-000000000011', 'system', p_said);
  RETURN coalesce((SELECT string_agg(q.url, ',') FROM (SELECT url FROM net.http_request_queue ORDER BY id DESC
                                                         LIMIT (SELECT count(*) FROM net.http_request_queue) - v_before) q), 'none');
END $$;

SELECT pg_temp.rh_case('a copy, holding what a copy holds there (none, or a stand-in), calls no one', 'none',
  pg_temp.cp_queued('As a copy holds it.')) AS done \gset rh_
SELECT pg_temp.cp_hold('a-stand-in-that-is-no-address') AS done \gset rh_
SELECT pg_temp.rh_case('nor one holding a stand-in that is no address', 'none', pg_temp.cp_queued('A stand-in held.')) AS done \gset rh_
SELECT pg_temp.cp_hold('https://push.rehearsal.invalid/functions/v1/notify-push') AS done \gset rh_
SELECT pg_temp.rh_case('the house holding its address calls it there',
  CASE WHEN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notify_push_url') LIKE 'https://%'
       THEN 'https://push.rehearsal.invalid/functions/v1/notify-push' ELSE 'none' END,
  pg_temp.cp_queued('An address held.')) AS done \gset rh_
\endif

SELECT pg_temp.rh_verdict();
ROLLBACK;
