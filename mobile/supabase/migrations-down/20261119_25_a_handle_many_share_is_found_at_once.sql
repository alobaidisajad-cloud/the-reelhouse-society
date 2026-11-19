-- Undo of 20261119_25: search_members reads as 20261118_01 made it, every match sorted for the page.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (1): no shipped client uses it as it was changed: search_members as round 12 made it, asked by no TestFlight build 41 or website
CREATE OR REPLACE FUNCTION public.search_members(p_pattern text, p_handles_only boolean DEFAULT false, p_cursor_closeness integer DEFAULT NULL::integer, p_cursor_username text DEFAULT NULL::text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, username text, avatar_url text, role text, closeness integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT m.id, m.username, m.avatar_url, m.role, m.closeness
    FROM (
      SELECT p.id, p.username, p.avatar_url, p.role,
             CASE WHEN p.username ILIKE p_pattern ESCAPE '\' THEN 0
                  WHEN p.username ILIKE p_pattern || '%' ESCAPE '\' THEN 1
                  WHEN NOT COALESCE(p_handles_only, false) AND p.display_name ILIKE p_pattern || '%' ESCAPE '\' THEN 2
                  ELSE 3 END AS closeness
        FROM public.profiles p
       WHERE COALESCE(p_pattern, '') <> ''
         AND (p.username ILIKE '%' || p_pattern || '%' ESCAPE '\'
              OR (NOT COALESCE(p_handles_only, false) AND p.display_name ILIKE '%' || p_pattern || '%' ESCAPE '\'))
         AND NOT COALESCE(p.id = ANY ((SELECT public.hidden_authors())::uuid[]), false)
    ) m
   WHERE p_cursor_closeness IS NULL OR (m.closeness, m.username) > (p_cursor_closeness, p_cursor_username)
   ORDER BY m.closeness, m.username
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 51);
$$;
