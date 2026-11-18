-- Undo of 20261117_01: a verdict is judged as before, a gone salon, record or stack is refused as
-- before, an admission answers nothing, the ballot's running count, every viewing's count and the
-- reader's critique count are gone, a certification taken back leaves its notice, a rename is put
-- back as before, an account is deleted with its words kept unsigned, no choice offered, a withdrawn
-- salon message reads as found to a moderator, a certification may push again, and a shared card
-- keeps its headline. The notices a certification took with it, and the headlines a gone card
-- gave up, are not put back. The triggers on these functions go first, with the undo of
-- 20261117_02.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── Undo: a member who leaves may take their words with them (review round 11) ──
-- The call loses its erase choice and is put back exactly as 20261016_02 left it: a departed member's
-- words stay, unsigned, and the old Dispatch tables and a stack's card keep the handle, as before.
DROP FUNCTION IF EXISTS public.request_account_deletion(boolean);

CREATE FUNCTION public.request_account_deletion() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid      uuid := auth.uid();
  v_handle text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT username INTO v_handle FROM public.profiles WHERE id = uid;

  -- The member has asked; what follows is the house's own act.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  UPDATE public.lounges l
     SET creator_id = (
           SELECT m.user_id FROM public.lounge_members m
            WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved'
            ORDER BY m.joined_at ASC NULLS LAST
            LIMIT 1)
   WHERE l.creator_id = uid
     AND EXISTS (SELECT 1 FROM public.lounge_members m
                  WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved');

  UPDATE public.log_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dossier_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dispatch_dossiers
     SET user_id = NULL, author_username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.lounge_messages
     SET reply_to_username = '[deleted]'
   WHERE reply_to_id IN (SELECT id FROM public.lounge_messages WHERE user_id = uid);

  DELETE FROM public.notifications WHERE from_user_id = uid;

  IF v_handle IS NOT NULL THEN
    -- Asked as containment, so the cards' own index (lounge_messages_card_names, 20261022_02) finds them.
    UPDATE public.lounge_messages
       SET metadata = (metadata - 'owner_username') - 'author_username'
     WHERE metadata <> '{}'::jsonb
       AND (metadata @> jsonb_build_object('owner_username', v_handle)
         OR metadata @> jsonb_build_object('author_username', v_handle));
  END IF;

  UPDATE public.list_comments   SET user_id = NULL WHERE user_id = uid;
  UPDATE public.lounge_messages SET user_id = NULL WHERE user_id = uid;

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE owner = uid;

  DELETE FROM auth.users WHERE id = uid;
END
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT ALL ON FUNCTION public.request_account_deletion() TO service_role;

-- ── Undo: a shared card whose piece is gone reads as gone (review round 11) ──
-- The erase of a filing as it was (the filing alone), and the stack's trigger's function gone (the
-- trigger went with the undo of 20261117_02).
-- The cards already taken down stay down: the words they copied were their writers' to take back,
-- and are not kept anywhere to put back.
CREATE OR REPLACE FUNCTION public.dispatch_empty_filing(p_post uuid, p_by text) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  UPDATE public.dispatch_posts
     SET body = '', full_content = NULL, title = NULL,
         subject_image = NULL, subject_backdrop = NULL,
         source = NULL, source_url = NULL, spoiler_label = NULL,
         ended_at = now(), ended_by = p_by
   WHERE id = p_post AND ended_at IS NULL;
$$;

COMMENT ON FUNCTION public.dispatch_empty_filing(uuid, text) IS
  'The one erase of a filing that ends. Called by end_filing and the no_hard_delete trigger (both SECURITY DEFINER); no role may call it directly.';

DROP FUNCTION IF EXISTS public.a_deleted_stack_leaves_its_cards();

-- Undo of the round 11 piece for a handle's rename: no chosen rename, and the handle's rule puts an
-- old handle back for every write of its cleaned form, a chosen rename too, as before.
-- add-only (3): it only fixes: the function as it was before round 11 (20261002_02), and the rename function this round made taken away
DROP FUNCTION IF EXISTS public.rename_my_handle(text);

CREATE OR REPLACE FUNCTION public.enforce_username_policy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  reserved text[] := ARRAY[
    'admin','administrator','mod','moderator','support','help',
    'reelhouse','system','root','official','staff','team','bot',
    'null','undefined','anonymous','anon','deleted','unknown',
    'api','www','mail','email','noreply','no_reply',
    'settings','login','signup','logout','feed','discover',
    'profile','edit','delete','create','new','user','users'
  ];
  v_raw    text;
  v_clean  text;
  v_hex    text;
  v_base   text;
  v_n      integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.username = regexp_replace(
           regexp_replace(lower(btrim(coalesce(OLD.username, ''))), '[[:space:]]+', '_', 'g'),
           '[^a-z0-9_]', '', 'g') THEN
    NEW.username := OLD.username;
    RETURN NEW;
  END IF;

  v_raw := coalesce(NEW.username, '');

  v_clean := regexp_replace(
               regexp_replace(lower(btrim(v_raw)), '[[:space:]]+', '_', 'g'),
               '[^a-z0-9_]', '', 'g');

  IF TG_OP = 'UPDATE' THEN
    IF v_clean IS DISTINCT FROM v_raw THEN
      RAISE EXCEPTION 'Usernames may only contain lowercase letters, numbers and underscores.'
        USING ERRCODE = '23514';
    END IF;
    IF length(v_clean) < 3 THEN
      RAISE EXCEPTION 'Username must be at least 3 characters.' USING ERRCODE = '23514';
    END IF;
    IF length(v_clean) > 30 THEN
      RAISE EXCEPTION 'Username must be 30 characters or less.' USING ERRCODE = '23514';
    END IF;
    IF left(v_clean, 1) = '_' OR right(v_clean, 1) = '_' THEN
      RAISE EXCEPTION 'Username cannot start or end with an underscore.' USING ERRCODE = '23514';
    END IF;
    IF position('__' in v_clean) > 0 THEN
      RAISE EXCEPTION 'Username cannot have consecutive underscores.' USING ERRCODE = '23514';
    END IF;
    IF v_clean = ANY(reserved) THEN
      RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514';
    END IF;
    IF public.handle_is_unwelcome(v_clean) THEN
      RAISE EXCEPTION 'This username is not allowed.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE lower(username) = v_clean AND id <> NEW.id) THEN
      RAISE EXCEPTION 'This username is already taken.' USING ERRCODE = '23505';
    END IF;

    NEW.username := v_clean;
    RETURN NEW;
  END IF;

  v_hex := replace(NEW.id::text, '-', '');

  v_clean := regexp_replace(v_clean, '_+', '_', 'g');
  v_clean := btrim(v_clean, '_');
  v_clean := left(v_clean, 30);
  v_clean := btrim(v_clean, '_');

  IF length(v_clean) < 3 THEN
    v_clean := 'user_' || substr(v_hex, 1, 6);
  END IF;

  IF public.handle_is_unwelcome(v_clean) THEN
    v_clean := 'user_' || substr(v_hex, 1, 6);
  END IF;

  v_base := btrim(left(v_clean, 23), '_');
  v_n    := 0;
  WHILE v_clean = ANY(reserved)
        OR EXISTS (SELECT 1 FROM public.profiles
                    WHERE lower(username) = v_clean AND id <> NEW.id)
  LOOP
    v_n := v_n + 1;
    IF v_n > 20 THEN
      RAISE EXCEPTION 'Could not derive an available username.' USING ERRCODE = '23505';
    END IF;
    v_clean := v_base || '_' || substr(v_hex, v_n, 6);
  END LOOP;

  NEW.username := v_clean;
  RETURN NEW;
END;
$$;

-- ── F11 undone · a certification given again pushes again ──────────────────────────────────────
--   tg_notify_push as it was before round 11 (the snapshot's, 20261028_01): every certification's
--   notice is pushed. The memory of the pushes sent goes with its table.
-- add-only (3): it only fixes: the function as it was before round 11, its grants kept (CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.tg_notify_push() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_secret   text;
  v_pref_key text;
BEGIN
  -- Switched off by the owner: every notice stays under the bell, unpushed.
  IF NOT coalesce((SELECT pushes_sent FROM public.house_settings WHERE id), true) THEN
    RETURN NEW;
  END IF;

  -- The Lobby's edition turns at 00:00 UTC, while much of the house sleeps:
  -- its notice waits under the bell and is never pushed.
  IF NEW.type = 'featured' THEN
    RETURN NEW;
  END IF;

  IF NEW.from_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = NEW.user_id      AND blocked_id = NEW.from_user_id)
       OR (blocker_id = NEW.from_user_id AND blocked_id = NEW.user_id AND type = 'block')
  ) THEN
    RETURN NEW;
  END IF;

  v_pref_key := CASE NEW.type
                  WHEN 'follow'         THEN 'notif_follows'
                  WHEN 'follow_request' THEN 'notif_follows'
                  WHEN 'follow_accept'  THEN 'notif_follows'
                  WHEN 'endorse'        THEN 'notif_endorsements'
                  WHEN 'endorse_log'    THEN 'notif_endorsements'
                  WHEN 'comment'        THEN 'notif_comments'
                  WHEN 'annotate'       THEN 'notif_comments'
                  WHEN 'system'         THEN 'notif_system'
                  ELSE NULL
                END;

  IF v_pref_key IS NOT NULL THEN
    IF (SELECT preferences ->> v_pref_key
          FROM public.profiles
         WHERE id = NEW.user_id) = 'false'
    THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notify_push_secret' LIMIT 1;

  PERFORM net.http_post(
    url     := 'https://wihyqkpoymwcvbprslyz.supabase.co/functions/v1/notify-push',
    headers := jsonb_build_object('Content-Type','application/json','x-function-secret', v_secret),
    body    := jsonb_build_object('type','INSERT','table','notifications','record', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;

-- The table itself goes with the undo of 20261117_00, which made it.

-- ── B6 undone · a certification taken back leaves its notice again ──────────────────────────────
--   The two functions are new in round 11: undone, they are gone (their triggers went with the undo
--   of 20261117_02). The notices the up removed (each for a certification already taken back) are
--   not written again: they named an act that no longer stood.

DROP FUNCTION IF EXISTS public.a_certification_takes_its_notice();
DROP FUNCTION IF EXISTS public.a_dispatch_certification_takes_its_notice();

-- ── Undo: a log's critique count is the reader's (review round 11) ──
-- Both feeds as they were (every critique counted, log_counts' number for every reader), and the
-- computed field gone.
CREATE OR REPLACE FUNCTION public.get_community_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean, alt_poster text, physical_media text)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT
    l.id, l.film_id, l.film_title, l.poster_path, l.rating, l.review,
    l.drop_cap, l.status, l.abandoned_reason, l.created_at, l.year,
    l.user_id,
    p.username, p.avatar_url, p.role,
    l.editorial_header, l.pull_quote, l.watched_with,
    l.is_autopsied, l.autopsy, l.is_spoiler,
    COALESCE(c.certify_count, 0) AS certify_count,
    COALESCE(c.critique_count, 0) AS critique_count,
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    )) AS certified,
    l.alt_poster, l.physical_media
  FROM logs l
  JOIN profiles p ON p.id = l.user_id
  LEFT JOIN log_counts c ON c.log_id = l.id
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

CREATE OR REPLACE FUNCTION public.get_following_feed_auth_cursor(p_limit integer DEFAULT 40, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, film_id integer, film_title text, poster_path text, rating numeric, review text, drop_cap boolean, status text, abandoned_reason text, created_at timestamp with time zone, year text, user_id uuid, username text, avatar_url text, role text, editorial_header text, pull_quote text, watched_with text, is_autopsied boolean, autopsy jsonb, is_spoiler boolean, certify_count integer, critique_count integer, certified boolean, alt_poster text, physical_media text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH followed AS (
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
    COALESCE(c.critique_count, 0) AS critique_count,
    EXISTS (
      SELECT 1 FROM public.interactions im
       WHERE im.target_log_id = l.id AND im.user_id = auth.uid() AND im.type = 'endorse_log'
    ) AS certified,
    l.alt_poster, l.physical_media
  FROM page pg
  JOIN public.logs l ON l.id = pg.id
  JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN public.log_counts c ON c.log_id = l.id
  ORDER BY pg.created_at DESC, pg.id DESC;
$$;

DROP FUNCTION IF EXISTS public.critiques_seen(public.logs);

-- Undo of the round 11 piece "every viewing keeps its own day": the calendar and the runs count each
-- record on its own day again (a rewatch moves the earlier night away), the analytics lose
-- current_run and monthly_viewings, and member_viewings and year_viewings are gone. A phone that
-- reads year_viewings is told the house has no such function, and says the year could not be read.

-- add-only (3): it only fixes: the function as it was before round 11
CREATE OR REPLACE FUNCTION public.calendar_days(p_user_id uuid) RETURNS TABLE(day date, films integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- The grid's 364 days end on the member's today: the house's yesterday, today or tomorrow.
  SELECT l.watched_date, count(*)::integer
    FROM public.logs l
   WHERE l.user_id = p_user_id
     AND l.watched_date BETWEEN (now() AT TIME ZONE 'UTC')::date - 364 AND (now() AT TIME ZONE 'UTC')::date + 1
   GROUP BY l.watched_date
   ORDER BY l.watched_date DESC;
$$;

-- add-only (3): it only fixes: the function as it was before round 11
CREATE OR REPLACE FUNCTION public.get_user_analytics(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  result JSON;
  v_vault JSON := '[]'::json;
  v_decades JSON := '[]'::json;
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

  SELECT json_build_object(
    'total_logs', (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id),
    'avg_rating', (SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
                   FROM logs WHERE user_id = p_user_id AND rating > 0),
    'rating_distribution', (
      SELECT COALESCE(json_agg(row_to_json(rd)), '[]'::json) FROM (
        SELECT rating, COUNT(*) as count FROM logs
        WHERE user_id = p_user_id AND rating > 0
        GROUP BY rating ORDER BY rating) rd),

    -- the 12-month window is gone
    'monthly_activity', (
      SELECT COALESCE(json_agg(row_to_json(ma)), '[]'::json) FROM (
        SELECT TO_CHAR(COALESCE(watched_date::date, created_at::date), 'YYYY-MM') as month,
               COUNT(*) as count
        FROM logs WHERE user_id = p_user_id
        GROUP BY month ORDER BY month DESC) ma),

    -- FIXED: was 1 or 0 for every member. ASCENDING is what holds the grouping still.
    'current_streak', (
      WITH dates AS (SELECT DISTINCT COALESCE(watched_date::date, created_at::date) as log_date
                     FROM logs WHERE user_id = p_user_id),
      streak AS (SELECT log_date, log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int AS grp
                 FROM dates)
      SELECT COALESCE((SELECT COUNT(*) FROM streak WHERE grp = (
        SELECT grp FROM streak WHERE log_date >= CURRENT_DATE - 1
        ORDER BY log_date DESC LIMIT 1)), 0)),

    'longest_streak', (
      WITH dates AS (SELECT DISTINCT COALESCE(watched_date::date, created_at::date) as log_date
                     FROM logs WHERE user_id = p_user_id),
      streak AS (SELECT log_date, log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int AS grp
                 FROM dates)
      SELECT COALESCE(MAX(cnt), 0) FROM (SELECT COUNT(*) as cnt FROM streak GROUP BY grp) s),

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

-- add-only (1): no shipped client uses it: functions round 11 made, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.year_viewings(uuid, integer, date, uuid);
-- add-only (1): no shipped client uses it: functions round 11 made, named by no client before it (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS public.member_viewings(uuid);

-- ── B1 undone · no open ballot is counted for its voters ─────────────────────────────────────────
--   ballot_tally is new in round 11: undone, it is gone.

DROP FUNCTION IF EXISTS public.ballot_tally(uuid);

-- Undo of the round 11 piece for accept_follow_request: it answers nothing again, an admission
-- and a request no longer at the door alike.
-- add-only (3): it only fixes: the function as it was before round 11 (20261115_01), with its grants
DROP FUNCTION IF EXISTS public.accept_follow_request(uuid);

CREATE FUNCTION public.accept_follow_request(requester_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me uuid := auth.uid();
  v_granted integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  -- A request across a block admits no one: it is taken from the door instead. One can be
  -- waiting there only if it was made in the same moment as the block.
  IF public.a_block_stands_between(requester_id, v_me) THEN
    DELETE FROM public.interactions
     WHERE user_id = requester_id
       AND target_user_id = v_me
       AND type = 'follow_request';
    RETURN;
  END IF;

  -- Convert follow_request → follow
  UPDATE public.interactions
     SET type = 'follow'
   WHERE user_id = requester_id
     AND target_user_id = v_me
     AND type = 'follow_request';
  GET DIAGNOSTICS v_granted = ROW_COUNT;
  IF v_granted = 0 THEN RETURN; END IF;

  -- the follow count trigger counts inserts and deletes; a granted request is an update, so it is counted here
  UPDATE public.profiles SET followers_count = COALESCE(followers_count, 0) + 1 WHERE id = v_me;
  UPDATE public.profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = requester_id;

  INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message)
  SELECT requester_id, 'follow_accept', p.username, v_me, 'accepted your follow request. You can now view their archive.'
    FROM public.profiles p WHERE p.id = v_me;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_follow_request(requester_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_follow_request(requester_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_follow_request(requester_id uuid) TO service_role;

-- ── Undo: a critique on a page gone is told as such (review round 11) ──
-- The function goes (its two triggers went with the undo of 20261117_02, which made them); a
-- critique on a page gone is refused by the annotate gates (42501) again, as before.
DROP FUNCTION IF EXISTS public.a_critique_has_its_page();

-- ── A2 undone · the two salon doors raise 'Lounge not found' again ───────────────────────────────
--   The definitions of 20261003_07_the_house_keeps_its_own_record.sql, whole.

CREATE OR REPLACE FUNCTION public.join_public_lounge(p_lounge_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_private boolean; v_sanction text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private INTO v_private FROM public.lounges WHERE id = p_lounge_id;
  IF v_private IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF v_private THEN RAISE EXCEPTION 'This lounge is private — request to join'; END IF;
  SELECT status INTO v_sanction FROM public.lounge_sanctions WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_sanction = 'banned' THEN RAISE EXCEPTION 'You cannot join this lounge'; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status)
  VALUES (p_lounge_id, auth.uid(), COALESCE(v_sanction, 'approved'))
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = EXCLUDED.status
    WHERE public.lounge_members.status <> 'banned';
END $$;

CREATE OR REPLACE FUNCTION public.request_lounge_membership(p_lounge_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_private boolean; v_creator uuid; v_status text; v_uname text; v_lname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT is_private, creator_id, name INTO v_private, v_creator, v_lname FROM public.lounges WHERE id = p_lounge_id;
  IF v_private IS NULL THEN RAISE EXCEPTION 'Lounge not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.lounge_sanctions
              WHERE lounge_id = p_lounge_id AND user_id = auth.uid() AND status = 'banned') THEN
    RAISE EXCEPTION 'You cannot request this lounge';
  END IF;
  SELECT status INTO v_status FROM public.lounge_members WHERE lounge_id = p_lounge_id AND user_id = auth.uid();
  IF v_status = 'banned' THEN RAISE EXCEPTION 'You cannot request this lounge'; END IF;
  IF v_status IN ('approved','pending','muted') THEN RETURN; END IF;
  INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (p_lounge_id, auth.uid(), 'pending')
  ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = 'pending'
    WHERE public.lounge_members.status NOT IN ('banned','approved','muted');
  SELECT username INTO v_uname FROM public.profiles WHERE id = auth.uid();
  IF v_creator IS NOT NULL AND v_creator <> auth.uid() THEN
    -- the sender is from_username; every reader prints it before the message
    INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, related_lounge_id)
    VALUES (v_creator, 'system', v_uname, auth.uid(),
            CASE WHEN v_uname IS NULL THEN 'A member is asking' ELSE 'is asking' END
              || ' to enter ' || COALESCE(v_lname,'your lounge') || '.',
            p_lounge_id);
  END IF;
END $$;

-- ── F1 undone · a withdrawn salon message reads as found again ─────────────────────────────────
--   get_report_evidence as it was before round 11 (the snapshot's): a withdrawn salon message is
--   read as found, with its emptied words.
-- add-only (3): it only fixes: the function as it was before round 11, its grants kept (CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.get_report_evidence(p_report_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_type       text;
  v_content_id uuid;
  v_title      text;
  v_body       text;
  v_route      text;
BEGIN
  -- ── Admin gate: identical to resolve_moderation_report_v2 ──
  -- Uses auth.uid() (canonical identity), never a caller-supplied param.
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- ── Resolve the report ──
  SELECT content_type, content_id
    INTO v_type, v_content_id
  FROM reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- ── Fetch the exhibit by content type (columns verified against live schema) ──
  IF v_type = 'log' THEN
    SELECT film_title, review, '/log/' || id::text
      INTO v_title, v_body, v_route FROM logs WHERE id = v_content_id;

  ELSIF v_type = 'list' THEN
    SELECT title, description, '/stacks/' || id::text
      INTO v_title, v_body, v_route FROM lists WHERE id = v_content_id;

  ELSIF v_type = 'log_comment' THEN               -- log_comments.body
    SELECT body, '/log/' || log_id::text
      INTO v_body, v_route FROM log_comments WHERE id = v_content_id;

  ELSIF v_type = 'list_comment' THEN              -- list_comments.content
    SELECT content, '/stacks/' || list_id::text
      INTO v_body, v_route FROM list_comments WHERE id = v_content_id;

  ELSIF v_type = 'dossier' THEN
    SELECT title, full_content, '/dossier/' || id::text
      INTO v_title, v_body, v_route FROM dispatch_dossiers WHERE id = v_content_id;

  ELSIF v_type = 'dossier_comment' THEN           -- dossier_comments.body
    SELECT body, '/dossier/' || dossier_id::text
      INTO v_body, v_route FROM dossier_comments WHERE id = v_content_id;

  ELSIF v_type = 'dispatch_post' THEN
    SELECT title, coalesce(full_content, body), '/dispatch/' || id::text
      INTO v_title, v_body, v_route FROM dispatch_posts WHERE id = v_content_id;

  ELSIF v_type = 'dispatch_comment' THEN
    SELECT body, '/dispatch/' || post_id::text
      INTO v_body, v_route FROM dispatch_comments WHERE id = v_content_id;

  ELSIF v_type = 'lounge_message' THEN            -- lounge_messages.content
    SELECT content, '/lounge/' || lounge_id::text
      INTO v_body, v_route FROM lounge_messages WHERE id = v_content_id;

  ELSIF v_type = 'lounge' THEN
    SELECT name, description, '/lounge/' || id::text
      INTO v_title, v_body, v_route FROM lounges WHERE id = v_content_id;

  ELSIF v_type = 'profile' THEN                   -- route uses username, not id
    SELECT username, bio, '/user/' || username
      INTO v_title, v_body, v_route FROM profiles WHERE id = v_content_id;

  ELSE
    RETURN jsonb_build_object('found', false);     -- unknown type → graceful miss
  END IF;

  -- Content deleted since the report was filed → route never got set
  IF v_route IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'title', v_title,
    'body',  v_body,
    'route', v_route
  );
END;
$$;

-- Undo of the round 11 piece for resolve_moderation_report_v2: a removal of a piece already gone
-- is recorded and told again, and two verdicts on one case may both be carried out.
-- add-only (3): it only fixes: the function as it was before round 11 (20261015_07)
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
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT target_user_id, reporter_id, content_id, content_type
  INTO v_target_user_id, v_reporter_id, v_content_id, v_content_type
  FROM reports
  WHERE id = p_report_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already resolved';
  END IF;

  IF v_target_user_id IS NULL AND p_action NOT IN ('dismiss', 'delete_content') THEN
    RAISE EXCEPTION 'That member has deleted their account. Only dismiss or delete_content remain.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_action IN ('suspend', 'mute_user') AND (p_duration_hours IS NULL OR p_duration_hours <= 0) THEN
    RAISE EXCEPTION 'A duration in hours is required for %', p_action USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'delete_content' AND v_content_type = 'profile' THEN
    RAISE EXCEPTION 'A profile is not content. Use ban or permanent_exile.' USING ERRCODE = 'P0001';
  END IF;

  IF p_duration_hours IS NOT NULL THEN
    v_expires_at := now() + (p_duration_hours || ' hours')::interval;
  END IF;

  IF p_action = 'delete_content' THEN
    v_snapshot := public.get_report_evidence(p_report_id);
  END IF;

  UPDATE reports
  SET status = 'resolved',
      resolved_at = now(),
      resolved_by = v_admin_id,
      resolution_action = p_action
  WHERE id = p_report_id;

  CASE p_action
    WHEN 'warn' THEN
      INSERT INTO warnings (user_id, admin_id, reason)
      VALUES (v_target_user_id, v_admin_id, p_reason);
      UPDATE profiles SET warning_count = warning_count + 1
      WHERE id = v_target_user_id;

    WHEN 'suspend' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'ban' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = p_reason
      WHERE id = v_target_user_id;

    WHEN 'permanent_exile' THEN
      UPDATE profiles
      SET is_banned = true, banned_at = now(), suspension_reason = 'PERMANENT EXILE: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'mute_user' THEN
      UPDATE profiles
      SET suspended_until = v_expires_at, suspension_reason = 'Muted: ' || p_reason
      WHERE id = v_target_user_id;

    WHEN 'delete_content' THEN
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
          p_duration_hours, v_expires_at, v_snapshot);

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
        WHEN 'delete_content' THEN 'After reviewing a report, the house has removed a piece of your content.'
        ELSE 'The house has reviewed a report concerning your account.'
      END || ' Reason: ' || p_reason;

      INSERT INTO notifications (user_id, type, title, body, message, metadata)
      VALUES (
        v_target_user_id,
        'moderation',
        'A Notice from the House',
        v_notice,
        v_notice,
        jsonb_build_object('action', p_action, 'reason', p_reason, 'expires_at', v_expires_at)
      );
    END IF;
  END IF;
END;
$$;
