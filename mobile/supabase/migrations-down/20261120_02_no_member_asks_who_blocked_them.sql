-- Undo of 20261120_02: no member can ask the house who blocked them, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A5 undone · hidden_authors and is_hidden_by back in public, open to every member again ──
-- The six callers as they stood, asking public.*.

CREATE OR REPLACE FUNCTION public.critiques_seen(l public.logs) RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT public.hidden_authors() AS hidden)
  SELECT CASE
    WHEN COALESCE(cardinality(me.hidden), 0) = 0
      THEN COALESCE((SELECT c.critique_count FROM public.log_counts c WHERE c.log_id = l.id), 0)
    ELSE (SELECT count(*)::integer FROM public.log_comments x
           WHERE x.log_id = l.id AND NOT COALESCE(x.user_id = ANY (me.hidden), false))
  END
  FROM me;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_archive_films(p_pattern text)
    RETURNS TABLE(subject_id integer, subject_title text, subject_sub text, subject_image text, filings bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT public.hidden_authors() AS hidden),
  hits AS (
    SELECT p.subject_id, p.subject_title, p.subject_sub, p.subject_image, p.created_at, p.id
      FROM public.dispatch_posts p CROSS JOIN me
     WHERE p.subject_kind = 'film'
       AND p.subject_id IS NOT NULL
       AND p.subject_title IS NOT NULL
       AND p.is_published
       AND p.withheld_at IS NULL
       AND p.ended_at IS NULL
       AND p.subject_title ILIKE '%' || COALESCE(p_pattern, '') || '%'
       AND NOT COALESCE(p.user_id = ANY (me.hidden), false)
  ),
  -- Each film once, its newest filing's poster and subtitle (an older one may carry a poster since replaced).
  films AS (
    SELECT DISTINCT ON (h.subject_id)
           h.subject_id, h.subject_title, h.subject_sub, h.subject_image,
           count(*) OVER (PARTITION BY h.subject_id) AS filings
      FROM hits h
     ORDER BY h.subject_id, h.created_at DESC, h.id DESC
  )
  SELECT f.subject_id, f.subject_title, f.subject_sub, f.subject_image, f.filings
    FROM films f
   ORDER BY f.filings DESC, f.subject_id
   LIMIT 120;
$$;

CREATE OR REPLACE FUNCTION public.get_community_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean, alt_poster text, physical_media text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT hidden_authors() AS hidden)
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    CASE
      WHEN COALESCE(cardinality(me.hidden), 0) = 0 THEN COALESCE(c.critique_count, 0)
      ELSE (SELECT count(*)::integer FROM log_comments x
             WHERE x.log_id = l.id AND NOT COALESCE(x.user_id = ANY (me.hidden), false))
    END AS critique_count,
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    )) AS certified,
    l.alt_poster, l.physical_media
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  LEFT JOIN log_counts c ON c.log_id = l.id
  CROSS JOIN me
  WHERE l.review IS NOT NULL
    AND l.review <> ''
    AND NOT COALESCE(l.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_lobby() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH ed AS (
    SELECT max(edition) AS edition FROM public.lobby_editions
     WHERE edition <= (now() AT TIME ZONE 'UTC')::date
  ),
  the_log AS (
    SELECT l.id, l.review, l.rating, l.film_id, l.film_title, l.poster_path,
           p.id AS author_id, p.username, p.avatar_url, p.role, p.tier, p.is_founding
      FROM ed
      JOIN public.lobby_editions e ON e.edition = ed.edition AND e.slot = 'log'
      JOIN public.logs l ON l.id = e.target_id
      JOIN public.profiles p ON p.id = l.user_id
     WHERE btrim(coalesce(l.review, '')) <> '' AND NOT coalesce(l.is_spoiler, false)
       AND NOT coalesce(p.is_banned, false)
       AND NOT public.is_hidden_by(auth.uid(), l.user_id)
     ORDER BY e.place
     LIMIT 1
  ),
  the_stack AS (
    SELECT s.id, s.title, s.description,
           p.id AS author_id, p.username, p.avatar_url, p.role, p.tier, p.is_founding
      FROM ed
      JOIN public.lobby_editions e ON e.edition = ed.edition AND e.slot = 'list'
      JOIN public.lists s ON s.id = e.target_id
      JOIN public.profiles p ON p.id = s.user_id
     WHERE NOT coalesce(s.is_private, false)
       AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = s.id) >= 4
       AND NOT coalesce(p.is_banned, false)
       AND NOT public.is_hidden_by(auth.uid(), s.user_id)
     ORDER BY (s.user_id = (SELECT author_id FROM the_log)) IS TRUE, e.place
     LIMIT 1
  ),
  the_filings AS (
    SELECT f.* FROM (
      SELECT d.id, d.kind, d.title,
             left(coalesce(nullif(d.full_content, ''), d.body, ''), 1500) AS text,
             coalesce(array_length(regexp_split_to_array(btrim(coalesce(nullif(d.full_content, ''), d.body, '')), '\s+'), 1), 0) AS words,
             p.id AS author_id, p.username, p.avatar_url, p.role, p.tier, p.is_founding,
             e.place,
             row_number() OVER (PARTITION BY d.user_id ORDER BY e.place) AS nth
        FROM ed
        JOIN public.lobby_editions e ON e.edition = ed.edition AND e.slot = 'post'
        JOIN public.dispatch_posts d ON d.id = e.target_id
        JOIN public.profiles p ON p.id = d.user_id
       -- asked here, not left to the rules: an author reads their own withheld or drawn-back filing
       WHERE coalesce(d.is_published, false) AND d.withheld_at IS NULL
         AND d.ended_at IS NULL AND d.spoiler_label IS NULL
         AND NOT coalesce(p.is_banned, false)
    ) f
    ORDER BY f.nth > 1, f.place
    LIMIT 3
  )
  SELECT jsonb_build_object(
    'edition', (SELECT edition FROM ed),
    'log', (SELECT jsonb_build_object(
              'id', l.id, 'words', l.review, 'rating', l.rating,
              'film', jsonb_build_object('id', l.film_id, 'title', l.film_title, 'poster_path', l.poster_path),
              'author', jsonb_build_object('id', l.author_id, 'username', l.username, 'avatar_url', l.avatar_url,
                                           'role', l.role, 'tier', l.tier, 'is_founding', l.is_founding))
              FROM the_log l),
    'stack', (SELECT jsonb_build_object(
              'id', s.id, 'title', s.title, 'description', s.description,
              'films', (SELECT count(*) FROM public.list_items i WHERE i.list_id = s.id),
              'posters', coalesce((SELECT jsonb_agg(jsonb_build_object('film_id', f.film_id, 'title', f.film_title, 'poster_path', f.poster_path)
                                                    ORDER BY f.rank_position)
                                     FROM (SELECT film_id, film_title, poster_path, rank_position FROM public.list_items
                                            WHERE list_id = s.id ORDER BY rank_position LIMIT 3) f), '[]'::jsonb),
              'author', jsonb_build_object('id', s.author_id, 'username', s.username, 'avatar_url', s.avatar_url,
                                           'role', s.role, 'tier', s.tier, 'is_founding', s.is_founding))
              FROM the_stack s),
    'filings', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id', f.id, 'kind', f.kind, 'title', f.title, 'text', f.text, 'words', f.words,
              'author', jsonb_build_object('id', f.author_id, 'username', f.username, 'avatar_url', f.avatar_url,
                                           'role', f.role, 'tier', f.tier, 'is_founding', f.is_founding))
              ORDER BY f.nth > 1, f.place) FROM the_filings f), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_lounge_list() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT auth.uid() AS id),
  memberships AS (
    SELECT lm.lounge_id, lm.last_read_at, lm.status
      FROM public.lounge_members lm, me WHERE lm.user_id = me.id LIMIT 100
  ),
  newest AS (
    SELECT l.id, l.name, l.description, l.is_private, l.creator_id, l.created_at, l.member_count, l.cover_image
      FROM public.lounges l ORDER BY l.created_at DESC LIMIT 50
  ),
  hosted AS (
    SELECT l.id, l.name, l.description, l.is_private, l.creator_id, l.created_at, l.member_count, l.cover_image
      FROM public.lounges l, me WHERE l.creator_id = me.id
  ),
  joined AS (
    SELECT l.id, l.name, l.description, l.is_private, l.creator_id, l.created_at, l.member_count, l.cover_image
      FROM public.lounges l WHERE l.id IN (SELECT lounge_id FROM memberships)
  ),
  -- The member's own: seated (a ban or a mute is no seat) or hosted.
  own AS (
    SELECT lounge_id AS id FROM memberships WHERE status IS NULL OR status NOT IN ('banned', 'muted')
    UNION SELECT id FROM hosted
  )
  SELECT jsonb_build_object(
    'memberships', coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM memberships m), '[]'::jsonb),
    'newest', coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM newest n), '[]'::jsonb),
    'hosted', coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM hosted h), '[]'::jsonb),
    'joined', coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM joined j), '[]'::jsonb),
    -- Asked only of a member who sits somewhere, as the client asks it; every piece a list.
    'unread', CASE WHEN EXISTS (SELECT 1 FROM memberships)
      THEN coalesce((SELECT jsonb_agg(to_jsonb(u)) FROM public.get_lounge_unread_counts() u), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    -- Who waits at the doors the member hosts, each named: never one the host has blocked or
    -- muted (the room does not offer them to be admitted across it, nor counts them).
    'pending', coalesce((SELECT jsonb_agg(jsonb_build_object('lounge_id', p.lounge_id, 'user_id', p.user_id))
      FROM public.lounge_members p WHERE p.lounge_id IN (SELECT id FROM hosted) AND p.status = 'pending'
        AND NOT public.is_hidden_by((SELECT id FROM me), p.user_id)), '[]'::jsonb),
    'faces', coalesce((SELECT jsonb_agg(to_jsonb(f))
      FROM public.get_salon_member_faces(ARRAY(SELECT id FROM own)) f), '[]'::jsonb),
    'last_words', coalesce((SELECT jsonb_agg(to_jsonb(w))
      FROM public.get_salon_last_words(ARRAY(SELECT id FROM newest WHERE id NOT IN (SELECT id FROM own))) w), '[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION public.search_members(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, username text, avatar_url text, role text, closeness integer)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_names  boolean := NOT COALESCE(p_handles_only, false);
  v_hidden uuid[];
  v_tests  text[];
  v_few    uuid[];
  v_past   text;
  v_tier   integer;
  v_not    text := '';
  v_got    integer := 0;
  v_n      integer;
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT public.hidden_authors())::uuid[], '{}'::uuid[]);
  -- Each closeness's own test, as the one read's CASE asked it. Plain, so the planner reads the words
  -- and their indexes: a WHERE drops a test that is unknown (a name not given), as the CASE did.
  -- The handle that is the words: words with no wildcard left once their escapes are read are one
  -- handle, any case, so the case-blind unique index (profiles_username_lower_unique) finds it at once
  -- (ILIKE is that same lower() on both sides: the equality adds no member and takes none away).
  v_tests := ARRAY[
    format('p.username ILIKE %L ESCAPE %L', p_pattern, '\')
      || CASE WHEN regexp_replace(p_pattern, '\\.', '', 'g') !~ '[%_\\]'
              THEN format(' AND lower(p.username) = lower(%L)', regexp_replace(p_pattern, '\\(.)', '\1', 'g')) ELSE '' END,
    format('p.username ILIKE %L ESCAPE %L', p_pattern || '%', '\'),
    CASE WHEN v_names THEN format('p.display_name ILIKE %L ESCAPE %L', p_pattern || '%', '\') ELSE 'false' END,
    format('(p.username ILIKE %L ESCAPE %L', '%' || p_pattern || '%', '\')
      || CASE WHEN v_names THEN format(' OR p.display_name ILIKE %L ESCAPE %L)', '%' || p_pattern || '%', '\') ELSE ')' END
  ];
  -- Who holds the words at all (the one read's own WHERE), gathered once by the plan the words want,
  -- up to a thousand: when fewer hold them, the page is the one read's own over just those few, by id.
  EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                 v_tests[4])
    INTO v_few USING v_hidden;
  IF COALESCE(cardinality(v_few), 0) <= 1000 THEN
    RETURN QUERY
    SELECT m.id, m.username, m.avatar_url, m.role, m.closeness
      FROM (
        SELECT p.id, p.username, p.avatar_url, p.role,
               CASE WHEN p.username ILIKE p_pattern ESCAPE '\' THEN 0
                    WHEN p.username ILIKE p_pattern || '%' ESCAPE '\' THEN 1
                    WHEN v_names AND p.display_name ILIKE p_pattern || '%' ESCAPE '\' THEN 2
                    ELSE 3 END AS closeness
          FROM public.profiles p
         WHERE p.id = ANY (COALESCE(v_few, '{}'::uuid[]))
      ) m
     WHERE p_cursor_closeness IS NULL OR (m.closeness, m.username) > (p_cursor_closeness, p_cursor_username)
     ORDER BY m.closeness, m.username
     LIMIT v_limit;
    RETURN;
  END IF;
  -- More hold them: each closeness in turn, as far as the page needs. A member of a closeness meets its
  -- test and none of the closer ones; in the cursor's own closeness, it is past the cursor's handle (a
  -- member with no handle is never past it). Its members are gathered first, up to a thousand, by the
  -- plan the words want: fewer, and they are put in handle order themselves; more, and the closeness
  -- holds so many that its handles are walked in their own order (profiles_username_unique) and the
  -- page is met within the first few hundred. The walk asks its test as one the planner cannot weigh
  -- (COALESCE), so it is planned as a walk however few it guesses: its guess of a name's beginning
  -- once took 100,000 for 4, and sorted them all.
  FOR v_tier IN 0..3 LOOP
    IF (p_cursor_closeness IS NULL OR v_tier >= p_cursor_closeness) AND v_tests[v_tier + 1] <> 'false' THEN
      v_past := CASE WHEN v_tier = p_cursor_closeness THEN format(' AND p.username > %L', p_cursor_username) ELSE '' END;
      EXECUTE format('SELECT array_agg(p.id) FROM (SELECT p.id FROM public.profiles p WHERE %s%s%s AND NOT COALESCE(p.id = ANY ($1), false) LIMIT 1001) p',
                     v_tests[v_tier + 1], v_not, v_past)
        INTO v_few USING v_hidden;
      IF COALESCE(cardinality(v_few), 0) <= 1000 THEN
        RETURN QUERY
        SELECT p.id, p.username, p.avatar_url, p.role, v_tier
          FROM public.profiles p
         WHERE p.id = ANY (COALESCE(v_few, '{}'::uuid[]))
         ORDER BY p.username
         LIMIT v_limit - v_got;
      ELSE
        RETURN QUERY EXECUTE format(
          'SELECT p.id, p.username, p.avatar_url, p.role, %s
             FROM public.profiles p
            WHERE COALESCE(%s, false)%s%s
              AND NOT COALESCE(p.id = ANY ($1), false)
            ORDER BY p.username
            LIMIT %s',
          v_tier, v_tests[v_tier + 1], v_not, v_past, v_limit - v_got)
        USING v_hidden;
      END IF;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_got := v_got + v_n;
      EXIT WHEN v_got >= v_limit;
    END IF;
    -- A closer test ruled out: one that is unknown was not met, so it rules nothing out.
    v_not := v_not || ' AND NOT COALESCE(' || v_tests[v_tier + 1] || ', false)';
  END LOOP;
END;
$$;

-- The house's aliases go, and the functions move back whole (the read rules follow them).
DROP FUNCTION IF EXISTS public.hidden_authors();
DROP FUNCTION IF EXISTS public.is_hidden_by(uuid, uuid);
DO $$
BEGIN
  IF to_regprocedure('private.hidden_authors()') IS NOT NULL THEN
    ALTER FUNCTION private.hidden_authors() SET SCHEMA public;
  END IF;
  IF to_regprocedure('private.is_hidden_by(uuid, uuid)') IS NOT NULL THEN
    ALTER FUNCTION private.is_hidden_by(uuid, uuid) SET SCHEMA public;
  END IF;
END $$;
COMMENT ON FUNCTION public.hidden_authors() IS 'The members whose words are hidden from the caller: those they blocked or muted, and those who blocked them. The same rule as is_hidden_by, asked once per statement. It names no one is_hidden_by does not already answer for.';
COMMENT ON FUNCTION public.is_hidden_by(uuid, uuid) IS NULL;
REVOKE ALL ON FUNCTION public.hidden_authors() FROM PUBLIC;
GRANT ALL ON FUNCTION public.hidden_authors() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_hidden_by(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_hidden_by(uuid, uuid) TO anon, authenticated, service_role;

-- The schema goes when nothing else is in it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_namespace n ON n.oid = d.refobjid
                  WHERE d.refclassid = 'pg_namespace'::regclass AND n.nspname = 'private') THEN
    DROP SCHEMA IF EXISTS private;
  END IF;
END $$;
