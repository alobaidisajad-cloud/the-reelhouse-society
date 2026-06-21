CREATE OR REPLACE FUNCTION public.get_filtered_stacks(
  p_search TEXT DEFAULT '',
  p_following TEXT[] DEFAULT '{}',
  p_limit INT DEFAULT 60,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  user_id UUID,
  is_private BOOLEAN,
  is_ranked BOOLEAN,
  username TEXT,
  films JSONB,
  certify_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH matching_lists AS (
    SELECT l.id
    FROM lists l
    JOIN profiles p ON l.user_id = p.id
    LEFT JOIN list_items li ON l.id = li.list_id
    WHERE l.is_private = false
      AND (
        array_length(p_following, 1) IS NULL
        OR p.username = ANY(p_following)
      )
      AND (
        p_search = ''
        OR l.title ILIKE '%' || p_search || '%'
        OR l.description ILIKE '%' || p_search || '%'
        OR p.username ILIKE '%' || p_search || '%'
        OR li.film_title ILIKE '%' || p_search || '%'
      )
    GROUP BY l.id
  ),
  endorsements AS (
    SELECT target_list_id, COUNT(*) as e_count
    FROM interactions
    WHERE type = 'endorse_list'
      AND target_list_id IN (SELECT ml.id FROM matching_lists ml)
    GROUP BY target_list_id
  )
  SELECT 
    l.id,
    l.title,
    l.description,
    l.created_at,
    l.user_id,
    l.is_private,
    l.is_ranked,
    p.username,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', li2.film_id,
            'title', li2.film_title,
            'poster_path', li2.poster_path
          ) ORDER BY li2.position ASC, li2.created_at ASC
        )
        FROM list_items li2
        WHERE li2.list_id = l.id
      ), 
      '[]'::jsonb
    ) as films,
    COALESCE(e.e_count, 0) as certify_count
  FROM lists l
  JOIN profiles p ON l.user_id = p.id
  JOIN matching_lists ml ON l.id = ml.id
  LEFT JOIN endorsements e ON l.id = e.target_list_id
  ORDER BY l.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
