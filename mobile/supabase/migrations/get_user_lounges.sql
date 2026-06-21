-- ══════════════════════════════════════════════════════════════
-- get_user_lounges(p_user_id uuid)
-- ══════════════════════════════════════════════════════════════
-- Replaces 5 client-side queries with a single server-side RPC.
-- Returns all lounges visible to the user (browsable + joined + created)
-- enriched with unread_count and last_message_at.
--
-- DEPLOY: Paste this into your Supabase SQL Editor and click Run.
-- ROLLBACK: DROP FUNCTION IF EXISTS get_user_lounges(uuid);
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_lounges(p_user_id uuid)
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
BEGIN
  RETURN QUERY
  WITH
    -- 1. Get this user's memberships
    my_memberships AS (
      SELECT lm.lounge_id, lm.last_read_at
      FROM lounge_members lm
      WHERE lm.user_id = p_user_id
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
        (mm.lounge_id IS NOT NULL OR l.creator_id = p_user_id) AS is_member
      FROM lounges l
      LEFT JOIN my_memberships mm ON mm.lounge_id = l.id
      WHERE
        -- Browsable: public lounges only
        l.is_private = false
        -- OR user is a member
        OR mm.lounge_id IS NOT NULL
        -- OR user created it
        OR l.creator_id = p_user_id
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

-- Grant execute to authenticated users (required for Supabase RLS)
GRANT EXECUTE ON FUNCTION get_user_lounges(uuid) TO authenticated;
