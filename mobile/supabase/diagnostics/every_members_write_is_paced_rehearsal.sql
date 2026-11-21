-- ════════════════════════════════════════════════════════════════════════════
-- every_members_write_is_paced_rehearsal.sql — 20261122_01. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs every_members_write_is_paced_rehearsal.sql --with-train
--
-- The train applies 20261122_01 here (with_train), every car before it already applied; a sealed copy already holds it.
-- Then the house and a member in good standing, acting as themselves, find each write a member can
-- repeat at will paced (stage C, the kinds pass). Every row here is undone with the transaction. Read
-- each NOTICE as  case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
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
   ORDER BY u.created_at LIMIT 2;
SELECT pg_temp.rh_need('members in good standing', (SELECT count(*) FROM rehearsal_members), 2) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;
SELECT pg_temp.rh_need('a filing to clone and certify', (SELECT count(*) FROM public.dispatch_posts WHERE kind = 'take'), 1) AS done \gset rh_
SELECT pg_temp.rh_need('a salon message to react to', (SELECT count(*) FROM public.lounge_messages), 1) AS done \gset rh_
SELECT pg_temp.rh_need('a salon to clone', (SELECT count(*) FROM public.lounges), 1) AS done \gset rh_
SELECT pg_temp.rh_need('a ballot to vote on', (SELECT count(*) FROM public.dispatch_posts WHERE kind = 'ballot'), 1) AS done \gset rh_

-- The train applies it here first (with_train), on production as the cars before it left it; a sealed
-- copy already holds every pending migration.
\if :{?with_train}
\ir ../../../supabase/migrations/20261122_01_every_members_write_is_paced.sql
\endif

-- ── the pace on every write a member repeats at will ──
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
-- Member 1 holds every rank, so no rank gate stands before the pace.
UPDATE public.profiles SET is_founding = true WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1);
DELETE FROM public.write_budget WHERE user_id IN (SELECT id FROM rehearsal_members);
-- Public salons of member 2's, a seat in each for member 1 to take.
INSERT INTO public.lounges (id, name, description, is_private, creator_id)
  SELECT gen_random_uuid(), 'rh seat salon', 'rh', false, (SELECT id FROM rehearsal_members WHERE n = 2) FROM generate_series(1, 3);

-- Runs one write as member 1: as themselves (role authenticated) when p_as_member, else with their
-- claims under the rehearsal's own role, so the row rules of a table whose door is another rule's
-- (a filing's standing, a salon seat) stand aside and the triggers judge the member. Says 'ok', or
-- the refusal's code, message and detail.
CREATE FUNCTION pg_temp.wp_try(p_sql text, p_as_member boolean DEFAULT false) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_msg text; v_detail text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  IF p_as_member THEN PERFORM set_config('role', 'authenticated', true); END IF;
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN v_state || ' ' || v_msg || ' ' || coalesce(v_detail, '');
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'ok';
END $$;

-- Sets member 1's room of a kind: p_tokens left, refilled p_ago seconds back, p_n written today.
CREATE FUNCTION pg_temp.wp_room(p_kind text, p_tokens real, p_ago integer, p_n integer) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.write_budget (user_id, kind, tokens, refilled_at, day, n)
  VALUES ((SELECT id FROM rehearsal_members WHERE n = 1), p_kind, p_tokens, now() - make_interval(secs => p_ago), (now() AT TIME ZONE 'UTC')::date, p_n)
  ON CONFLICT (user_id, kind) DO UPDATE SET tokens = EXCLUDED.tokens, refilled_at = EXCLUDED.refilled_at, day = EXCLUDED.day, n = EXCLUDED.n;
$$;

-- Each kind's write, as a member makes a new one.
CREATE FUNCTION pg_temp.wp_write(p_kind text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE p_kind
    WHEN 'stack' THEN format('INSERT INTO public.lists (id, user_id, title) VALUES (gen_random_uuid(), %L, %L)', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh pace stack')
    WHEN 'stack_entry' THEN format('INSERT INTO public.list_items (list_id, film_id, film_title, rank_position) SELECT l.id, f.id, %L, 1 FROM public.lists l, public.films f WHERE l.user_id = %L AND NOT EXISTS (SELECT 1 FROM public.list_items i WHERE i.list_id = l.id AND i.film_id = f.id) LIMIT 1',
                                    'rh', (SELECT id FROM rehearsal_members WHERE n = 1))
    WHEN 'filing' THEN format('INSERT INTO public.dispatch_posts SELECT (jsonb_populate_record(NULL::public.dispatch_posts, to_jsonb(p) || jsonb_build_object(%L, gen_random_uuid(), %L, %L::uuid))).* FROM public.dispatch_posts p WHERE p.kind = %L LIMIT 1',
                              'id', 'user_id', (SELECT id FROM rehearsal_members WHERE n = 1), 'take')
    WHEN 'salon' THEN format('INSERT INTO public.lounges SELECT (jsonb_populate_record(NULL::public.lounges, to_jsonb(l) || jsonb_build_object(%L, gen_random_uuid(), %L, %L::uuid, %L, NULL, %L, %L))).* FROM public.lounges l LIMIT 1',
                             'id', 'creator_id', (SELECT id FROM rehearsal_members WHERE n = 1), 'invite_code', 'name', 'rh pace salon')
    WHEN 'reaction' THEN format('INSERT INTO public.lounge_message_reactions (message_id, lounge_id, user_id, reaction) SELECT m.id, m.lounge_id, %L, r FROM public.lounge_messages m, unnest(ARRAY[%L, %L, %L, %L, %L]) r WHERE NOT EXISTS (SELECT 1 FROM public.lounge_message_reactions x WHERE x.message_id = m.id AND x.user_id = %L AND x.reaction = r) LIMIT 1',
                                (SELECT id FROM rehearsal_members WHERE n = 1), 'bravo', 'adored', 'riveting', 'quoted', 'panned', (SELECT id FROM rehearsal_members WHERE n = 1))
    WHEN 'certification' THEN format('INSERT INTO public.dispatch_certifications (id, user_id, post_id) SELECT gen_random_uuid(), %L, p.id FROM public.dispatch_posts p LIMIT 1', (SELECT id FROM rehearsal_members WHERE n = 1))
    WHEN 'save' THEN format('INSERT INTO public.dispatch_saves (user_id, post_id) SELECT %1$L, p.id FROM public.dispatch_posts p WHERE NOT EXISTS (SELECT 1 FROM public.dispatch_saves s WHERE s.user_id = %1$L AND s.post_id = p.id) LIMIT 1', (SELECT id FROM rehearsal_members WHERE n = 1))
    WHEN 'vote' THEN format('INSERT INTO public.dispatch_votes (post_id, user_id, option_index) SELECT p.id, %1$L, 0 FROM public.dispatch_posts p WHERE p.kind = %2$L AND NOT EXISTS (SELECT 1 FROM public.dispatch_votes v WHERE v.user_id = %1$L AND v.post_id = p.id) LIMIT 1', (SELECT id FROM rehearsal_members WHERE n = 1), 'ballot')
    WHEN 'block' THEN format('INSERT INTO public.user_blocks (blocker_id, blocked_id, type) SELECT %1$L, p.id, %2$L FROM public.profiles p WHERE p.id <> %1$L AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.blocker_id = %1$L AND b.blocked_id = p.id) LIMIT 1', (SELECT id FROM rehearsal_members WHERE n = 1), 'mute')
    WHEN 'watchlist_entry' THEN format('INSERT INTO public.watchlists (user_id, film_id, film_title) SELECT %1$L, f.id, %2$L FROM public.films f WHERE NOT EXISTS (SELECT 1 FROM public.watchlists w WHERE w.user_id = %1$L AND w.film_id = f.id) LIMIT 1', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh')
    WHEN 'shelf_entry' THEN format('INSERT INTO public.physical_archive (user_id, film_id, film_title) SELECT %1$L, f.id, %2$L FROM public.films f WHERE NOT EXISTS (SELECT 1 FROM public.physical_archive w WHERE w.user_id = %1$L AND w.film_id = f.id) LIMIT 1', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh')
    WHEN 'draft' THEN format('INSERT INTO public.member_drafts (user_id, kind, scope, payload, saved_at) VALUES (%L, %L, gen_random_uuid()::text, %L, now())', (SELECT id FROM rehearsal_members WHERE n = 1), 'edit', '{}')
    WHEN 'seat' THEN format('INSERT INTO public.lounge_members (lounge_id, user_id, status) SELECT l.id, %1$L, %2$L FROM public.lounges l WHERE l.name = %3$L AND NOT EXISTS (SELECT 1 FROM public.lounge_members s WHERE s.lounge_id = l.id AND s.user_id = %1$L) LIMIT 1',
                            (SELECT id FROM rehearsal_members WHERE n = 1), 'approved', 'rh seat salon')
    WHEN 'push_address' THEN format('INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (%L, %L || gen_random_uuid(), %L, %L)', (SELECT id FROM rehearsal_members WHERE n = 1), 'https://rh.test/', 'k', 'a')
  END;
$$;

-- A stack of member 1's, for the stack entries.
SELECT pg_temp.rh_case('a member makes a stack, as themselves, with room left', 'ok',
  pg_temp.wp_try(pg_temp.wp_write('stack'), true)) AS done \gset rh_
SELECT pg_temp.rh_case('and the house counts it in their room', '1|499',
  (SELECT n || '|' || round(tokens)::text FROM public.write_budget WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1) AND kind = 'stack')) AS done \gset rh_

-- Each kind: its room spent is refused for the member, with the refill's wait; its day's ceiling met is
-- refused for the day; the room refilled with time lets the member write again.
SELECT pg_temp.wp_room('stack', 0, 0, 1) AS done \gset rh_
SELECT pg_temp.rh_case('stack: a member with no room left is refused, as themselves', 'RH429 RATE_LIMITED member',
  pg_temp.wp_try(pg_temp.wp_write('stack'), true)) AS done \gset rh_
SELECT pg_temp.wp_room('stack', 500, 0, 2000) AS done \gset rh_
SELECT pg_temp.rh_case('stack: the day''s 2000 met is refused for the day', 'RH429 RATE_LIMITED day',
  pg_temp.wp_try(pg_temp.wp_write('stack'), true)) AS done \gset rh_
SELECT pg_temp.wp_room('stack', 0, 11, 1) AS done \gset rh_
SELECT pg_temp.rh_case('stack: ten seconds on, the room has one more', 'ok',
  pg_temp.wp_try(pg_temp.wp_write('stack'), true)) AS done \gset rh_

SELECT pg_temp.wp_room(k, 0, 0, 1), pg_temp.rh_case(k || ': a member with no room left is refused', 'RH429 RATE_LIMITED member',
         pg_temp.wp_try(pg_temp.wp_write(k)))
  FROM unnest(ARRAY['stack_entry', 'filing', 'salon', 'reaction', 'certification', 'save', 'vote', 'block', 'watchlist_entry',
                    'shelf_entry', 'draft', 'push_address', 'seat']) k;
SELECT pg_temp.wp_room(k, room, 0, ceiling), pg_temp.rh_case(k || ': the day''s ' || ceiling || ' met is refused for the day', 'RH429 RATE_LIMITED day',
         pg_temp.wp_try(pg_temp.wp_write(k)))
  FROM (VALUES ('stack_entry', 20000, 100000), ('filing', 10, 50), ('salon', 5, 20), ('reaction', 120, 2000), ('certification', 120, 2000),
               ('save', 300, 3000), ('vote', 120, 2000), ('block', 100, 1000), ('watchlist_entry', 20000, 100000), ('shelf_entry', 2000, 10000),
               ('draft', 300, 5000), ('push_address', 20, 100), ('seat', 60, 500)) v(k, room, ceiling);
SELECT pg_temp.wp_room(k, 0, wait, 1), pg_temp.rh_case(k || ': once the refill''s wait has passed, the member writes again', 'ok',
         pg_temp.wp_try(pg_temp.wp_write(k)))
  FROM (VALUES ('stack_entry', 1), ('filing', 361), ('salon', 3601), ('reaction', 3), ('certification', 3), ('save', 2), ('vote', 2),
               ('block', 2), ('watchlist_entry', 1), ('shelf_entry', 1), ('draft', 2), ('push_address', 61), ('seat', 11)) v(k, wait);

-- The refusal names the wait: the refill's seconds for the write short of one.
SELECT pg_temp.wp_room('filing', 0, 0, 1) AS done \gset rh_
CREATE FUNCTION pg_temp.wp_hint() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_hint text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE pg_temp.wp_write('filing');
  EXCEPTION WHEN SQLSTATE 'RH429' THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_hint;
END $$;
SELECT pg_temp.rh_case('a filing refused names the seconds to wait for one more', '360', pg_temp.wp_hint()) AS done \gset rh_

-- A row sent again whose first send landed is no new write: a stack saved again over its entries.
SELECT pg_temp.wp_room('stack_entry', 0, 0, 1) AS done \gset rh_
SELECT pg_temp.rh_case('a stack entry saved again over itself is not counted, the room spent', 'ok',
  pg_temp.wp_try(format('INSERT INTO public.list_items (list_id, film_id, film_title, rank_position) SELECT i.list_id, i.film_id, i.film_title, i.rank_position FROM public.list_items i JOIN public.lists l ON l.id = i.list_id WHERE l.user_id = %L LIMIT 1 ON CONFLICT (list_id, film_id) DO UPDATE SET rank_position = EXCLUDED.rank_position',
    (SELECT id FROM rehearsal_members WHERE n = 1)))) AS done \gset rh_
SELECT pg_temp.wp_room('stack', 0, 0, 1) AS done \gset rh_
SELECT pg_temp.rh_case('a stack sent again by its own id is not counted, the room spent', 'ok',
  pg_temp.wp_try(format('INSERT INTO public.lists (id, user_id, title) SELECT id, user_id, title FROM public.lists WHERE user_id = %L LIMIT 1 ON CONFLICT (id) DO NOTHING',
    (SELECT id FROM rehearsal_members WHERE n = 1)), true)) AS done \gset rh_

-- The house's own writes are not paced.
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
INSERT INTO public.lists (id, user_id, title) VALUES ('00000000-0000-4000-8000-00000c220101', (SELECT id FROM rehearsal_members WHERE n = 1), 'rh house stack');
SELECT pg_temp.rh_case('the house makes a row for a member whose room is spent, unpaced', '1',
  (SELECT count(*)::text FROM public.lists WHERE id = '00000000-0000-4000-8000-00000c220101')) AS done \gset rh_

-- Another member's room is their own.
SELECT pg_temp.rh_case('member 2 has no room counted for member 1''s writes', '0',
  (SELECT count(*)::text FROM public.write_budget WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 2))) AS done \gset rh_

-- No member reads, fills or wipes the rooms, nor runs the rule.
CREATE FUNCTION pg_temp.wp_member(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'refused';
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'allowed';
END $$;
SELECT pg_temp.rh_case('a member does not read the rooms', 'refused', pg_temp.wp_member('SELECT count(*) FROM public.write_budget')) AS done \gset rh_
SELECT pg_temp.rh_case('nor give themselves more room', 'refused',
  pg_temp.wp_member(format('INSERT INTO public.write_budget (user_id, kind, tokens, refilled_at, day) VALUES (%L, %L, 1e9, now(), current_date)', (SELECT id FROM rehearsal_members WHERE n = 2), 'stack'))) AS done \gset rh_
SELECT pg_temp.rh_case('nor wipe the rooms', 'refused', pg_temp.wp_member('DELETE FROM public.write_budget')) AS done \gset rh_
SELECT pg_temp.rh_case('nor run the rule', 'refused', pg_temp.wp_member('SELECT public.check_write_pace()')) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
