-- Undo of 20261111_04: the faces as they were read before it, every approved member of a salon ranked.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the function as it was before 20261111_04, the same faces read the slow way
CREATE OR REPLACE FUNCTION public.get_salon_member_faces(p_lounge_ids uuid[]) RETURNS TABLE(lounge_id uuid, username text, avatar_url text, rn integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH ranked AS (
    SELECT
      lm.lounge_id, p.username, p.avatar_url,
      row_number() OVER (PARTITION BY lm.lounge_id ORDER BY lm.joined_at ASC, lm.user_id ASC) AS rn
    FROM public.lounge_members lm
    JOIN public.profiles p ON p.id = lm.user_id
    WHERE lm.lounge_id = ANY(p_lounge_ids)
      AND lm.status = 'approved'
      AND p.username IS NOT NULL
      AND NOT public.is_hidden_by(auth.uid(), lm.user_id)
      AND (
        EXISTS (SELECT 1 FROM public.lounge_members me
                WHERE me.lounge_id = lm.lounge_id AND me.user_id = auth.uid() AND me.status = 'approved')
        OR auth.uid() = (SELECT creator_id FROM public.lounges WHERE id = lm.lounge_id)
      )
  )
  SELECT lounge_id, username, avatar_url, rn::integer
  FROM ranked WHERE rn <= 3 ORDER BY lounge_id, rn;
$$;
