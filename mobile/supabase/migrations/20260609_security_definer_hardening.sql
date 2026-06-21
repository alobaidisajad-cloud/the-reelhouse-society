-- P0 FIX: Hardening SECURITY DEFINER functions to prevent RLS bypass
-- 1. create_lounge_with_member: Use auth.uid() instead of p_creator_id
-- 2. replace_list_items: Use auth.uid() instead of p_user_id
-- 3. get_user_lounges: Use auth.uid() instead of p_user_id
-- 4. get_public_profile_analytics: Ensure caller is authenticated

-- 1. create_lounge_with_member
DROP FUNCTION IF EXISTS create_lounge_with_member(text, text, boolean, text, uuid);

CREATE OR REPLACE FUNCTION create_lounge_with_member(
  p_name text,
  p_description text,
  p_is_private boolean,
  p_invite_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lounge_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Insert the lounge
  INSERT INTO public.lounges (name, description, is_private, invite_code, creator_id, member_count)
  VALUES (p_name, p_description, p_is_private, p_invite_code, v_user_id, 0)
  RETURNING id INTO v_lounge_id;

  -- Insert the member
  INSERT INTO public.lounge_members (lounge_id, user_id)
  VALUES (v_lounge_id, v_user_id);

  RETURN v_lounge_id;
END;
$$;

-- 2. replace_list_items
DROP FUNCTION IF EXISTS replace_list_items(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION replace_list_items(
  p_list_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB
) RETURNS VOID AS $$
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
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Atomic delete + insert in a single transaction
  DELETE FROM list_items WHERE list_id = p_list_id;
  
  -- Only insert if there are items to add
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO list_items (list_id, film_id, film_title, poster_path, position)
    SELECT
      p_list_id,
      (item->>'film_id')::INT,
      COALESCE(item->>'film_title', 'Unknown'),
      item->>'poster_path',
      (item->>'position')::INT
    FROM jsonb_array_elements(p_items) AS item;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION replace_list_items(UUID, JSONB) TO authenticated;

-- 3. get_user_lounges
DROP FUNCTION IF EXISTS get_user_lounges(uuid);

CREATE OR REPLACE FUNCTION get_user_lounges()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_private boolean,
  invite_code text,
  creator_id uuid,
  created_at timestamptz,
  member_count int,
  is_member boolean,
  unread_count bigint,
  last_message_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH
    -- 1. Get this user's memberships
    my_memberships AS (
      SELECT lm.lounge_id, lm.last_read_at
      FROM lounge_members lm
      WHERE lm.user_id = v_user_id
    ),

    -- 2. Merge all visible lounges: browsable + joined + created (deduped)
    visible_lounges AS (
      SELECT DISTINCT ON (l.id)
        l.id,
        l.name,
        l.description,
        l.is_private,
        l.invite_code,
        l.creator_id,
        l.created_at,
        l.member_count,
        (mm.lounge_id IS NOT NULL OR l.creator_id = v_user_id) AS is_member
      FROM lounges l
      LEFT JOIN my_memberships mm ON mm.lounge_id = l.id
      WHERE
        -- Browsable: public lounges only
        l.is_private = false
        -- OR user is a member
        OR mm.lounge_id IS NOT NULL
        -- OR user created it
        OR l.creator_id = v_user_id
      ORDER BY l.id
    ),

    -- 3. Last message timestamp per lounge (single scan)
    last_msgs AS (
      SELECT DISTINCT ON (lmsg.lounge_id)
        lmsg.lounge_id,
        lmsg.created_at AS last_msg_at
      FROM lounge_messages lmsg
      WHERE lmsg.lounge_id IN (SELECT vl.id FROM visible_lounges vl)
      ORDER BY lmsg.lounge_id, lmsg.created_at DESC
    ),

    -- 4. Unread count per lounge (messages after user's last_read_at)
    unread AS (
      SELECT
        lmsg.lounge_id,
        COUNT(*) AS cnt
      FROM lounge_messages lmsg
      JOIN my_memberships mm ON mm.lounge_id = lmsg.lounge_id
      WHERE mm.last_read_at IS NULL OR lmsg.created_at > mm.last_read_at
      GROUP BY lmsg.lounge_id
    )

  -- 5. Join everything and sort by activity
  SELECT
    vl.id,
    vl.name,
    vl.description,
    vl.is_private,
    vl.invite_code,
    vl.creator_id,
    vl.created_at,
    vl.member_count,
    vl.is_member,
    COALESCE(u.cnt, 0) AS unread_count,
    lm.last_msg_at AS last_message_at
  FROM visible_lounges vl
  LEFT JOIN last_msgs lm ON lm.lounge_id = vl.id
  LEFT JOIN unread u ON u.lounge_id = vl.id
  ORDER BY COALESCE(lm.last_msg_at, vl.created_at) DESC
  LIMIT 50;
END;
$$;
GRANT EXECUTE ON FUNCTION get_user_lounges() TO authenticated;

-- 4. get_public_profile_analytics
CREATE OR REPLACE FUNCTION public.get_public_profile_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
SELECT CASE 
    WHEN auth.uid() IS NULL THEN 
        -- Must be authenticated to view any profile analytics
        CAST('{"error": "Not authenticated"}' AS jsonb)
    ELSE (
        WITH user_logs AS (
            SELECT * FROM public.logs WHERE user_id = p_user_id
        ),
        stamps AS (
            SELECT
                COUNT(*) AS total_logs,
                COUNT(*) FILTER (WHERE year < 1960) AS pre_1960_count,
                COUNT(*) FILTER (WHERE rating = 5) AS perfect_ratings_count,
                bool_or(physical_media IS NOT NULL) AS has_physical_media,
                bool_or(status = 'abandoned') AS has_abandoned,
                COUNT(DISTINCT (year / 10) * 10) FILTER (WHERE year IS NOT NULL) AS decades_logged_count,
                EXISTS(SELECT 1 FROM user_logs GROUP BY film_id HAVING COUNT(*) > 1) AS has_rewatched
            FROM user_logs
        ),
        decades AS (
            SELECT (year / 10) * 10 AS decade, COUNT(*) AS c
            FROM user_logs
            WHERE year IS NOT NULL
            GROUP BY decade
            ORDER BY c DESC
            LIMIT 3
        ),
        dna AS (
            SELECT 
                AVG(rating) FILTER (WHERE rating > 0) AS avg_rating,
                (SELECT jsonb_agg(jsonb_build_object(d.decade::text || 's', d.c)) FROM decades d) AS top_decades
            FROM user_logs
        ),
        autopsies AS (
            SELECT 
                AVG(COALESCE((autopsy::jsonb)->>'story', (autopsy::jsonb)->>'screenplay', (autopsy::jsonb)->>'script')::numeric) AS avg_story,
                AVG(COALESCE((autopsy::jsonb)->>'cinematography', (autopsy::jsonb)->>'visuals', (autopsy::jsonb)->>'acting')::numeric) AS avg_cinematography,
                AVG(COALESCE((autopsy::jsonb)->>'sound', (autopsy::jsonb)->>'score', (autopsy::jsonb)->>'editing')::numeric) AS avg_sound
            FROM user_logs
            WHERE is_autopsied = true AND autopsy IS NOT NULL
        )
        SELECT jsonb_build_object(
            'stamps', (SELECT to_jsonb(s.*) FROM stamps s),
            'dna', (SELECT to_jsonb(d.*) FROM dna d),
            'autopsy_math', (SELECT to_jsonb(a.*) FROM autopsies a)
        )
    )
END;
$$;
