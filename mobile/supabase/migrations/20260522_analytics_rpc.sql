-- T4-2: Server-side analytics aggregation RPC
-- ─────────────────────────────────────────────────────────────────────────
-- Replaces client-side computation that downloads ALL log rows (~2.5MB for
-- power users) with a single ~2KB JSON response.
--
-- Deploy: supabase db push (or paste into Supabase SQL Editor)
-- Falls back gracefully: ProfileDataService.fetchAnalyticsSummary() already
-- handles the case where this RPC doesn't exist.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_analytics(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Strict row-level authorization check
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot access analytics for another user'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  SELECT json_build_object(
    -- Total log count
    'total_logs', (
      SELECT COUNT(*) FROM logs WHERE user_id = p_user_id
    ),

    -- Average rating (exclude 0-rated entries)
    'avg_rating', (
      SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
      FROM logs WHERE user_id = p_user_id AND rating > 0
    ),

    -- Rating distribution (1-5 stars)
    'rating_distribution', (
      SELECT COALESCE(json_agg(row_to_json(rd)), '[]'::json)
      FROM (
        SELECT rating, COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id AND rating > 0
        GROUP BY rating
        ORDER BY rating
      ) rd
    ),

    -- Monthly activity (last 12 months)
    'monthly_activity', (
      SELECT COALESCE(json_agg(row_to_json(ma)), '[]'::json)
      FROM (
        SELECT TO_CHAR(
          COALESCE(watched_date::date, created_at::date), 'YYYY-MM'
        ) as month,
        COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id
          AND COALESCE(watched_date::date, created_at::date) >= NOW() - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month
      ) ma
    ),

    -- Current daily streak
    'current_streak', (
      WITH dates AS (
        SELECT DISTINCT COALESCE(watched_date::date, created_at::date) as log_date
        FROM logs WHERE user_id = p_user_id
      ),
      streak AS (
        SELECT log_date,
               log_date - (ROW_NUMBER() OVER (ORDER BY log_date DESC))::int AS grp
        FROM dates
        WHERE log_date >= CURRENT_DATE - 365
      )
      SELECT COALESCE(MAX(cnt), 0)
      FROM (
        SELECT grp, COUNT(*) as cnt
        FROM streak
        WHERE grp = (SELECT grp FROM streak WHERE log_date >= CURRENT_DATE - 1 LIMIT 1)
        GROUP BY grp
      ) s
    ),

    -- Longest ever streak
    'longest_streak', (
      WITH dates AS (
        SELECT DISTINCT COALESCE(watched_date::date, created_at::date) as log_date
        FROM logs WHERE user_id = p_user_id
      ),
      streak AS (
        SELECT log_date,
               log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int AS grp
        FROM dates
      )
      SELECT COALESCE(MAX(cnt), 0)
      FROM (
        SELECT COUNT(*) as cnt FROM streak GROUP BY grp
      ) s
    ),

    -- Format breakdown (physical media)
    'format_breakdown', (
      SELECT COALESCE(json_agg(row_to_json(fb)), '[]'::json)
      FROM (
        SELECT format, COUNT(*) as count
        FROM logs
        WHERE user_id = p_user_id AND format IS NOT NULL AND format != ''
        GROUP BY format
        ORDER BY count DESC
      ) fb
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION get_user_analytics(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Optional: Create index to speed up the above queries
-- Only needed if you notice slow analytics loads (check logs for
-- "[ProfileDataService] analytics_fetch: X rows in Yms" with Y > 2000)
-- ─────────────────────────────────────────────────────────────────────────
-- CREATE INDEX IF NOT EXISTS idx_logs_user_watched_date
--   ON logs (user_id, watched_date DESC NULLS LAST, id DESC);
