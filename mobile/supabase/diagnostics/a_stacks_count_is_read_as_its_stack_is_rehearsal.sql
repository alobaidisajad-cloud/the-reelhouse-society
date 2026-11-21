-- ════════════════════════════════════════════════════════════════════════════
-- a_stacks_count_is_read_as_its_stack_is_rehearsal.sql — 20261122_06. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_stacks_count_is_read_as_its_stack_is_rehearsal.sql --with-train
--
-- The train applies 20261122_06 here (with_train), every car before it already applied; a sealed copy already holds it.
-- Then members, acting as themselves, read a stack's certifications across a block both ways and of a
-- private member they do not follow: each answers 0, and every stack they may read answers its count
-- (stage C, the kinds pass). Every row here is undone with the transaction. Read each NOTICE as
-- case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

-- As the house: claims cleared, so no member's gate judges the setup.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_

CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   ORDER BY u.created_at LIMIT 3;
SELECT pg_temp.rh_need('members', (SELECT count(*) FROM rehearsal_members), 3) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_06_a_stacks_count_is_read_as_its_stack_is.sql
\endif

-- ── the setting, as the house ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Member 2 keeps an open stack, member 3 (sealed) another; each certified once by the other. No blocks
-- between the three, and no follows of member 3.
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rehearsal_members) OR blocked_id IN (SELECT id FROM rehearsal_members);
DELETE FROM public.interactions WHERE user_id IN (SELECT id FROM rehearsal_members) AND target_user_id IN (SELECT id FROM rehearsal_members) AND type IN ('follow', 'follow_request');
UPDATE public.profiles SET is_social_private = (id = (SELECT id FROM rehearsal_members WHERE n = 3)) WHERE id IN (SELECT id FROM rehearsal_members);
INSERT INTO public.lists (id, user_id, title, is_private) VALUES
  ('00000000-0000-4000-8000-0000000c0002', (SELECT id FROM rehearsal_members WHERE n = 2), 'rh counted stack', false),
  ('00000000-0000-4000-8000-0000000c0003', (SELECT id FROM rehearsal_members WHERE n = 3), 'rh sealed member''s stack', false);
INSERT INTO public.interactions (id, user_id, target_list_id, type) VALUES
  (gen_random_uuid(), (SELECT id FROM rehearsal_members WHERE n = 3), '00000000-0000-4000-8000-0000000c0002', 'endorse_list'),
  (gen_random_uuid(), (SELECT id FROM rehearsal_members WHERE n = 2), '00000000-0000-4000-8000-0000000c0003', 'endorse_list');

-- A member's reading of a stack's count, by both functions: 'one|many'.
CREATE FUNCTION pg_temp.scr_count(p_n bigint, p_list uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_one bigint; v_many bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_n), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_one := public.list_certify_count(p_list);
  SELECT c.certify_count INTO v_many FROM public.list_certify_counts(ARRAY[p_list]) c;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_one || '|' || v_many;
END $$;

SELECT pg_temp.rh_case('an open stack of a member the reader may read: its count', '1|1', pg_temp.scr_count(1, '00000000-0000-4000-8000-0000000c0002')) AS done \gset rh_
SELECT pg_temp.rh_case('one''s own stack, though sealed: its count', '1|1', pg_temp.scr_count(3, '00000000-0000-4000-8000-0000000c0003')) AS done \gset rh_
SELECT pg_temp.rh_case('an open stack of a sealed member the reader does not follow: 0, as the stack is hidden', '0|0', pg_temp.scr_count(1, '00000000-0000-4000-8000-0000000c0003')) AS done \gset rh_

-- The reader blocks the stack's curator.
INSERT INTO public.user_blocks (blocker_id, blocked_id, type) VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), (SELECT id FROM rehearsal_members WHERE n = 2), 'block');
SELECT pg_temp.rh_case('the stack of a member the reader blocked: 0', '0|0', pg_temp.scr_count(1, '00000000-0000-4000-8000-0000000c0002')) AS done \gset rh_
SELECT pg_temp.rh_case('the curator reads their own stack''s count, whoever blocked them', '1|1', pg_temp.scr_count(2, '00000000-0000-4000-8000-0000000c0002')) AS done \gset rh_
DELETE FROM public.user_blocks WHERE blocker_id = (SELECT id FROM rehearsal_members WHERE n = 1);

-- The curator blocks the reader.
INSERT INTO public.user_blocks (blocker_id, blocked_id, type) VALUES ((SELECT id FROM rehearsal_members WHERE n = 2), (SELECT id FROM rehearsal_members WHERE n = 1), 'block');
SELECT pg_temp.rh_case('the stack of a member who blocked the reader: 0', '0|0', pg_temp.scr_count(1, '00000000-0000-4000-8000-0000000c0002')) AS done \gset rh_
DELETE FROM public.user_blocks WHERE blocker_id = (SELECT id FROM rehearsal_members WHERE n = 2);
SELECT pg_temp.rh_case('the block lifted: the count again', '1|1', pg_temp.scr_count(1, '00000000-0000-4000-8000-0000000c0002')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
