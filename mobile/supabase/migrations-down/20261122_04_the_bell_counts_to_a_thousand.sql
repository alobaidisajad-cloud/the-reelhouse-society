-- Undo of 20261122_04: the bell counts to a thousand, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- notices_page as 20261119_20 left it: every unread notice counted.
-- add-only (3): it only fixes: the undo puts back the snapshot's definition whole
CREATE OR REPLACE FUNCTION public.notices_page(p_limit integer DEFAULT 30) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC, n.id DESC)
        FROM (SELECT id, user_id, type, from_username, from_user_id, message, is_read, created_at, film_id,
                     poster_path, group_key, title, related_lounge_id, metadata
                FROM public.notifications
               WHERE user_id = (SELECT auth.uid())
               ORDER BY created_at DESC, id DESC
               LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)) n), '[]'::jsonb),
    'unread', (SELECT count(*) FROM public.notifications
                WHERE user_id = (SELECT auth.uid()) AND is_read = false));
$$;
