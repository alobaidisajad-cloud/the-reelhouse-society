-- Undo of 20261120_32: a piece the house removed is withheld whole until its appeal is judged, and given back whole if overturned, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B10, undone: a removal deletes at once again; every reader as it read before ──
-- First, each piece still withheld is settled as the house before H-B10 would have left it, never published:
-- a log, a stack or a critique deleted (the old house deleted it at its removal, its words kept with the
-- verdict); a filing emptied and ended by the house (as the old house removed one), and, while its appeal may
-- still be heard, its words kept with the verdict (kept), where the old house's hearing puts a filing back.
-- Then the functions H-B10 made dropped (the hourly job unscheduled), each definition it changed put back.

DO $settle$
DECLARE w record;
BEGIN
  FOR w IN SELECT * FROM public.withheld_pieces ORDER BY withheld_at, mod_action_id LOOP
    IF w.kind = 'dispatch_post' AND (w.delete_after IS NULL OR w.delete_after > now()) THEN
      UPDATE public.mod_actions m
         SET content_snapshot = coalesce(m.content_snapshot, '{}'::jsonb) || jsonb_build_object('kept', jsonb_build_object(
               'body', d.body, 'full_content', d.full_content, 'title', d.title, 'subject_image', d.subject_image,
               'subject_backdrop', d.subject_backdrop, 'source', d.source, 'source_url', d.source_url, 'spoiler_label', d.spoiler_label))
        FROM public.dispatch_posts d
       WHERE m.id = w.mod_action_id AND d.id = w.piece_id AND d.ended_at IS NULL;
    END IF;
    PERFORM public.delete_withheld_piece(w.mod_action_id);
  END LOOP;
END
$settle$;

DO $do$
DECLARE v_kept boolean := false;
BEGIN
  IF to_regprocedure('cron.unschedule(text)') IS NOT NULL AND to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = $1)' INTO v_kept USING 'a-withheld-piece-is-deleted-unappealed';
    IF v_kept THEN
      PERFORM cron.unschedule('a-withheld-piece-is-deleted-unappealed');
    END IF;
  END IF;
END
$do$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.can_annotate_list(p_actor uuid, p_list_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT NOT (COALESCE(l.is_private, false) AND l.user_id IS DISTINCT FROM auth.uid())
     AND public.audience_allows(p_actor, l.user_id,
           (SELECT preferences->>'privacy_annotations' FROM public.profiles WHERE id = l.user_id))
  FROM public.lists l WHERE l.id = p_list_id;
$$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.can_annotate_log(p_actor uuid, p_log_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT public.audience_allows(p_actor, l.user_id,
    (SELECT preferences->>'privacy_annotations' FROM public.profiles WHERE id = l.user_id))
  FROM public.logs l WHERE l.id = p_log_id;
$$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.can_endorse_content(p_actor uuid, p_type text, p_log_id uuid, p_list_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_owner uuid; v_pref text; v_private boolean := false;
BEGIN
  IF p_type = 'endorse_log' THEN
    SELECT user_id INTO v_owner FROM public.logs WHERE id = p_log_id;
  ELSIF p_type = 'endorse_list' THEN
    SELECT user_id, COALESCE(is_private, false) INTO v_owner, v_private FROM public.lists WHERE id = p_list_id;
  ELSE
    RETURN TRUE;
  END IF;
  IF v_private AND v_owner IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;
  SELECT preferences->>'privacy_endorsements' INTO v_pref FROM public.profiles WHERE id = v_owner;
  RETURN public.audience_allows(p_actor, v_owner, v_pref);
END;
$$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.dispatch_comments_pin_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  NEW.certify_count := OLD.certify_count;
  NEW.created_at    := OLD.created_at;
  -- A critique belongs to the filing it was written under. Moving it puts a
  -- member's words beneath somebody else's writing.
  NEW.post_id       := OLD.post_id;
  -- An edit is dated by the house's clock, never the phone's.
  IF NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END $$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.dispatch_count_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.dispatch_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSE
    UPDATE public.dispatch_posts
       SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END $$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_filtered_stacks_auth_cursor_v2(p_search text DEFAULT ''::text, p_filter_following boolean DEFAULT false, p_limit integer DEFAULT 60, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_poster_count integer DEFAULT 4) RETURNS TABLE(id uuid, title text, description text, username text, user_id uuid, created_at timestamp with time zone, films jsonb, film_count bigint, certify_count bigint, is_ranked boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH
  -- A search that matches many stacks walks them newest first, as with no search, and stops
  -- at its page; one that matches few is read by its matches. Counted by the trigram indexes,
  -- to 1,000 at most (load 43284739569: the walk 6.5 ms for a word every stack has and 292.7
  -- for a handle; the matches 94.7 and 4.4).
  -- Under three letters no trigram index can find a word (it is made of three-letter pieces): such
  -- a search walks, uncounted (load 43292798767: "m1" counted by the indexes took 506.9 ms).
  many AS MATERIALIZED (
    SELECT CASE WHEN char_length(COALESCE(p_search, '')) < 3 THEN true ELSE (
      SELECT count(*) >= 1000 FROM (
        SELECT l.id FROM lists l
         WHERE l.is_private = false
           AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        UNION ALL
        SELECT l.id FROM profiles pu JOIN lists l ON l.user_id = pu.id
         WHERE l.is_private = false
           AND pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        LIMIT 1000
      ) counted) END AS walk
  ),
  -- The matches of a few, newest first, before anything is asked of them.
  matched AS MATERIALIZED (
    SELECT m.id, m.created_at, m.user_id FROM (
      SELECT l.id, l.created_at, l.user_id
        FROM lists l
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many) AND l.is_private = false
         AND l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
      UNION
      SELECT l.id, l.created_at, l.user_id
        FROM profiles pu JOIN lists l ON l.user_id = pu.id
       WHERE COALESCE(p_search, '') <> '' AND NOT (SELECT walk FROM many) AND l.is_private = false
         AND pu.username ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
    ) m
     WHERE p_cursor_created_at IS NULL OR (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id)
     ORDER BY m.created_at DESC, m.id DESC
  ),
  page AS (
    -- No search, or a search of many: today's walk, today's test of each stack.
    (SELECT l.id, l.created_at
       FROM lists l
      WHERE (COALESCE(p_search, '') = '' OR (SELECT walk FROM many))
        AND (
          COALESCE(p_search, '') = ''
          OR l.title ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
          -- The author's handle, looked up as the walk reaches each stack (a scalar subquery is
          -- never folded into a join): the walk stops at its page, never reading every member
          -- whose handle holds the word (today's IN (...) did, 219.4 ms for "m1").
          OR (SELECT pu.username FROM profiles pu WHERE pu.id = l.user_id)
               ILIKE '%' || like_escape(p_search) || '%' ESCAPE '\'
        )
        AND l.is_private = false
        AND NOT COALESCE(l.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
        AND public.can_view_user_data(l.user_id)
        AND (p_filter_following = false OR EXISTS (
              SELECT 1 FROM interactions i
               WHERE i.target_user_id = l.user_id AND i.user_id = auth.uid() AND i.type = 'follow'))
        AND (p_cursor_created_at IS NULL OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id))
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT p_limit)
    UNION ALL
    -- Read in the order it was kept (newest first), each asked only as it is reached.
    (SELECT m.id, m.created_at
       FROM matched m
      WHERE NOT COALESCE(m.user_id = ANY ((SELECT hidden_authors())::uuid[]), false)
        AND public.can_view_user_data(m.user_id)
        AND (p_filter_following = false OR EXISTS (
              SELECT 1 FROM interactions i
               WHERE i.target_user_id = m.user_id AND i.user_id = auth.uid() AND i.type = 'follow'))
      LIMIT p_limit)
  )
  SELECT
    l.id, l.title, l.description,
    p.username, l.user_id, l.created_at,
    COALESCE(
      (SELECT jsonb_agg(f ORDER BY f_created_at ASC)
       FROM (
         SELECT jsonb_build_object('id', li.film_id, 'title', li.film_title,
                                   'poster_path', li.poster_path) AS f,
                li.created_at AS f_created_at
         FROM list_items li
         WHERE li.list_id = l.id AND li.poster_path IS NOT NULL
         ORDER BY li.created_at ASC
         LIMIT LEAST(GREATEST(p_poster_count, 0), 10)
       ) top_films),
      '[]'::jsonb
    ) AS films,
    (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id) AS film_count,
    public.list_certify_count(l.id) AS certify_count,
    l.is_ranked
  FROM page pg
  JOIN lists l ON l.id = pg.id
  JOIN profiles p ON p.id = l.user_id
  ORDER BY l.created_at DESC, l.id DESC;
$$;

-- As 20261117_01_what_happened_meanwhile_is_told left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_following_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean, alt_poster text, physical_media text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT public.hidden_authors() AS hidden),
  followed AS (
    SELECT i.target_user_id AS author
      FROM public.interactions i
     WHERE i.user_id = auth.uid()
       AND i.type = 'follow'
       AND NOT COALESCE(i.target_user_id = ANY ((SELECT public.hidden_authors())::uuid[]), false)
       AND public.can_view_user_data(i.target_user_id)
  ),
  page AS (
    SELECT r.id, r.created_at
      FROM followed f
      CROSS JOIN LATERAL (
        SELECT l.id, l.created_at
          FROM public.logs l
         WHERE l.user_id = f.author
           AND l.review IS NOT NULL
           AND l.review <> ''
           AND (p_cursor_created_at IS NULL OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id))
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT p_limit
      ) r
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT p_limit
  )
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
      ELSE (SELECT count(*)::integer FROM public.log_comments x
             WHERE x.log_id = l.id AND NOT COALESCE(x.user_id = ANY (me.hidden), false))
    END AS critique_count,
    EXISTS (
      SELECT 1 FROM public.interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    ) AS certified,
    l.alt_poster, l.physical_media
  FROM page pg
  JOIN public.logs l ON l.id = pg.id
  JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN public.log_counts c ON c.log_id = l.id
  CROSS JOIN me
  ORDER BY pg.created_at DESC, pg.id DESC;
$$;

-- As H-A2.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_profile_counts(p_user_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT json_build_object(
    'logs_count',      CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id) ELSE 0 END,
    'ledger_count',    CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id
                                    AND (rating > 0 OR COALESCE(review, '') <> '')) ELSE 0 END,
    'watchlist_count', CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id) ELSE 0 END,
    'vault_count',     CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id) ELSE 0 END,
    'lists_count',     CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM lists WHERE user_id = p_user_id
                                    AND (is_private = false OR user_id = auth.uid())) ELSE 0 END,
    -- Across a block the follows rule shows none of the member's follows, so none are counted.
    'followers_count', CASE WHEN me.across THEN 0 ELSE
                         (SELECT COUNT(*) FROM interactions i WHERE i.target_user_id = p_user_id AND i.type = 'follow'
                            AND NOT COALESCE(i.user_id = ANY (me.hidden), false)) END,
    'following_count', CASE WHEN me.across THEN 0 ELSE
                         (SELECT COUNT(*) FROM interactions i WHERE i.user_id = p_user_id AND i.type = 'follow'
                            AND NOT COALESCE(i.target_user_id = ANY (me.hidden), false)) END
  )
  FROM (SELECT public.hidden_authors() AS hidden,
               COALESCE(auth.uid() IS DISTINCT FROM p_user_id
                        AND public.a_block_stands_between(auth.uid(), p_user_id), false) AS across) me;
$$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_public_profile_analytics(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  SELECT CASE
    WHEN auth.uid() IS NULL OR NOT public.can_view_user_data(p_user_id)
      THEN '{"error": "forbidden"}'::jsonb
    ELSE (
      WITH user_logs AS MATERIALIZED (
        SELECT film_id, rating, status, view_count,
          physical_media IS NOT NULL AS on_media,
          length(review) > 20 AS reviewed,
          coalesce(watched_date, (created_at AT TIME ZONE 'UTC')::date) AS on_day,
          -- A year of one to four digits; anything else is not a year.
          CASE WHEN year ~ '^\d{1,4}$' THEN year::int END AS year_int,
          CASE WHEN is_autopsied = true THEN autopsy END AS autopsy
        FROM public.logs WHERE user_id = p_user_id
      ),
      -- The films this member logged, each once, joined once.
      films_read AS MATERIALIZED (
        SELECT f.popularity, f.genres
        FROM (SELECT DISTINCT film_id FROM user_logs WHERE film_id > 0) mine
        JOIN public.films f ON f.id = mine.film_id
      ),
      stamps AS (
        SELECT
          COUNT(*) AS total_logs,
          COUNT(*) FILTER (WHERE year_int < 1960) AS pre_1960_count,
          COUNT(*) FILTER (WHERE rating = 5) AS perfect_ratings_count,
          bool_or(on_media) AS has_physical_media,
          bool_or(status = 'abandoned') AS has_abandoned,
          COUNT(DISTINCT (year_int / 10) * 10) FILTER (WHERE year_int IS NOT NULL) AS decades_logged_count,
          -- A rewatch is kept on its log; two logs of one film count too.
          -- (coalesce: a member with no logs has rewatched nothing, not "unknown".)
          (coalesce(bool_or(status = 'rewatched' OR coalesce(view_count, 1) > 1), false)
            OR EXISTS (SELECT 1 FROM user_logs GROUP BY film_id HAVING COUNT(*) > 1)) AS has_rewatched,
          COUNT(*) FILTER (WHERE reviewed) AS reviews_count,
          COUNT(*) FILTER (WHERE coalesce(rating, 0) <= 0) AS unrated_count,
          (SELECT coalesce(max(n), 0) FROM (
             SELECT COUNT(*) AS n FROM user_logs GROUP BY on_day
           ) days) AS busiest_day_count,
          -- Grouped, not sorted: COUNT(DISTINCT) sorted the whale's 20,000 genre names to find ~20.
          (SELECT COUNT(*) FROM (
             SELECT g FROM films_read, LATERAL unnest(films_read.genres) AS g
             WHERE g IS NOT NULL GROUP BY g
           ) kinds) AS genres_count
        FROM user_logs
      ),
      decades AS (
        SELECT (year_int / 10) * 10 AS decade, COUNT(*) AS c
        FROM user_logs WHERE year_int IS NOT NULL
        GROUP BY decade ORDER BY c DESC LIMIT 3
      ),
      -- The film page's obscurity mark (obscurityScore), for each film read.
      obscurity AS (
        SELECT
          round(avg(CASE WHEN popularity <= 0 THEN 99
                         ELSE greatest(2, least(99, round(100 - (log(greatest(popularity, 1)) / log(5000)) * 98)))
                    END)) AS obscurity_index,
          COUNT(*) AS obscurity_films
        FROM films_read
        WHERE popularity IS NOT NULL
      ),
      dna AS (
        SELECT
          AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
          (SELECT jsonb_agg(jsonb_build_object(d.decade::text || 's', d.c)) FROM decades d) AS top_decades,
          (SELECT o.obscurity_index FROM obscurity o) AS obscurity_index,
          (SELECT o.obscurity_films FROM obscurity o) AS obscurity_films
        FROM user_logs
      ),
      autopsies AS (
        SELECT
          AVG(CASE WHEN autopsy ? '_v'
                THEN COALESCE((autopsy->>'story')::numeric, (autopsy->>'screenplay')::numeric, (autopsy->>'script')::numeric)
                ELSE NULLIF(COALESCE(autopsy->>'story', autopsy->>'screenplay', autopsy->>'script')::numeric, 0)
              END) AS avg_story,
          AVG(CASE WHEN autopsy ? '_v'
                THEN COALESCE((autopsy->>'cinematography')::numeric, (autopsy->>'visuals')::numeric, (autopsy->>'acting')::numeric)
                ELSE NULLIF(COALESCE(autopsy->>'cinematography', autopsy->>'visuals', autopsy->>'acting')::numeric, 0)
              END) AS avg_cinematography,
          AVG(CASE WHEN autopsy ? '_v'
                THEN COALESCE((autopsy->>'sound')::numeric, (autopsy->>'score')::numeric, (autopsy->>'editing')::numeric)
                ELSE NULLIF(COALESCE(autopsy->>'sound', autopsy->>'score', autopsy->>'editing')::numeric, 0)
              END) AS avg_sound
        FROM user_logs WHERE autopsy IS NOT NULL
      )
      SELECT jsonb_build_object(
        'stamps', (SELECT to_jsonb(s.*) FROM stamps s),
        'dna', (SELECT to_jsonb(d.*) FROM dna d),
        'autopsy_math', (SELECT to_jsonb(a.*) FROM autopsies a)
      )
    )
  END;
$_$;

-- As 20261119_17_a_film_read_early_is_read_again left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_taste_profile(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.can_view_user_data(p_user_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  WITH mine AS (
    SELECT DISTINCT l.film_id
      FROM public.logs l
     WHERE l.user_id = p_user_id AND l.film_id > 0
  ),
  known AS (
    SELECT f.*
      FROM public.films f
      JOIN mine m ON m.film_id = f.id
     WHERE f.synced_at IS NOT NULL
  )
  SELECT json_build_object(
    'films_total', (SELECT COUNT(*) FROM mine),
    -- Known once read with its details (genres, director, cast), or read once it had settled after
    -- its release; read before the house counted, settled when its year is before 2026. Unknown:
    -- read only before it settled, so its details may still come.
    'films_known', (SELECT COUNT(*) FROM known
                     WHERE (cardinality(known.genres) > 0 AND known.director_id IS NOT NULL AND cardinality(known.cast_ids) > 0)
                        OR known.sync_reads >= 1
                        OR (known.sync_reads IS NULL AND known.year < 2026)),

    'genres', (
      SELECT COALESCE(json_agg(row_to_json(g)), '[]'::json) FROM (
        SELECT genre AS name, COUNT(*) AS count
          FROM known, LATERAL unnest(known.genres) AS genre
         GROUP BY genre
         ORDER BY count DESC, genre
         LIMIT 12
      ) g
    ),

    'actors', (
      SELECT COALESCE(json_agg(row_to_json(a)), '[]'::json) FROM (
        SELECT p.id,
               MAX(p.name) AS name,
               MAX(p.profile) AS profile_path,
               COUNT(*) AS count
          FROM known,
               LATERAL unnest(known.cast_ids, known.cast_names, known.cast_profiles)
                    AS p(id, name, profile)
         WHERE p.id IS NOT NULL AND p.name IS NOT NULL AND p.name <> ''
         GROUP BY p.id
         ORDER BY count DESC, name
         LIMIT 10
      ) a
    ),

    'directors', (
      SELECT COALESCE(json_agg(row_to_json(d)), '[]'::json) FROM (
        SELECT director_id AS id,
               MAX(director) AS name,
               MAX(director_profile) AS profile_path,
               COUNT(*) AS count
          FROM known
         WHERE director_id IS NOT NULL AND director IS NOT NULL AND director <> ''
         GROUP BY director_id
         ORDER BY count DESC, name
         LIMIT 10
      ) d
    ),

    'countries', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) FROM (
        SELECT code, COUNT(*) AS count
          FROM known, LATERAL unnest(known.country_codes) AS code
         GROUP BY code
         ORDER BY count DESC, code
         LIMIT 20
      ) c
    ),

    'total_runtime', (SELECT COALESCE(SUM(runtime), 0) FROM known WHERE runtime > 0)
  ) INTO result;

  RETURN result;
END;
$$;

-- As 20261117_01_what_happened_meanwhile_is_told left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_user_analytics(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  result JSON;
  v_vault JSON := '[]'::json;
  v_decades JSON := '[]'::json;
  v_current integer := 0;
  v_longest integer := 0;
  v_run JSON;
  v_months JSON := '[]'::json;
BEGIN
  -- The check the other two functions already had. This one had none.
  IF NOT public.can_view_user_data(p_user_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  -- The two NEW fields, where a failure cannot reach the rest of the payload.
  BEGIN
    SELECT COALESCE(json_agg(row_to_json(vf)), '[]'::json) INTO v_vault
    FROM (
      SELECT COALESCE(f, 'unfiled') AS format, COUNT(*) AS count
      FROM physical_archive pa
      LEFT JOIN LATERAL unnest(NULLIF(pa.formats, '{}')) AS f ON TRUE
      WHERE pa.user_id = p_user_id
      GROUP BY 1 ORDER BY count DESC
    ) vf;
  EXCEPTION WHEN OTHERS THEN v_vault := '[]'::json;
  END;

  BEGIN
    SELECT COALESCE(json_agg(row_to_json(wd)), '[]'::json) INTO v_decades
    FROM (
      -- {1,4} not + : an unbounded pattern accepts a 20-digit string and the
      -- int cast then raises 22003, aborting everything.
      SELECT ((year::text)::int / 10) * 10 AS decade, COUNT(*) AS count
      FROM watchlists
      WHERE user_id = p_user_id
        AND year::text ~ '^\d{1,4}$'
        AND (year::text)::int > 0
      GROUP BY 1 ORDER BY 1 DESC
    ) wd;
  EXCEPTION WHEN OTHERS THEN v_decades := '[]'::json;
  END;

  -- The nights a member saw a film: every viewing's day, a rewatched film's earlier viewings
  -- among them. A run is consecutive days; date - row_number holds still along one, read
  -- ascending.
  --   current_streak: the run reaching the house's today or yesterday, as before, for the builds
  --     that read it.
  --   current_run: the newest run whole, its length and its last day, for the phone to judge on
  --     its own calendar (the house's day is not the member's). A day past the house's tomorrow
  --     is today nowhere, so a run ending after it is not the newest one.
  --   monthly_viewings: the viewings of each month, `YYYY-MM`.
  WITH viewed AS (
    SELECT v.day FROM public.member_viewings(p_user_id) v
  ),
  streak AS (
    SELECT d.day, d.day - (ROW_NUMBER() OVER (ORDER BY d.day))::int AS grp
    FROM (SELECT DISTINCT day FROM viewed) d
  ),
  runs AS (
    SELECT COUNT(*)::int AS len, MAX(day) AS ends_on FROM streak GROUP BY grp
  )
  SELECT
    COALESCE((SELECT r.len FROM runs r WHERE r.ends_on >= CURRENT_DATE - 1 ORDER BY r.ends_on DESC LIMIT 1), 0),
    COALESCE((SELECT MAX(r.len) FROM runs r), 0),
    (SELECT json_build_object('length', r.len, 'ends_on', r.ends_on)
       FROM runs r WHERE r.ends_on <= CURRENT_DATE + 1 ORDER BY r.ends_on DESC LIMIT 1),
    (SELECT COALESCE(json_agg(row_to_json(mv)), '[]'::json) FROM (
       SELECT TO_CHAR(day, 'YYYY-MM') AS month, COUNT(*) AS count
       FROM viewed GROUP BY 1 ORDER BY 1 DESC) mv)
  INTO v_current, v_longest, v_run, v_months;

  SELECT json_build_object(
    'total_logs', (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id),
    'avg_rating', (SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
                   FROM logs WHERE user_id = p_user_id AND rating > 0),
    'rating_distribution', (
      SELECT COALESCE(json_agg(row_to_json(rd)), '[]'::json) FROM (
        SELECT rating, COUNT(*) as count FROM logs
        WHERE user_id = p_user_id AND rating > 0
        GROUP BY rating ORDER BY rating) rd),

    -- the 12-month window is gone. The Archive's records by the month each is filed under, as
    -- its headings count the posters beneath them.
    'monthly_activity', (
      SELECT COALESCE(json_agg(row_to_json(ma)), '[]'::json) FROM (
        SELECT TO_CHAR(COALESCE(watched_date::date, created_at::date), 'YYYY-MM') as month,
               COUNT(*) as count
        FROM logs WHERE user_id = p_user_id
        GROUP BY month ORDER BY month DESC) ma),

    'current_streak', v_current,
    'longest_streak', v_longest,
    'current_run', v_run,
    'monthly_viewings', v_months,

    -- unchanged: this is logs.format, how a film was watched — NOT the Vault
    'format_breakdown', (
      SELECT COALESCE(json_agg(row_to_json(fb)), '[]'::json) FROM (
        SELECT format, COUNT(*) as count FROM logs
        WHERE user_id = p_user_id AND format IS NOT NULL AND format != ''
        GROUP BY format ORDER BY count DESC) fb),

    'vault_formats', v_vault,
    'watchlist_decades', v_decades
  ) INTO result;

  RETURN result;
END;
$_$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.list_certify_count(p_list_id uuid) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT count(*)::bigint
  FROM public.interactions i
  WHERE i.target_list_id = p_list_id
    AND i.type = 'endorse_list'
    AND EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = p_list_id
        AND (l.is_private = false OR l.user_id = auth.uid())
    );
$$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.list_certify_counts(p_list_ids uuid[]) RETURNS TABLE(list_id uuid, certify_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT t.id, (
    SELECT count(*)::bigint
    FROM public.interactions i
    WHERE i.target_list_id = t.id
      AND i.type = 'endorse_list'
      AND EXISTS (
        SELECT 1 FROM public.lists l
        WHERE l.id = t.id
          AND (l.is_private = false OR l.user_id = auth.uid())
      )
  )
  FROM unnest(p_list_ids) AS t(id);
$$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.lobby_choose_edition(p_edition date DEFAULT ((now() AT TIME ZONE 'UTC'::text))::date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  -- the edition's moment: 00:00 UTC of its day; its regard is the day before it
  v_end   timestamptz := p_edition::timestamp AT TIME ZONE 'UTC';
  v_start timestamptz := (p_edition::timestamp AT TIME ZONE 'UTC') - interval '1 day';
  v_chosen integer;
BEGIN
  -- One chooser at a time; and an edition, once chosen, is never chosen again.
  PERFORM pg_advisory_xact_lock(hashtext('public.lobby_choose_edition'));
  IF EXISTS (SELECT 1 FROM public.lobby_editions WHERE edition = p_edition) THEN
    RETURN 0;
  END IF;

  WITH regard AS (
    -- who marked what in the day before, and how: 'c' certified, 'q' critiqued; never its author
    SELECT 'log'::text AS slot, x.target_log_id AS target, x.user_id AS member, 'c' AS how
      FROM public.interactions x JOIN public.logs l ON l.id = x.target_log_id
     WHERE x.type = 'endorse_log' AND x.user_id <> l.user_id AND x.created_at >= v_start AND x.created_at < v_end
    UNION ALL
    SELECT 'log', c.log_id, c.user_id, 'q'
      FROM public.log_comments c JOIN public.logs l ON l.id = c.log_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> l.user_id AND c.created_at >= v_start AND c.created_at < v_end
    UNION ALL
    SELECT 'list', x.target_list_id, x.user_id, 'c'
      FROM public.interactions x JOIN public.lists s ON s.id = x.target_list_id
     WHERE x.type = 'endorse_list' AND x.user_id <> s.user_id AND x.created_at >= v_start AND x.created_at < v_end
    UNION ALL
    SELECT 'list', c.list_id, c.user_id, 'q'
      FROM public.list_comments c JOIN public.lists s ON s.id = c.list_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> s.user_id AND c.created_at >= v_start AND c.created_at < v_end
    UNION ALL
    SELECT 'post', c.post_id, c.user_id, 'c'
      FROM public.dispatch_certifications c JOIN public.dispatch_posts d ON d.id = c.post_id
     WHERE c.post_id IS NOT NULL AND c.user_id <> d.user_id AND c.created_at >= v_start AND c.created_at < v_end
    UNION ALL
    SELECT 'post', c.post_id, c.user_id, 'q'
      FROM public.dispatch_comments c JOIN public.dispatch_posts d ON d.id = c.post_id
     WHERE c.user_id IS NOT NULL AND c.user_id <> d.user_id AND c.created_at >= v_start AND c.created_at < v_end
  ),
  counted AS (
    -- a banned member's regard counts for nothing
    SELECT r.slot, r.target, count(DISTINCT r.how || r.member::text) AS day
      FROM regard r
      JOIN public.profiles m ON m.id = r.member
     WHERE NOT coalesce(m.is_banned, false)
     GROUP BY r.slot, r.target
  ),
  -- what the wall has shown before: first log, first stack, first three filings
  honoured AS (
    SELECT e.slot, e.target_id, e.author_id, e.edition
      FROM public.lobby_editions e
     WHERE e.edition < p_edition AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END
  ),
  -- the pieces that may hang (the counted ones, and the newest, which a quiet day reaches)
  able AS (
    SELECT 'log'::text AS slot, l.id, l.user_id AS author, l.created_at
      FROM public.logs l JOIN public.profiles p ON p.id = l.user_id
     WHERE btrim(coalesce(l.review, '')) <> '' AND NOT coalesce(l.is_spoiler, false)
       AND l.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'log' AND w.target_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'log' AND r.content_id = l.id::text
                                                        AND coalesce(r.status, 'pending') = 'pending')
       AND (l.id IN (SELECT target FROM counted WHERE slot = 'log')
            OR l.id IN (SELECT n.id FROM public.logs n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE char_length(btrim(coalesce(n.review, ''))) >= 30 AND NOT coalesce(n.is_spoiler, false)
                           AND n.created_at < v_end
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                           AND NOT EXISTS (SELECT 1 FROM honoured h WHERE h.slot = 'log' AND h.target_id = n.id)
                         ORDER BY n.created_at DESC LIMIT 24)
            OR l.id IN (SELECT target_id FROM honoured WHERE slot = 'log'))
    UNION ALL
    SELECT 'list', s.id, s.user_id, s.created_at
      FROM public.lists s JOIN public.profiles p ON p.id = s.user_id
     WHERE NOT coalesce(s.is_private, false)
       AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = s.id) >= 4
       AND s.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'list' AND w.target_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'list' AND r.content_id = s.id::text
                                                        AND coalesce(r.status, 'pending') = 'pending')
       AND (s.id IN (SELECT target FROM counted WHERE slot = 'list')
            OR s.id IN (SELECT n.id FROM public.lists n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE NOT coalesce(n.is_private, false) AND n.created_at < v_end
                           AND (SELECT count(*) FROM public.list_items i WHERE i.list_id = n.id) >= 4
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                           AND NOT EXISTS (SELECT 1 FROM honoured h WHERE h.slot = 'list' AND h.target_id = n.id)
                         ORDER BY n.created_at DESC LIMIT 24)
            OR s.id IN (SELECT target_id FROM honoured WHERE slot = 'list'))
    UNION ALL
    SELECT 'post', d.id, d.user_id, d.created_at
      FROM public.dispatch_posts d JOIN public.profiles p ON p.id = d.user_id
     WHERE coalesce(d.is_published, false) AND d.withheld_at IS NULL AND d.ended_at IS NULL
       AND d.spoiler_label IS NULL AND d.created_at < v_end
       AND NOT coalesce(p.is_banned, false) AND NOT coalesce(p.is_social_private, false)
       AND NOT EXISTS (SELECT 1 FROM public.lobby_withheld w WHERE w.kind = 'post' AND w.target_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.content_type = 'dispatch_post' AND r.content_id = d.id::text
                                                        AND coalesce(r.status, 'pending') = 'pending')
       AND (d.id IN (SELECT target FROM counted WHERE slot = 'post')
            OR d.id IN (SELECT n.id FROM public.dispatch_posts n
                          JOIN public.profiles np ON np.id = n.user_id
                         WHERE coalesce(n.is_published, false) AND n.withheld_at IS NULL AND n.ended_at IS NULL
                           AND n.spoiler_label IS NULL AND n.created_at < v_end
                           AND char_length(btrim(coalesce(n.title, '') || ' ' || coalesce(nullif(n.full_content, ''), n.body, ''))) >= 30
                           AND NOT coalesce(np.is_banned, false) AND NOT coalesce(np.is_social_private, false)
                           AND NOT EXISTS (SELECT 1 FROM honoured h WHERE h.slot = 'post' AND h.target_id = n.id)
                         ORDER BY n.created_at DESC LIMIT 24)
            OR d.id IN (SELECT target_id FROM honoured WHERE slot = 'post'))
  ),
  scored AS (
    SELECT a.slot, a.id, a.author, a.created_at, coalesce(c.day, 0) AS day,
           EXISTS (SELECT 1 FROM honoured h WHERE h.slot = a.slot AND h.target_id = a.id) AS had_its_day,
           EXISTS (SELECT 1 FROM honoured h WHERE h.author_id = a.author AND h.edition >= p_edition - 7) AS honoured_lately
      FROM able a LEFT JOIN counted c ON c.slot = a.slot AND c.target = a.id
  ),
  ranked AS (
    SELECT s.*,
           row_number() OVER (PARTITION BY s.slot
                              ORDER BY s.had_its_day, s.day DESC, s.honoured_lately,
                                       s.created_at DESC, s.id) AS merit
      FROM scored s
  ),
  -- one member, one bill: each author's second piece in a slot, and the first log's author among stacks
  spread AS (
    SELECT r.*,
           row_number() OVER (PARTITION BY r.slot, r.author ORDER BY r.merit) AS nth,
           (r.slot = 'list' AND r.author = (SELECT author FROM ranked WHERE slot = 'log' AND merit = 1)) AS holds_the_log
      FROM ranked r
  ),
  placed AS (
    SELECT s.slot, s.id, s.author, s.day,
           row_number() OVER (PARTITION BY s.slot
                              ORDER BY s.holds_the_log, (s.slot = 'post' AND s.nth > 1), s.merit) AS place
      FROM spread s
  )
  INSERT INTO public.lobby_editions (edition, slot, place, target_id, author_id, score)
  SELECT p_edition, slot, place, id, author, day FROM placed WHERE place <= 12;

  GET DIAGNOSTICS v_chosen = ROW_COUNT;

  -- The authors of what hangs are told without a push — once a piece, never again.
  INSERT INTO public.notifications (user_id, type, message, group_key)
  SELECT e.author_id, 'featured',
         CASE e.slot WHEN 'log'  THEN 'Your log hangs in the Lobby today.'
                     WHEN 'list' THEN 'Your stack hangs in the Lobby today.'
                     ELSE             'Your filing hangs in the Lobby today.' END,
         'lobby:' || e.slot || ':' || e.target_id
    FROM public.lobby_editions e
   WHERE e.edition = p_edition
     AND e.place <= CASE e.slot WHEN 'post' THEN 3 ELSE 1 END
     AND NOT EXISTS (SELECT 1 FROM public.notifications n
                      WHERE n.type = 'featured' AND n.group_key = 'lobby:' || e.slot || ':' || e.target_id);

  RETURN v_chosen;
END;
$$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.log_counts_keep_critique() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE public.log_counts SET critique_count = GREATEST(0, critique_count - 1) WHERE log_id = OLD.log_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.log_counts AS c (log_id, critique_count) VALUES (NEW.log_id, 1)
      ON CONFLICT (log_id) DO UPDATE SET critique_count = c.critique_count + 1;
  END IF;
  RETURN NULL;
END $$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.refresh_film_verdict(p_film_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_film_id IS NULL OR p_film_id <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.films AS f (id, avg_rating, rating_count, log_count)
  SELECT
    p_film_id,
    ROUND(AVG(l.rating) FILTER (WHERE l.rating > 0), 2),
    COUNT(*) FILTER (WHERE l.rating > 0),
    COUNT(*)
  FROM public.logs l
  WHERE l.film_id = p_film_id
  ON CONFLICT (id) DO UPDATE
    SET avg_rating   = EXCLUDED.avg_rating,
        rating_count = EXCLUDED.rating_count,
        log_count    = EXCLUDED.log_count;
END;
$$;

-- As H-B2.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.resolve_moderation_report_v2(p_report_id uuid, p_action text, p_admin_id uuid, p_reason text, p_duration_hours integer DEFAULT NULL::integer, p_notify_user boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id       uuid := auth.uid();
  v_target_user_id uuid;
  v_reporter_id    uuid;
  v_content_id     uuid;
  v_content_type   text;
  v_expires_at     timestamptz;
  v_notice         text;
  v_snapshot       jsonb;
  v_kept           jsonb;
  v_rows           integer;
  v_held_until     timestamptz;
  v_held_banned    boolean;
  v_action_id      uuid;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  -- Read pending and locked: a second verdict given at the same moment waits here for the first,
  -- then reads the case again as the first left it, no longer pending, and is refused.
  SELECT target_user_id, reporter_id, content_id, content_type
  INTO v_target_user_id, v_reporter_id, v_content_id, v_content_type
  FROM reports
  WHERE id = p_report_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_JUDGED' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_user_id IS NULL AND p_action NOT IN ('dismiss', 'delete_content') THEN
    RAISE EXCEPTION 'That member has deleted their account. Only dismiss or delete_content remain.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_action IN ('suspend', 'mute_user') AND (p_duration_hours IS NULL OR p_duration_hours <= 0) THEN
    RAISE EXCEPTION 'A duration in hours is required for %', p_action USING ERRCODE = 'P0001';
  END IF;

  IF p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  -- The copy of what a removal takes: the piece as it stands (piece_as_it_stands), and, where its row
  -- stays to be put back (a salon message struck through, a filing emptied, a page's or a salon's words
  -- cleared), the fields that put it back, should the removal be overturned on appeal.
  IF p_action = 'delete_content' THEN
    v_snapshot := public.piece_as_it_stands(v_content_type, v_content_id);
    v_kept := CASE v_content_type
      WHEN 'lounge_message' THEN (SELECT jsonb_build_object('content', content) FROM lounge_messages WHERE id = v_content_id)
      WHEN 'dispatch_post' THEN (SELECT jsonb_build_object('body', body, 'full_content', full_content, 'title', title,
                                   'subject_image', subject_image, 'subject_backdrop', subject_backdrop, 'source', source,
                                   'source_url', source_url, 'spoiler_label', spoiler_label) FROM dispatch_posts WHERE id = v_content_id)
      WHEN 'dossier' THEN (SELECT jsonb_build_object('body', body, 'full_content', full_content, 'title', title,
                                   'subject_image', subject_image, 'subject_backdrop', subject_backdrop, 'source', source,
                                   'source_url', source_url, 'spoiler_label', spoiler_label) FROM dispatch_posts WHERE id = v_content_id)
      WHEN 'profile' THEN (SELECT jsonb_build_object('bio', bio, 'display_name', display_name, 'avatar_url', avatar_url,
                                   'social_links', social_links) FROM profiles WHERE id = v_content_id)
      WHEN 'lounge' THEN (SELECT jsonb_build_object('name', name, 'description', description, 'cover_image', cover_image)
                            FROM lounges WHERE id = v_content_id)
    END;
    v_snapshot := v_snapshot || jsonb_build_object('type', v_content_type, 'id', v_content_id)
               || CASE WHEN v_kept IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('kept', v_kept) END;
  END IF;

  -- Closed only while still pending: the lock above holds it so, and this says so as well.
  UPDATE reports
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = v_admin_id,
      resolution_action = p_action
  WHERE id = p_report_id AND status = 'pending';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ALREADY_JUDGED' USING ERRCODE = 'P0002';
  END IF;

  CASE p_action
    WHEN 'warn' THEN
      INSERT INTO warnings (user_id, admin_id, reason)
      VALUES (v_target_user_id, v_admin_id, p_reason);
      UPDATE profiles SET warning_count = warning_count + 1
      WHERE id = v_target_user_id;

    WHEN 'suspend', 'mute_user' THEN
      -- The later end stands: a shorter sentence given after a longer one never cuts it short. The
      -- member's page carries the reason of the sentence that governs (a ban's, while one stands).
      SELECT suspended_until, coalesce(is_banned, false) INTO v_held_until, v_held_banned
        FROM profiles WHERE id = v_target_user_id FOR UPDATE;
      UPDATE profiles
      SET suspended_until = GREATEST(suspended_until, v_expires_at),
          suspension_reason = CASE
            WHEN v_held_banned OR (v_held_until IS NOT NULL AND v_held_until >= v_expires_at) THEN suspension_reason
            WHEN p_action = 'mute_user' THEN 'Muted: ' || p_reason
            ELSE p_reason END
      WHERE id = v_target_user_id;

    WHEN 'ban' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'permanent_exile' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = 'PERMANENT EXILE: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'delete_content' THEN
      -- Whether the piece still stands, asked of the tables that hold it before anything is taken:
      -- a filing is never deleted, only emptied (dispatch_no_hard_delete answers its DELETE with no
      -- row), and a legacy essay or critique is removed through a view, so a removal's own row
      -- count cannot say. A piece already gone took nothing: nothing is recorded or told, and the
      -- case stays pending (the raise undoes the close above).
      IF NOT public.piece_stands(v_content_type, v_content_id) THEN
        RAISE EXCEPTION 'PIECE_GONE' USING ERRCODE = 'P0002';
      END IF;
      CASE v_content_type
        WHEN 'log'             THEN DELETE FROM logs              WHERE id = v_content_id;
        WHEN 'list'            THEN DELETE FROM lists             WHERE id = v_content_id;
        WHEN 'log_comment'     THEN DELETE FROM log_comments      WHERE id = v_content_id;
        WHEN 'list_comment'    THEN DELETE FROM list_comments     WHERE id = v_content_id;
        WHEN 'dossier'         THEN DELETE FROM dispatch_dossiers WHERE id = v_content_id;
        WHEN 'dossier_comment' THEN DELETE FROM dossier_comments  WHERE id = v_content_id;
        WHEN 'dispatch_post'    THEN DELETE FROM dispatch_posts    WHERE id = v_content_id;
        WHEN 'dispatch_comment' THEN DELETE FROM dispatch_comments WHERE id = v_content_id;
        WHEN 'lounge_message' THEN
          UPDATE lounge_messages
             SET content = '', deleted_at = now()
           WHERE id = v_content_id AND deleted_at IS NULL;
        -- A page is a member's, not a piece: what is taken is what they wrote on it, never the page.
        -- Its words, the name it shows, its picture and its links; its handle stays (a ban answers that).
        WHEN 'profile' THEN
          UPDATE profiles
             SET bio = NULL, display_name = NULL, avatar_url = NULL, social_links = '{}'::jsonb
           WHERE id = v_content_id;
        -- A salon is a place: what is taken is what it is called and shows, never its rooms or the
        -- words members left in it.
        WHEN 'lounge' THEN
          UPDATE lounges
             SET name = 'An Unnamed Salon', description = '', cover_image = NULL
           WHERE id = v_content_id;
        ELSE
          RAISE EXCEPTION 'Cannot remove content of type %', COALESCE(v_content_type, 'unknown')
            USING ERRCODE = 'P0001';
      END CASE;

    WHEN 'dismiss' THEN
      NULL;

    ELSE
      RAISE EXCEPTION 'Unknown moderation action: %', p_action USING ERRCODE = 'P0001';
  END CASE;

  INSERT INTO mod_actions (report_id, target_user_id, admin_id, action, reason,
                           duration_hours, expires_at, content_snapshot)
  VALUES (p_report_id, v_target_user_id, v_admin_id, p_action, p_reason,
          p_duration_hours, v_expires_at, v_snapshot)
  RETURNING id INTO v_action_id;

  IF p_notify_user THEN
    IF v_reporter_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, message, metadata)
      VALUES (
        v_reporter_id,
        'moderation',
        'Your Report Was Reviewed',
        'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
        'Thank you for looking after the house. Your report was reviewed, and the matter is settled.',
        jsonb_build_object('report_id', p_report_id, 'action', p_action)
      );
    END IF;

    IF p_action != 'dismiss' AND v_target_user_id IS NOT NULL THEN
      v_notice := CASE p_action
        WHEN 'warn' THEN 'After reviewing a report, the house has issued a formal warning.'
        WHEN 'suspend' THEN 'After reviewing a report, the house has paused your membership for ' || COALESCE(p_duration_hours::text, 'a number of') || ' hours.'
        WHEN 'mute_user' THEN 'After reviewing a report, the house has muted your account for a time.'
        WHEN 'ban' THEN 'After reviewing a report, the house has closed your membership until further notice.'
        WHEN 'permanent_exile' THEN 'After reviewing a report, the house has permanently closed your membership.'
        WHEN 'delete_content' THEN CASE v_content_type
          WHEN 'profile' THEN 'After reviewing a report, the house has cleared the words and picture on your page.'
          WHEN 'lounge' THEN 'After reviewing a report, the house has cleared the name, description and cover of your salon.'
          ELSE 'After reviewing a report, the house has removed a piece of your content.' END
        ELSE 'The house has reviewed a report concerning your account.'
      END
      -- A shorter sentence than the one standing: the member is told the longer one stands, and to when.
      || CASE WHEN p_action IN ('suspend', 'mute_user') AND NOT v_held_banned
                   AND v_held_until IS NOT NULL AND v_held_until >= v_expires_at
              THEN ' The longer pause already in place stands, to '
                   || to_char(v_held_until AT TIME ZONE 'UTC', 'DD Mon YYYY HH24:MI "UTC"') || '.'
              ELSE '' END
      || ' Reason: ' || p_reason;

      INSERT INTO notifications (user_id, type, title, body, message, metadata)
      VALUES (
        v_target_user_id,
        'moderation',
        'A Notice from the House',
        v_notice,
        v_notice,
        jsonb_build_object('action', p_action, 'reason', p_reason, 'expires_at', v_expires_at, 'mod_action_id', v_action_id)
      );
    END IF;
  END IF;
END;
$$;

-- As live-schema left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.taste_shape(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  WITH l AS (
    SELECT round(rating) AS reel,
           CASE WHEN year::text ~ '^\d{1,4}$' THEN (year::text::int / 10) * 10 END AS decade
      FROM public.logs WHERE user_id = p_user_id
  )
  SELECT jsonb_build_object(
    'logs', (SELECT count(*) FROM l),
    'ratings', (SELECT jsonb_agg((SELECT count(*) FROM l WHERE l.reel = r) ORDER BY r)
                  FROM generate_series(1, 5) AS r),
    'decades', coalesce((SELECT jsonb_object_agg(decade::text, n)
                           FROM (SELECT decade, count(*) AS n FROM l
                                  WHERE decade IS NOT NULL AND decade > 0 GROUP BY decade) d), '{}'::jsonb)
  );
$_$;

-- As H-B5.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.piece_as_it_stands(p_type text, p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_title text;
  v_body  text;
  v_route text;
  v_more  jsonb := '{}'::jsonb;
BEGIN
  -- A piece already gone (deleted, withdrawn, emptied by an earlier removal) is asked as the verdict
  -- asks it (piece_stands): the two can never disagree.
  IF p_id IS NULL OR NOT public.piece_stands(p_type, p_id) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF p_type = 'log' THEN
    SELECT film_title, review, '/log/' || id::text
      INTO v_title, v_body, v_route FROM public.logs WHERE id = p_id;

  ELSIF p_type = 'list' THEN
    SELECT title, description, '/stacks/' || id::text
      INTO v_title, v_body, v_route FROM public.lists WHERE id = p_id;

  ELSIF p_type = 'log_comment' THEN               -- log_comments.body
    SELECT body, '/log/' || log_id::text
      INTO v_body, v_route FROM public.log_comments WHERE id = p_id;

  ELSIF p_type = 'list_comment' THEN              -- list_comments.content
    SELECT content, '/stacks/' || list_id::text
      INTO v_body, v_route FROM public.list_comments WHERE id = p_id;

  ELSIF p_type = 'dossier' THEN
    SELECT title, full_content, '/dossier/' || id::text
      INTO v_title, v_body, v_route FROM public.dispatch_dossiers WHERE id = p_id;

  ELSIF p_type = 'dossier_comment' THEN           -- dossier_comments.body
    SELECT body, '/dossier/' || dossier_id::text
      INTO v_body, v_route FROM public.dossier_comments WHERE id = p_id;

  ELSIF p_type = 'dispatch_post' THEN
    SELECT title, coalesce(full_content, body), '/dispatch/' || id::text
      INTO v_title, v_body, v_route FROM public.dispatch_posts WHERE id = p_id;

  ELSIF p_type = 'dispatch_comment' THEN
    SELECT body, '/dispatch/' || post_id::text
      INTO v_body, v_route FROM public.dispatch_comments WHERE id = p_id;

  ELSIF p_type = 'lounge_message' THEN            -- lounge_messages.content
    SELECT content, '/lounge/' || lounge_id::text
      INTO v_body, v_route FROM public.lounge_messages WHERE id = p_id AND deleted_at IS NULL;

  ELSIF p_type = 'lounge' THEN                    -- a salon is reported for its name, words or cover
    SELECT name, description, '/lounge/' || id::text, jsonb_build_object('cover_image', cover_image)
      INTO v_title, v_body, v_route, v_more FROM public.lounges WHERE id = p_id;

  ELSIF p_type = 'profile' THEN                   -- a page is reported for its words or its picture
    SELECT username, bio, '/user/' || username, jsonb_build_object('display_name', display_name, 'avatar_url', avatar_url)
      INTO v_title, v_body, v_route, v_more FROM public.profiles WHERE id = p_id;

  ELSE
    RETURN jsonb_build_object('found', false);     -- unknown type: a graceful miss
  END IF;

  -- Content deleted since: the route never got set.
  IF v_route IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object('found', true, 'title', v_title, 'body', v_body, 'route', v_route)
      || jsonb_strip_nulls(coalesce(v_more, '{}'::jsonb));
END;
$$;

-- As 20261118_01_the_house_tells_each_thing_once left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.piece_stands(p_type text, p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- Whether a reported piece still stands, as the house removes it: a filing is never deleted, only
  -- ended (its words emptied), and a salon message only withdrawn; every other piece stands while its
  -- row does. A kind no removal reaches (a salon, a profile) stands.
  SELECT CASE p_type
    WHEN 'log'              THEN EXISTS (SELECT 1 FROM public.logs WHERE id = p_id)
    WHEN 'list'             THEN EXISTS (SELECT 1 FROM public.lists WHERE id = p_id)
    WHEN 'log_comment'      THEN EXISTS (SELECT 1 FROM public.log_comments WHERE id = p_id)
    WHEN 'list_comment'     THEN EXISTS (SELECT 1 FROM public.list_comments WHERE id = p_id)
    WHEN 'dossier'          THEN EXISTS (SELECT 1 FROM public.dispatch_posts WHERE id = p_id AND ended_at IS NULL)
    WHEN 'dispatch_post'    THEN EXISTS (SELECT 1 FROM public.dispatch_posts WHERE id = p_id AND ended_at IS NULL)
    WHEN 'dossier_comment'  THEN EXISTS (SELECT 1 FROM public.dispatch_comments WHERE id = p_id)
    WHEN 'dispatch_comment' THEN EXISTS (SELECT 1 FROM public.dispatch_comments WHERE id = p_id)
    WHEN 'lounge_message'   THEN EXISTS (SELECT 1 FROM public.lounge_messages WHERE id = p_id AND deleted_at IS NULL)
    ELSE true
  END
$$;

-- As 20261118_01_the_house_tells_each_thing_once left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.search_logs(p_pattern text, p_handle text DEFAULT NULL::text, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, user_id uuid, film_title text, review text, rating numeric, poster_path text, status text, abandoned_reason text, is_spoiler boolean, created_at timestamp with time zone, username text, role text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $$
#variable_conflict use_column
DECLARE
  v_me      uuid := auth.uid();
  v_hidden  uuid[];
  v_limit   integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_words   text := '%' || p_pattern || '%';
  v_handle  text := CASE WHEN COALESCE(p_handle, '') <> '' THEN '%' || p_handle || '%' END;
  -- The cursor as one bound on (created_at, id), newest first: none is the newest record.
  v_at      timestamp with time zone := COALESCE(p_cursor_at, 'infinity'::timestamp with time zone);
  v_id      uuid := CASE WHEN p_cursor_at IS NULL THEN 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid ELSE p_cursor_id END;
  -- A trigram is three letters or digits in a row: without one, no index can find the words.
  v_pieces  boolean := p_pattern ~ '[[:alnum:]]{3}';
  v_authors uuid[] := '{}'::uuid[];
  v_many    boolean := false;
  v_page    uuid[];
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT public.hidden_authors()), '{}'::uuid[]);

  -- 1. The members the handle finds.
  IF v_handle IS NOT NULL THEN
    SELECT COALESCE(array_agg(a.id), '{}'::uuid[]) INTO v_authors
      FROM (SELECT pa.id FROM public.profiles pa WHERE pa.username ILIKE v_handle ESCAPE '\' LIMIT 1001) a;
    v_many := cardinality(v_authors) > 1000;
  END IF;

  -- 2. The newest 5,000 reviewed records after the cursor, each asked the words; the rule asked of
  -- the records found.
  SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
    FROM (SELECT r.id, r.created_at
            FROM (SELECT l.id, l.created_at, l.user_id, l.film_title, l.review
                    FROM public.logs l
                   WHERE l.review IS NOT NULL AND l.review <> ''
                     AND (l.created_at, l.id) < (v_at, v_id)
                   ORDER BY l.created_at DESC, l.id DESC
                   LIMIT 5000) r
            JOIN public.profiles p ON p.id = r.user_id
           WHERE (r.film_title ILIKE v_words ESCAPE '\' OR r.review ILIKE v_words ESCAPE '\'
                  OR r.user_id = ANY (v_authors)
                  OR (v_many AND EXISTS (SELECT 1 FROM public.profiles pa
                                          WHERE pa.id = r.user_id AND pa.username ILIKE v_handle ESCAPE '\')))
             AND NOT (r.user_id = ANY (v_hidden))
             AND (r.user_id = v_me OR NOT COALESCE(p.is_social_private, false) OR public.can_view_user_data(r.user_id))
           ORDER BY r.created_at DESC, r.id DESC
           LIMIT v_limit) w;
  IF COALESCE(cardinality(v_page), 0) >= v_limit THEN
    NULL;
  ELSIF v_pieces THEN
    -- 3. Not full within the walk: the words are rare, and every record holding them is read by its pieces.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT m.id, m.created_at
              FROM (SELECT l.id, l.created_at, l.user_id
                      FROM public.logs l
                     WHERE l.review IS NOT NULL AND l.review <> ''
                       AND (l.film_title ILIKE v_words ESCAPE '\' OR l.review ILIKE v_words ESCAPE '\')
                    UNION
                    SELECT l.id, l.created_at, l.user_id
                      FROM public.logs l
                     WHERE NOT v_many AND l.user_id = ANY (v_authors)
                       AND l.review IS NOT NULL AND l.review <> ''
                    UNION
                    SELECT l.id, l.created_at, l.user_id
                      FROM public.profiles pa
                      JOIN public.logs l ON l.user_id = pa.id
                     WHERE v_many AND pa.username ILIKE v_handle ESCAPE '\'
                       AND l.review IS NOT NULL AND l.review <> '') m
              JOIN public.profiles p ON p.id = m.user_id
             WHERE (m.created_at, m.id) < (v_at, v_id)
               AND NOT (m.user_id = ANY (v_hidden))
               AND (m.user_id = v_me OR NOT COALESCE(p.is_social_private, false) OR public.can_view_user_data(m.user_id))
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT v_limit) w;
  ELSE
    -- 4. No trigram, and not full within the walk: every reviewed record is read once, in the table's
    -- own order (no index can find the words, and walking them newest first reads each by its index,
    -- some seven times slower), and the newest found make the page. The words and the order are said
    -- so no index answers either.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT l.id, l.created_at
              FROM public.logs l
              JOIN public.profiles p ON p.id = l.user_id
             WHERE l.review IS NOT NULL AND l.review <> ''
               AND (l.created_at, l.id) < (v_at, v_id)
               AND ((l.film_title || '') ILIKE v_words ESCAPE '\' OR (l.review || '') ILIKE v_words ESCAPE '\'
                    OR l.user_id = ANY (v_authors)
                    OR (v_many AND p.username ILIKE v_handle ESCAPE '\'))
               AND NOT (l.user_id = ANY (v_hidden))
               AND (l.user_id = v_me OR NOT COALESCE(p.is_social_private, false) OR public.can_view_user_data(l.user_id))
             ORDER BY (l.created_at + interval '0 seconds') DESC, l.id DESC
             LIMIT v_limit) w;
  END IF;

  RETURN QUERY
  SELECT l.id, l.user_id, l.film_title, l.review, l.rating, l.poster_path, l.status, l.abandoned_reason,
         COALESCE(l.is_spoiler, false), l.created_at, p.username, p.role
    FROM unnest(v_page) WITH ORDINALITY AS g(log_id, n)
    JOIN public.logs l ON l.id = g.log_id
    JOIN public.profiles p ON p.id = l.user_id
   ORDER BY g.n;
END $$;

-- As 20261119_19_the_stacks_are_found_by_their_words left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.search_stacks(p_pattern text, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, user_id uuid, title text, description text, is_ranked boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $$
#variable_conflict use_column
DECLARE
  v_me     uuid := auth.uid();
  v_hidden uuid[];
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
  v_words  text := '%' || p_pattern || '%';
  -- The cursor as one bound on (created_at, id), newest first: none is the newest stack.
  v_at     timestamp with time zone := COALESCE(p_cursor_at, 'infinity'::timestamp with time zone);
  v_id     uuid := CASE WHEN p_cursor_at IS NULL THEN 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid ELSE p_cursor_id END;
  -- A trigram is three letters or digits in a row: without one, no index can find the words.
  v_pieces boolean := p_pattern ~ '[[:alnum:]]{3}';
  v_few    boolean := false;
  v_page   uuid[];
BEGIN
  IF COALESCE(p_pattern, '') = '' THEN
    RETURN;
  END IF;
  v_hidden := COALESCE((SELECT public.hidden_authors()), '{}'::uuid[]);

  -- 1. Counted by the trigram indexes, to 1,000.
  IF v_pieces THEN
    SELECT count(*) < 1000 INTO v_few
      FROM (SELECT 1 FROM public.lists l
             WHERE l.is_private = false
               AND (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\')
             LIMIT 1000) c;
  END IF;

  IF v_few THEN
    -- 2. The few stacks that hold the words, newest first, the rule asked of each in that order.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT m.id, m.created_at
              FROM (SELECT l.id, l.created_at, l.user_id
                      FROM public.lists l
                     WHERE l.is_private = false
                       AND (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\')
                       AND (l.created_at, l.id) < (v_at, v_id)
                    -- Read by the indexes and sorted before any stack is asked the rule.
                    OFFSET 0) m
              LEFT JOIN public.profiles p ON p.id = m.user_id
             WHERE NOT (m.user_id = ANY (v_hidden))
               AND (m.user_id = v_me
                    OR (p.id IS NOT NULL AND NOT COALESCE(p.is_social_private, false))
                    OR public.can_view_user_data(m.user_id))
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT v_limit) w;
  ELSE
    -- 3. Many, or no trigram: the public stacks newest first, each asked the words, then the rule.
    SELECT array_agg(w.id ORDER BY w.created_at DESC, w.id DESC) INTO v_page
      FROM (SELECT l.id, l.created_at
              FROM public.lists l
              LEFT JOIN public.profiles p ON p.id = l.user_id
             WHERE l.is_private = false
               AND (l.created_at, l.id) < (v_at, v_id)
               AND (l.title ILIKE v_words ESCAPE '\' OR l.description ILIKE v_words ESCAPE '\')
               AND NOT (l.user_id = ANY (v_hidden))
               AND (l.user_id = v_me
                    OR (p.id IS NOT NULL AND NOT COALESCE(p.is_social_private, false))
                    OR public.can_view_user_data(l.user_id))
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT v_limit) w;
  END IF;

  RETURN QUERY
  SELECT l.id, l.user_id, l.title, l.description, l.is_ranked, l.created_at
    FROM unnest(v_page) WITH ORDINALITY AS g(list_id, n)
    JOIN public.lists l ON l.id = g.list_id
   ORDER BY g.n;
END $$;

-- As H-B6.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_my_verdict(p_action_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid := auth.uid();
  m    public.mod_actions%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  -- One's own verdicts alone; a dismissal of a report about one is no verdict on one.
  SELECT * INTO m FROM public.mod_actions
   WHERE id = p_action_id AND target_user_id = v_me AND action <> 'dismiss';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERDICT_GONE' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', m.id,
    'action', m.action,
    'reason', m.reason,
    'created_at', m.created_at,
    'duration_hours', m.duration_hours,
    'expires_at', m.expires_at,
    -- What a removal took: the member's own words, kept with the verdict.
    'removed', CASE WHEN m.action = 'delete_content' AND m.content_snapshot IS NOT NULL
                    THEN jsonb_strip_nulls(jsonb_build_object('title', m.content_snapshot ->> 'title', 'body', m.content_snapshot ->> 'body')) END,
    -- Whether an overturned removal puts the piece back where it stood, or only hands back its words.
    'restorable', m.content_snapshot ? 'kept',
    'lifted_at', m.lifted_at,
    'lift_reason', m.lift_reason,
    'appeal', CASE WHEN m.appeal IS NULL THEN NULL ELSE jsonb_build_object(
                'text', m.appeal, 'filed_at', m.appeal_filed_at, 'status', m.appeal_status,
                'judged_at', m.appeal_judged_at, 'note', m.appeal_note) END,
    'can_appeal', m.appeal IS NULL,
    -- An appeal no moderator may hear yet (the house's one moderator ruled it, or it is about them): it
    -- waits for another, and the member is told so (the owner's decision, 2026-11-19).
    'no_moderator_yet', m.appeal_status = 'pending' AND NOT private.an_appeal_may_be_heard(m.admin_id, m.target_user_id));
END;
$$;

-- As H-B6.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.file_appeal(p_action_id uuid, p_appeal text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_words text := btrim(coalesce(public.clean_member_text(p_appeal), ''));
  m       public.mod_actions%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_words) = 0 OR char_length(v_words) > 1000 THEN
    RAISE EXCEPTION 'An appeal is between 1 and 1,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  -- Held while it is written: two presses at once file one appeal, the second refused.
  -- A member silenced or suspended may still appeal: the appeal is how they answer it.
  SELECT * INTO m FROM public.mod_actions
   WHERE id = p_action_id AND target_user_id = v_me AND action <> 'dismiss'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERDICT_GONE' USING ERRCODE = 'P0002';
  END IF;
  IF m.appeal IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_APPEALED' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.mod_actions
     SET appeal = v_words, appeal_filed_at = now(), appeal_status = 'pending'
   WHERE id = p_action_id;
END;
$$;

-- As H-B6.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_pending_appeals(p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  -- Oldest first, as a court hears them: a page at a time, keyset on the moment filed and the verdict.
  -- Asked of the partial index mod_actions_appeals_waiting (H-B6.index), never every verdict.
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', m.id,
             'action', m.action,
             'reason', m.reason,
             'created_at', m.created_at,
             'duration_hours', m.duration_hours,
             'expires_at', m.expires_at,
             'lifted_at', m.lifted_at,
             'appeal', m.appeal,
             'appeal_filed_at', m.appeal_filed_at,
             -- The one who ruled may not hear it: the screen says so, and the house refuses it.
             'ruled_by_you', m.admin_id IS NOT DISTINCT FROM v_admin_id,
             -- Why this moderator may not hear it (the one who ruled, or the member it is about), or none.
             'refused', private.a_judge_is_refused(v_admin_id, m.admin_id, m.target_user_id),
             -- No moderator of the house may hear it yet: it waits for another to be appointed.
             'no_moderator_yet', NOT private.an_appeal_may_be_heard(m.admin_id, m.target_user_id),
             'ruled_by', (SELECT a.username FROM public.profiles a WHERE a.id = m.admin_id),
             'member', jsonb_build_object('id', t.id, 'username', t.username, 'avatar_url', t.avatar_url,
                         'is_banned', coalesce(t.is_banned, false),
                         'exiled', coalesce(t.is_banned, false) AND coalesce(t.suspension_reason, '') LIKE 'PERMANENT EXILE:%',
                         'suspended_until', CASE WHEN t.suspended_until > now() THEN t.suspended_until END),
             'case', (SELECT jsonb_build_object('content_type', r.content_type, 'reason', r.reason, 'details', r.details)
                        FROM public.reports r WHERE r.id = m.report_id),
             'removed', CASE WHEN m.action = 'delete_content' AND m.content_snapshot IS NOT NULL
                             THEN jsonb_strip_nulls(jsonb_build_object('title', m.content_snapshot ->> 'title', 'body', m.content_snapshot ->> 'body')) END,
             'restorable', m.content_snapshot ? 'kept')
           ORDER BY m.appeal_filed_at, m.id)
      FROM (
        SELECT * FROM public.mod_actions q
         WHERE q.appeal_status = 'pending'
           AND (p_cursor_at IS NULL OR (q.appeal_filed_at, q.id) > (p_cursor_at, p_cursor_id))
         ORDER BY q.appeal_filed_at, q.id
         LIMIT LEAST(GREATEST(coalesce(p_limit, 20), 1), 50)
      ) m
      LEFT JOIN public.profiles t ON t.id = m.target_user_id
  ), '[]'::jsonb);
END;
$$;

-- As H-B6.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.judge_appeal(p_action_id uuid, p_outcome text, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_note     text := btrim(coalesce(p_note, ''));
  m          public.mod_actions%ROWTYPE;
  v_snap     jsonb;
  v_kept     jsonb;
  v_type     text;
  v_id       uuid;
  v_rows     integer := 0;
  v_effect   text := '';
  v_notice   text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('upheld', 'overturned') THEN
    RAISE EXCEPTION 'An appeal is upheld or overturned.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_note) = 0 OR char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'A word for the member of up to 500 characters is required.' USING ERRCODE = 'P0001';
  END IF;

  -- Held while it is heard: a second moderator hearing it at the same moment waits, then is refused.
  SELECT * INTO m FROM public.mod_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND OR m.appeal IS NULL THEN
    RAISE EXCEPTION 'VERDICT_GONE' USING ERRCODE = 'P0002';
  END IF;
  IF m.appeal_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'ALREADY_JUDGED' USING ERRCODE = 'P0002';
  END IF;
  -- The owner's rule (a_judge_is_refused, the house's one rule of who may judge a case): the one who
  -- ruled never hears the appeal of their own verdict, nor does the member the verdict is about.
  IF private.a_judge_is_refused(v_admin_id, m.admin_id, m.target_user_id) IS NOT NULL THEN
    RAISE EXCEPTION '%', private.a_judge_is_refused(v_admin_id, m.admin_id, m.target_user_id) USING ERRCODE = '42501';
  END IF;

  UPDATE public.mod_actions
     SET appeal_status = p_outcome, appeal_judged_by = v_admin_id, appeal_judged_at = now(), appeal_note = v_note
   WHERE id = p_action_id;

  IF p_outcome = 'overturned' THEN
    -- Struck: the verdict no longer holds the member's standing, and the record says so.
    UPDATE public.mod_actions
       SET lifted_at = now(), lifted_by = v_admin_id, lift_reason = 'Overturned on appeal: ' || v_note
     WHERE id = p_action_id AND lifted_at IS NULL;

    IF m.action = 'warn' AND m.target_user_id IS NOT NULL THEN
      -- The warning it wrote (in the verdict's own moment) is withdrawn, and the count with it.
      DELETE FROM public.warnings
       WHERE id = (SELECT w.id FROM public.warnings w
                    WHERE w.user_id = m.target_user_id AND w.reason = m.reason AND w.created_at = m.created_at
                    ORDER BY w.id LIMIT 1);
      UPDATE public.profiles SET warning_count = GREATEST(coalesce(warning_count, 0) - 1, 0) WHERE id = m.target_user_id;
      v_effect := 'The warning is withdrawn.';

    ELSIF m.action IN ('suspend', 'mute_user') AND m.target_user_id IS NOT NULL THEN
      PERFORM public.standing_from_verdicts(m.target_user_id, 'suspension');
      v_effect := 'The pause it set no longer holds.';

    ELSIF m.action IN ('ban', 'permanent_exile') AND m.target_user_id IS NOT NULL THEN
      PERFORM public.standing_from_verdicts(m.target_user_id, 'ban');
      v_effect := 'The closing it set no longer holds.';

    ELSIF m.action = 'delete_content' THEN
      -- Put back where its row still stands, and only as the house left it (never over what its
      -- author has written since).
      v_snap := coalesce(m.content_snapshot, '{}'::jsonb);
      v_kept := v_snap -> 'kept';
      v_type := coalesce(v_snap ->> 'type', (SELECT r.content_type FROM public.reports r WHERE r.id = m.report_id));
      v_id := coalesce(
        CASE WHEN (v_snap ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (v_snap ->> 'id')::uuid END,
        (SELECT CASE WHEN r.content_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN r.content_id::uuid END
           FROM public.reports r WHERE r.id = m.report_id));
      IF v_type = 'lounge_message' AND coalesce(v_kept ->> 'content', v_snap ->> 'body') IS NOT NULL THEN
        UPDATE public.lounge_messages
           SET content = coalesce(v_kept ->> 'content', v_snap ->> 'body'), deleted_at = NULL
         WHERE id = v_id AND deleted_at IS NOT NULL AND content = '';
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        -- Whole: the replies that quoted it have their quotes back, as the withdrawal took them.
        IF v_rows > 0 THEN
          UPDATE public.lounge_messages r SET reply_to_content = coalesce(v_kept ->> 'content', v_snap ->> 'body')
           WHERE r.reply_to_id = v_id AND r.reply_to_content IS NULL;
        END IF;
      ELSIF v_type IN ('dispatch_post', 'dossier') AND v_kept IS NOT NULL THEN
        UPDATE public.dispatch_posts
           SET body = coalesce(v_kept ->> 'body', ''), full_content = v_kept ->> 'full_content', title = v_kept ->> 'title',
               subject_image = v_kept ->> 'subject_image', subject_backdrop = v_kept ->> 'subject_backdrop',
               source = v_kept ->> 'source', source_url = v_kept ->> 'source_url', spoiler_label = v_kept ->> 'spoiler_label',
               ended_at = NULL, ended_by = NULL
         WHERE id = v_id AND ended_by = 'house';
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      ELSIF v_type = 'profile' AND v_kept IS NOT NULL THEN
        UPDATE public.profiles
           SET bio = coalesce(bio, v_kept ->> 'bio'),
               display_name = coalesce(display_name, v_kept ->> 'display_name'),
               avatar_url = coalesce(avatar_url, v_kept ->> 'avatar_url'),
               social_links = CASE WHEN social_links IS NULL OR social_links = '{}'::jsonb THEN coalesce(v_kept -> 'social_links', '{}'::jsonb) ELSE social_links END
         WHERE id = v_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      ELSIF v_type = 'lounge' AND v_kept IS NOT NULL THEN
        UPDATE public.lounges
           SET name = CASE WHEN name = 'An Unnamed Salon' THEN coalesce(v_kept ->> 'name', name) ELSE name END,
               description = CASE WHEN coalesce(description, '') = '' THEN coalesce(v_kept ->> 'description', '') ELSE description END,
               cover_image = coalesce(cover_image, v_kept ->> 'cover_image')
         WHERE id = v_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      END IF;
      v_effect := CASE WHEN v_rows > 0 THEN 'What it removed stands again where it was.'
                       ELSE 'What it removed is kept for you with the verdict, to file again.' END;
    END IF;
  END IF;

  IF m.target_user_id IS NOT NULL THEN
    v_notice := CASE p_outcome
      WHEN 'upheld' THEN 'The Tribunal has heard your appeal and upholds the verdict.'
      ELSE 'The Tribunal has heard your appeal and overturns the verdict: it is struck from your record. ' || v_effect
    END || ' The Tribunal''s word: ' || v_note;
    INSERT INTO public.notifications (user_id, type, title, body, message, metadata)
    VALUES (m.target_user_id, 'moderation', 'Your Appeal Was Heard', v_notice, v_notice,
            jsonb_build_object('action', 'appeal', 'outcome', p_outcome, 'mod_action_id', m.id));
  END IF;
END;
$$;

-- As 20261117_01_what_happened_meanwhile_is_told left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.member_viewings(p_user_id uuid)
RETURNS TABLE(log_id uuid, viewing_id uuid, film_id integer, day date, rating numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT l.id, l.viewing_id, l.film_id, l.watched_date, l.rating
    FROM public.logs l
   WHERE l.user_id = p_user_id
  UNION ALL
  SELECT l.id,
         CASE WHEN pg_input_is_valid(e->>'viewingId', 'uuid') THEN (e->>'viewingId')::uuid END,
         l.film_id,
         COALESCE(CASE WHEN e->>'date' ~ '^\d{4}-\d{2}-\d{2}' AND pg_input_is_valid(left(e->>'date', 10), 'date')
                       THEN left(e->>'date', 10)::date END,
                  l.created_at::date),
         CASE WHEN pg_input_is_valid(e->>'rating', 'numeric') THEN (e->>'rating')::numeric END
    FROM public.logs l
   CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(l.viewing_history) = 'array' THEN l.viewing_history ELSE '[]'::jsonb END) AS e
   WHERE l.user_id = p_user_id
     AND jsonb_typeof(e) = 'object';
$$;

-- As H-A5.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
CREATE OR REPLACE FUNCTION public.get_community_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean, alt_poster text, physical_media text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH me AS (SELECT private.hidden_authors() AS hidden)
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
    AND NOT COALESCE(l.user_id = ANY ((SELECT private.hidden_authors())::uuid[]), false)
    AND (
      p_cursor_created_at IS NULL
      OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
$$;

-- As H-A5.up left it.
-- add-only (3): it only fixes: the undo of H-B10 (TestFlight build 41 and the website read it so)
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
       AND NOT private.is_hidden_by(auth.uid(), l.user_id)
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
       AND NOT private.is_hidden_by(auth.uid(), s.user_id)
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

-- add-only (1): no shipped client uses it: a function H-B10 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.get_my_withheld_pieces();
-- add-only (1): no shipped client uses it: a function H-B10 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.expire_withheld_pieces();
-- add-only (1): no shipped client uses it: a function H-B10 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.delete_withheld_piece(uuid, boolean);
-- add-only (1): no shipped client uses it: a function H-B10 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.give_back_withheld_piece(uuid);
-- add-only (1): no shipped client uses it: a function H-B10 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.withhold_piece(uuid, text, uuid);
-- add-only (1): no shipped client uses it: a function H-B10 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_withheld_piece_turns_its_cards(text, uuid, boolean);
-- add-only (1): no shipped client uses it: a function H-B10 made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.withheld_kind(text);
