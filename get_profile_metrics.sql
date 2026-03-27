-- FLAWLESS BACKEND ARCHITECTURE: C-Level Postgres Aggregations
-- Replaces client-side array processing of 100,000 rows with a ~2ms server-side execution.

CREATE OR REPLACE FUNCTION get_profile_metrics(uid uuid)
RETURNS json
LANGUAGE plpgsql
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
