-- ════════════════════════════════════════════════════════════════════════════
-- a_busy_read_reads_its_page_rehearsal.sql — 20261122_12. Rolled back, always.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/rehearse.cjs a_busy_read_reads_its_page_rehearsal.sql
--
-- 20261122_12 is applied on production (the train of 2026-11-23); this shows it still holds there, and on every sealed copy.
-- On rows it plants, as the members themselves: the Reel's stacks searched by an author's handle, the
-- projector room, and a salon's words and reactions read from an open room, from a seat, from a muted
-- seat and from no seat, and the pieces a short search is found by. Every row here is undone with the transaction. Read each
-- NOTICE as  case|expected|got ; the last line is the verdict, and any miss makes psql exit non-zero.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
BEGIN;
\ir rehearsal_kit.sql

SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE rehearsal_members ON COMMIT DROP AS
  SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS n
    FROM auth.users u JOIN public.profiles p ON p.id = u.id
   WHERE NOT coalesce(p.is_banned, false) AND (p.suspended_until IS NULL OR p.suspended_until <= now())
   ORDER BY u.created_at LIMIT 3;
SELECT pg_temp.rh_need('three members in good standing', (SELECT count(*) FROM rehearsal_members), 3) AS done \gset rh_
GRANT SELECT ON rehearsal_members TO anon, authenticated;
-- None of the three hides another.
DELETE FROM public.user_blocks WHERE blocker_id IN (SELECT id FROM rehearsal_members) AND blocked_id IN (SELECT id FROM rehearsal_members);

-- Member 1, the author: a handle no other member holds, two open stacks and a private one, and three
-- records (one watched again; two at the cinema, so the formats' order holds no tie).
UPDATE public.profiles SET username = 'rhbr' || substr(md5(id::text), 1, 8), is_social_private = false, tier = 'archivist'
 WHERE id IN (SELECT id FROM rehearsal_members);
CREATE TEMP TABLE brp_ids (what text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON brp_ids TO anon, authenticated;
INSERT INTO brp_ids SELECT w, gen_random_uuid() FROM unnest(ARRAY['open 1', 'open 2', 'private', 'salon open', 'salon seat', 'salon muted', 'salon none']) w;
INSERT INTO public.lists (id, user_id, title, description, is_private, created_at)
SELECT b.id, (SELECT id FROM rehearsal_members WHERE n = 1), 'rh ' || b.what, 'rh', b.what = 'private', now() - interval '1 day'
  FROM brp_ids b WHERE b.what IN ('open 1', 'open 2', 'private');
DELETE FROM public.logs WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1);
INSERT INTO public.logs (user_id, film_id, film_title, rating, format, watched_date, viewing_history)
SELECT (SELECT id FROM rehearsal_members WHERE n = 1), f.id, 'rh', v.rating, v.format, v.day, v.history
  FROM (VALUES (1, 4.0, 'cinema', current_date - 1, '[]'::jsonb),
               (2, 3.0, 'stream', current_date, jsonb_build_array(jsonb_build_object('date', (current_date - 30)::text, 'rating', 2))),
               (3, 0.0, 'cinema', current_date - 40, '[]'::jsonb)) v(k, rating, format, day, history)
  JOIN LATERAL (SELECT id FROM public.films ORDER BY id OFFSET v.k - 1 LIMIT 1) f ON true;
SELECT pg_temp.rh_need('three records planted', (SELECT count(*) FROM public.logs WHERE user_id = (SELECT id FROM rehearsal_members WHERE n = 1)), 3) AS done \gset rh_

-- Salons of member 3's: one open, three closed; member 2 seated in one, muted in one, in none of the
-- last; a word of member 3's in each, and a reaction of member 3's on each word.
INSERT INTO public.lounges (id, name, creator_id, is_private)
SELECT b.id, 'rh ' || b.what, (SELECT id FROM rehearsal_members WHERE n = 3), b.what <> 'salon open' FROM brp_ids b WHERE b.what LIKE 'salon %';
INSERT INTO public.lounge_members (lounge_id, user_id, status)
SELECT b.id, (SELECT id FROM rehearsal_members WHERE n = 2), CASE b.what WHEN 'salon seat' THEN 'approved' ELSE 'muted' END
  FROM brp_ids b WHERE b.what IN ('salon seat', 'salon muted')
ON CONFLICT (lounge_id, user_id) DO UPDATE SET status = EXCLUDED.status;
CREATE TEMP TABLE brp_words ON COMMIT DROP AS SELECT b.what, gen_random_uuid() AS id, b.id AS lounge_id FROM brp_ids b WHERE b.what LIKE 'salon %';
GRANT SELECT ON brp_words TO anon, authenticated;
INSERT INTO public.lounge_messages (id, lounge_id, user_id, content) SELECT w.id, w.lounge_id, (SELECT id FROM rehearsal_members WHERE n = 3), 'rh a word' FROM brp_words w;
INSERT INTO public.lounge_message_reactions (message_id, lounge_id, user_id, reaction) SELECT w.id, w.lounge_id, (SELECT id FROM rehearsal_members WHERE n = 3), 'bravo' FROM brp_words w;

-- Each read, as a member reads it: member 2's Reel searched by member 1's handle, member 1's projector
-- room as member 1, and the words and reactions member 2 reads in each salon.
CREATE FUNCTION pg_temp.brp_reads() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_stacks text; v_room json; v_words text; v_reactions text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 2), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT string_agg(b.what, ',' ORDER BY b.what) INTO v_stacks
    FROM public.get_filtered_stacks_auth_cursor_v2((SELECT username FROM public.profiles WHERE id = (SELECT id FROM rehearsal_members WHERE n = 1)), false, 60) s
    JOIN brp_ids b ON b.id = s.id;
  SELECT string_agg(w.what, ',' ORDER BY w.what) INTO v_words FROM public.lounge_messages m JOIN brp_words w ON w.id = m.id;
  SELECT string_agg(w.what, ',' ORDER BY w.what) INTO v_reactions FROM public.lounge_message_reactions r JOIN brp_words w ON w.id = r.message_id;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM rehearsal_members WHERE n = 1), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_room := public.get_user_analytics((SELECT id FROM rehearsal_members WHERE n = 1));
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN jsonb_build_object('stacks', v_stacks, 'words', v_words, 'reactions', v_reactions, 'room', v_room::jsonb);
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true) AS done \gset rh_
CREATE TEMP TABLE brp_after ON COMMIT DROP AS SELECT pg_temp.brp_reads() AS r;

SELECT pg_temp.rh_case('the Reel searched by an author''s handle finds their open stacks, never the private one', 'open 1,open 2',
  (SELECT r ->> 'stacks' FROM brp_after)) AS done \gset rh_
SELECT pg_temp.rh_case('a salon''s words are read from an open room, a seat and a muted seat, never from no seat', 'salon muted,salon open,salon seat',
  (SELECT r ->> 'words' FROM brp_after)) AS done \gset rh_
SELECT pg_temp.rh_case('and their reactions the same', 'salon muted,salon open,salon seat',
  (SELECT r ->> 'reactions' FROM brp_after)) AS done \gset rh_
SELECT pg_temp.rh_case('the projector room counts the records, their ratings and their formats', '3|3.50|[{"count": 1, "rating": 3.0}, {"count": 1, "rating": 4.0}]|2',
  (SELECT concat_ws('|', r #>> '{room,total_logs}', r #>> '{room,avg_rating}', r #> '{room,rating_distribution}', jsonb_array_length(r #> '{room,format_breakdown}')) FROM brp_after)) AS done \gset rh_
SELECT pg_temp.rh_case('and its nights: the run of yesterday and today, and the viewings of each month', '2|2|' || (SELECT count(DISTINCT to_char(d, 'YYYY-MM')) FROM unnest(ARRAY[current_date, current_date - 1, current_date - 30, current_date - 40]) d),
  (SELECT concat_ws('|', r #>> '{room,current_streak}', r #>> '{room,longest_streak}', jsonb_array_length(r #> '{room,monthly_viewings}')) FROM brp_after)) AS done \gset rh_
-- The pieces of a short search are as the words hold them.
SELECT pg_temp.rh_case('a text''s pieces are each of its letters and each pair, in lower case', 'true',
  ((SELECT array_agg(DISTINCT g ORDER BY g) FROM unnest(private.short_grams('Ab c')) g) = ARRAY[' ', ' c', 'a', 'ab', 'b', 'b ', 'c'])::text) AS done \gset rh_
SELECT pg_temp.rh_case('a pattern''s pieces are each part''s, cut at its wildcards, its escapes read', '{m1}|{a,bc}|{a_,_b}|',
  concat_ws('|', private.pattern_grams('%M1%')::text, private.pattern_grams('a_bc')::text, private.pattern_grams('%a\_b%')::text, coalesce(private.pattern_grams('%%')::text, ''))) AS done \gset rh_
SELECT pg_temp.rh_case('a member runs none of the pieces', 'refused', (SELECT CASE WHEN has_function_privilege('authenticated', 'private.pattern_grams(text)', 'EXECUTE') THEN 'allowed' ELSE 'refused' END)) AS done \gset rh_

SELECT pg_temp.rh_verdict();
ROLLBACK;
