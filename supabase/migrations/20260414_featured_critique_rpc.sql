-- Migration: Add Featured Critique RPC
-- Description: Scans all logs from the past 24 hours, aggregates interactions natively, and returns the top #1 Pick of the Week.

CREATE OR REPLACE FUNCTION get_featured_critique()
RETURNS SETOF logs
LANGUAGE sql STABLE
AS $$
  WITH recent_logs AS (
    SELECT l.*
    FROM logs l
    WHERE l.review IS NOT NULL 
      AND l.review != '' 
      AND l.rating > 0
      AND l.created_at >= NOW() - INTERVAL '24 hours'
  ),
  ranked AS (
    SELECT 
      l.*,
      (SELECT COUNT(*) FROM interactions WHERE target_log_id = l.id AND type = 'endorse_log') +
      (SELECT COUNT(*) FROM log_comments WHERE log_id = l.id) AS engagement
    FROM recent_logs l
    ORDER BY engagement DESC, l.created_at DESC
    LIMIT 1
  ),
  fallback AS (
    -- Failsafe for entirely quiet periods (no logs in 24h)
    SELECT l.*, 0 AS engagement
    FROM logs l
    WHERE l.review IS NOT NULL 
      AND l.review != ''
    ORDER BY l.created_at DESC
    LIMIT 1
  )
  SELECT r.id, r.film_id, r.film_title, r.poster_path, r.rating, r.review, r.status, r.watched_with, r.pull_quote, r.drop_cap, r.editorial_header, r.is_autopsied, r.autopsy, r.created_at, r.updated_at, r.user_id 
  FROM ranked r
  UNION ALL
  SELECT f.id, f.film_id, f.film_title, f.poster_path, f.rating, f.review, f.status, f.watched_with, f.pull_quote, f.drop_cap, f.editorial_header, f.is_autopsied, f.autopsy, f.created_at, f.updated_at, f.user_id 
  FROM fallback f
  WHERE NOT EXISTS (SELECT 1 FROM ranked)
  LIMIT 1;
$$;
