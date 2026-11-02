-- ════════════════════════════════════════════════════════════════════════════
-- world.sql — the sealed tests' world, laid down again before each run.
-- ════════════════════════════════════════════════════════════════════════════
--   psql "$db" -v reader=<id> -v poster=<id> -v lounge=<id> -f mobile/e2e/sealed/world.sql
--
-- The ids come from world.mjs. Two members and an open salon both sit in, each
-- seat last read a week ago, so a read that writes nothing is told apart from
-- one that writes now. The members and the salon are laid with triggers off,
-- as security.sql lays its house; the poster's rank is granted as the house
-- grants one. Run on the sealed copy only (db-integration.yml).
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL session_replication_role = replica;

DELETE FROM public.lounge_messages WHERE lounge_id = :'lounge';
DELETE FROM public.lounge_members WHERE lounge_id = :'lounge';
DELETE FROM public.lounges WHERE id = :'lounge';

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
SELECT id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       name || '@sealed.test', jsonb_build_object('username', 'sealed_' || name), '{"provider":"email"}'::jsonb, now(), now(), now()
  FROM (VALUES (:'reader', 'reader'), (:'poster', 'poster')) m(id, name)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, username, email, is_social_private, preferences)
SELECT id, 'sealed_' || split_part(email, '@', 1), email, false, '{}'::jsonb
  FROM auth.users WHERE email LIKE '%@sealed.test'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lounges (id, name, creator_id, is_private, member_count)
VALUES (:'lounge', 'The sealed salon', :'poster', false, 2);
INSERT INTO public.lounge_members (lounge_id, user_id, status, last_read_at, joined_at)
VALUES (:'lounge', :'reader', 'approved', now() - interval '7 days', now() - interval '7 days'),
       (:'lounge', :'poster', 'approved', now() - interval '7 days', now() - interval '7 days');

SET LOCAL session_replication_role = origin;
SELECT out_tier FROM public.grant_entitlement(:'poster', 'archivist', 'manual');
COMMIT;
