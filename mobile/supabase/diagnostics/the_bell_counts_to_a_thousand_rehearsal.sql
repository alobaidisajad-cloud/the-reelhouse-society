-- ════════════════════════════════════════════════════════════════════════════
-- the_bell_counts_to_a_thousand_rehearsal.sql — 20261122_04. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs the_bell_counts_to_a_thousand_rehearsal.sql --with-train
--
-- The train applies 20261122_04 here (with_train), every car before it already applied; a sealed copy already holds it.
-- Then members, acting as themselves, read their boards: a count to a thousand, and whether there are
-- more (stage C, the kinds pass). Every row here is undone with the transaction. Read each NOTICE as
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
\ir ../../../supabase/migrations/20261122_04_the_bell_counts_to_a_thousand.sql
\endif

-- ── the bell counts to a thousand ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Member 1: 1,005 unread and 10 read; member 2: 5 unread; member 3: none unread. Written as the house,
-- from no member (no sender's gate), each a plain notice.
DELETE FROM public.notifications WHERE user_id IN (SELECT id FROM rehearsal_members);
INSERT INTO public.notifications (user_id, type, message, is_read, created_at)
SELECT (SELECT id FROM rehearsal_members WHERE n = 1), 'system', 'rh rehearsal notice', k > 1005, now() - k * interval '1 second'
  FROM generate_series(1, 1015) k;
INSERT INTO public.notifications (user_id, type, message, is_read)
SELECT (SELECT id FROM rehearsal_members WHERE n = 2), 'system', 'rh rehearsal notice', false FROM generate_series(1, 5);
INSERT INTO public.notifications (user_id, type, message, is_read)
SELECT (SELECT id FROM rehearsal_members WHERE n = 3), 'system', 'rh rehearsal notice', true FROM generate_series(1, 3);

-- A member's board, as themselves: its unread count, whether there are more, and how many rows.
CREATE FUNCTION pg_temp.btc_board(p_n bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = p_n), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := public.notices_page(30);
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN (v ->> 'unread') || '|' || coalesce(v ->> 'unread_more', 'absent') || '|' || jsonb_array_length(v -> 'rows');
END $$;

SELECT pg_temp.rh_case('past a thousand unread: the count stops at a thousand, and says there are more', '1000|true|30', pg_temp.btc_board(1)) AS done \gset rh_
SELECT pg_temp.rh_case('a few unread: the count, and no more', '5|false|5', pg_temp.btc_board(2)) AS done \gset rh_
SELECT pg_temp.rh_case('none unread: nought, and no more', '0|false|3', pg_temp.btc_board(3)) AS done \gset rh_

-- At exactly a thousand: no more.
DELETE FROM public.notifications WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND is_read = false
   AND id IN (SELECT id FROM public.notifications WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND is_read = false ORDER BY created_at LIMIT 5);
SELECT pg_temp.rh_case('exactly a thousand unread: the count, and no more', '1000|false|30', pg_temp.btc_board(1)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
