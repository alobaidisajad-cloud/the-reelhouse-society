-- ════════════════════════════════════════════════════════════════════════════
-- 20261002_04 — Taste Match reads both members' whole records.
-- ════════════════════════════════════════════════════════════════════════════
-- TASTE COMPATIBILITY compared the logs each phone happened to hold: the
-- viewer's loaded page and, for most members, the first page of the other's.
-- Two members with thousands of films each were matched on a hundred.
--
-- get_taste_match(p_user_id) returns, for the viewer and for that member, the
-- shape the comparison needs over the whole record:
--   logs      how many logs
--   ratings   how many films rated each whole reel, 1..5 (a half rounds up,
--             as the app always counted: 3½ → 4)
--   decades   how many films from each decade
-- Who may read the other member's shape is can_view_user_data, as everywhere
-- else on their file; the viewer always reads their own.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.taste_shape(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

-- Read only through get_taste_match, which asks who may.
REVOKE ALL ON FUNCTION public.taste_shape(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_taste_match(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR NOT public.can_view_user_data(p_user_id)
      THEN '{"error": "forbidden"}'::jsonb
    ELSE jsonb_build_object('mine', public.taste_shape(auth.uid()), 'theirs', public.taste_shape(p_user_id))
  END;
$$;

REVOKE ALL ON FUNCTION public.get_taste_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_taste_match(uuid) TO authenticated;
