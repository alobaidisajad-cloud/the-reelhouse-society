-- Undo of 20261016_02_a_member_may_always_leave.sql: production's schema as it was before it.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.request_account_deletion() RETURNS void
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
    UPDATE public.lounge_messages
       SET metadata = (metadata - 'owner_username') - 'author_username'
     WHERE metadata->>'owner_username' = v_handle
        OR metadata->>'author_username' = v_handle;
  END IF;

  UPDATE public.list_comments   SET user_id = NULL WHERE user_id = uid;
  UPDATE public.lounge_messages SET user_id = NULL WHERE user_id = uid;

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE owner = uid;

  DELETE FROM auth.users WHERE id = uid;
END
$$;

CREATE FUNCTION public.get_profile_metrics(uid uuid) RETURNS json
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    total_logs int;
    avg_rating numeric;
    decades json;
    autopsy_avg json;
    result json;
BEGIN
    -- 1. Get total logs and global average rating (ignoring 0 ratings)
    SELECT COUNT(*), COALESCE(AVG(NULLIF(rating, 0)), 0)
    INTO total_logs, avg_rating
    FROM logs
    WHERE user_id = uid;

    -- 2. Aggregate Decades (e.g., "1990s": 14, "2000s": 42)
    SELECT json_object_agg(decade, count) INTO decades
    FROM (
        SELECT CONCAT(FLOOR(year / 10) * 10, 's') AS decade, COUNT(*) as count
        FROM logs
        WHERE user_id = uid AND year IS NOT NULL
        GROUP BY FLOOR(year / 10) * 10
        ORDER BY count DESC
    ) AS decade_counts;

    -- 3. Aggregate Autopsy Radar Chart Averages
    SELECT json_build_object(
        'story', COALESCE(AVG((autopsy->>'story')::numeric), 0),
        'cinematography', COALESCE(AVG((autopsy->>'cinematography')::numeric), 0),
        'sound', COALESCE(AVG((autopsy->>'sound')::numeric), 0),
        'pacing', COALESCE(AVG((autopsy->>'pacing')::numeric), 0)
    ) INTO autopsy_avg
    FROM logs
    WHERE user_id = uid AND is_autopsied = true AND autopsy IS NOT NULL;

    -- Construct final JSON response to send over the wire (8KB instead of 5MB)
    result := json_build_object(
        'total_logs', total_logs,
        'avg_rating', avg_rating,
        'decades', COALESCE(decades, '{}'::json),
        'avg_autopsy', autopsy_avg
    );

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_metrics(uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_profile_metrics(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_profile_metrics(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_profile_metrics(uid uuid) TO service_role;

CREATE FUNCTION public.get_user_lounges(p_user_id uuid) RETURNS TABLE(id uuid, name text, description text, is_private boolean, invite_code text, creator_id uuid, created_at timestamp with time zone, member_count integer, is_member boolean, unread_count bigint, last_message_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  WITH
    my_memberships AS (
      SELECT lm.lounge_id, lm.last_read_at
      FROM lounge_members lm WHERE lm.user_id = p_user_id
    ),
    visible_lounges AS (
      SELECT DISTINCT ON (l.id)
        l.id, l.name, l.description, l.is_private, l.invite_code,
        l.creator_id, l.created_at, l.member_count,
        (mm.lounge_id IS NOT NULL OR l.creator_id = p_user_id) AS is_member
      FROM lounges l
      LEFT JOIN my_memberships mm ON mm.lounge_id = l.id
      WHERE TRUE OR mm.lounge_id IS NOT NULL OR l.creator_id = p_user_id
      ORDER BY l.id
    ),
    last_msgs AS (
      SELECT DISTINCT ON (lmsg.lounge_id)
        lmsg.lounge_id, lmsg.created_at AS last_msg_at
      FROM lounge_messages lmsg
      WHERE lmsg.lounge_id IN (SELECT vl.id FROM visible_lounges vl)
      ORDER BY lmsg.lounge_id, lmsg.created_at DESC
    ),
    unread AS (
      SELECT lmsg.lounge_id, COUNT(*) AS cnt
      FROM lounge_messages lmsg
      JOIN my_memberships mm ON mm.lounge_id = lmsg.lounge_id
      WHERE mm.last_read_at IS NULL OR lmsg.created_at > mm.last_read_at
      GROUP BY lmsg.lounge_id
    )
  SELECT vl.id, vl.name, vl.description, vl.is_private, vl.invite_code,
    vl.creator_id, vl.created_at, vl.member_count, vl.is_member,
    COALESCE(u.cnt, 0) AS unread_count, lm.last_msg_at AS last_message_at
  FROM visible_lounges vl
  LEFT JOIN last_msgs lm ON lm.lounge_id = vl.id
  LEFT JOIN unread u ON u.lounge_id = vl.id
  ORDER BY COALESCE(lm.last_msg_at, vl.created_at) DESC
  LIMIT 50;
END;
$$;
CREATE FUNCTION public.replace_list_items(p_list_id uuid, p_items jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Verify ownership (defense-in-depth beyond RLS)
  IF NOT EXISTS (SELECT 1 FROM lists WHERE id = p_list_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: list does not belong to user'
      USING ERRCODE = '42501';
  END IF;

  -- Atomic delete + insert in a single transaction
  DELETE FROM list_items WHERE list_id = p_list_id;

  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO list_items (list_id, film_id, film_title, poster_path, rank_position)
    SELECT
      p_list_id,
      (item->>'film_id')::INT,
      COALESCE(item->>'film_title', 'Unknown'),
      item->>'poster_path',
      (item->>'rank_position')::INT
    FROM jsonb_array_elements(p_items) AS item;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.replace_list_items(p_list_id uuid, p_items jsonb) IS 'Atomically replaces all films in a list (auth.uid()-gated, ownership-checked). Uses rank_position.';

REVOKE ALL ON FUNCTION public.get_user_lounges(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_lounges(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.replace_list_items(p_list_id uuid, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_list_items(p_list_id uuid, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.replace_list_items(p_list_id uuid, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.replace_list_items(p_list_id uuid, p_items jsonb) TO service_role;
