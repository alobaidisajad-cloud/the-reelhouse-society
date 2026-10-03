-- Included twice by the_house_reads_fast_rehearsal.sql: what every member is
-- answered, by every read the change touches, recorded under the phase in
-- r.phase. Runs as the member (role authenticated, their claims), then once
-- signed out (role anon), exactly as the apps ask.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  m uuid;
  ph text := current_setting('r.phase');
BEGIN
  FOR m IN SELECT id FROM r_members ORDER BY id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);

    INSERT INTO r_feed SELECT ph, m, 'following', f.ordinality, f.id, f.certify_count, f.critique_count, f.certified
      FROM public.get_following_feed_auth_cursor(40) WITH ORDINALITY AS f;
    INSERT INTO r_feed SELECT ph, m, 'house', f.ordinality, f.id, f.certify_count, f.critique_count, f.certified
      FROM public.get_community_feed_auth_cursor(40) WITH ORDINALITY AS f;
    INSERT INTO r_feed SELECT ph, m, 'stacks', f.ordinality, f.id, f.certify_count::int, f.film_count::int, NULL
      FROM public.get_filtered_stacks_auth_cursor_v2('', false, 60) WITH ORDINALITY AS f;
    INSERT INTO r_feed SELECT ph, m, 'stacks followed', f.ordinality, f.id, f.certify_count::int, f.film_count::int, NULL
      FROM public.get_filtered_stacks_auth_cursor_v2('', true, 60) WITH ORDINALITY AS f;
    INSERT INTO r_feed SELECT ph, m, 'stacks searched', f.ordinality, f.id, f.certify_count::int, f.film_count::int, NULL
      FROM public.get_filtered_stacks_auth_cursor_v2('a', false, 60) WITH ORDINALITY AS f;

    INSERT INTO r_unread SELECT ph, m, u.lounge_id, u.unread_count, u.last_message_at
      FROM public.get_lounge_unread_counts() u;

    INSERT INTO r_rows SELECT ph, m, 'dispatch_certifications', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.dispatch_certifications t;
    INSERT INTO r_rows SELECT ph, m, 'dispatch_comments', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.dispatch_comments t;
    INSERT INTO r_rows SELECT ph, m, 'dossier_comments_legacy', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.dossier_comments_legacy t;
    INSERT INTO r_rows SELECT ph, m, 'list_comments', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.list_comments t;
    INSERT INTO r_rows SELECT ph, m, 'log_comments', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.log_comments t;
    INSERT INTO r_rows SELECT ph, m, 'notifications', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.notifications t;
    INSERT INTO r_rows SELECT ph, m, 'dispatch_posts', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.dispatch_posts t;
  END LOOP;
END $$;
RESET ROLE;

-- Signed out: the house feed, stacks, and the four tables anon may read.
SET LOCAL ROLE anon;
DO $$
DECLARE ph text := current_setting('r.phase');
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  INSERT INTO r_feed SELECT ph, NULL, 'house', f.ordinality, f.id, f.certify_count, f.critique_count, f.certified
    FROM public.get_community_feed_auth_cursor(40) WITH ORDINALITY AS f;
  INSERT INTO r_feed SELECT ph, NULL, 'stacks', f.ordinality, f.id, f.certify_count::int, f.film_count::int, NULL
    FROM public.get_filtered_stacks_auth_cursor_v2('', false, 60) WITH ORDINALITY AS f;
  INSERT INTO r_rows SELECT ph, NULL, 'dossier_comments_legacy', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.dossier_comments_legacy t;
  INSERT INTO r_rows SELECT ph, NULL, 'list_comments', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.list_comments t;
  INSERT INTO r_rows SELECT ph, NULL, 'log_comments', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.log_comments t;
  INSERT INTO r_rows SELECT ph, NULL, 'dispatch_posts', count(*), md5(coalesce(string_agg(t.id::text, ',' ORDER BY t.id), '')) FROM public.dispatch_posts t;
END $$;
RESET ROLE;
