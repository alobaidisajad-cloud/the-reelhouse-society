-- ════════════════════════════════════════════════════════════════════════════
-- quietest_hour_check.sql — when the house is quietest, for the train (WORKLIST P0.8). Read-only.
-- ════════════════════════════════════════════════════════════════════════════
--   node mobile/supabase/diagnostics/read-only.cjs quietest_hour_check.sql
--
-- Counts only: for each hour of the day (UTC), how many things members did over
-- the last 28 days, from each table's own created_at (logs, Dispatch critiques,
-- comments on logs, salon messages, notices). No member is named, and no row
-- is read beyond its hour.
-- ════════════════════════════════════════════════════════════════════════════
WITH acts AS (
  SELECT created_at FROM public.logs WHERE created_at > now() - interval '28 days'
  UNION ALL SELECT created_at FROM public.dispatch_comments WHERE created_at > now() - interval '28 days'
  UNION ALL SELECT created_at FROM public.log_comments WHERE created_at > now() - interval '28 days'
  UNION ALL SELECT created_at FROM public.lounge_messages WHERE created_at > now() - interval '28 days'
  UNION ALL SELECT created_at FROM public.notifications WHERE created_at > now() - interval '28 days'
)
SELECT h AS hour_utc, coalesce(n, 0) AS acts
  FROM generate_series(0, 23) h
  LEFT JOIN (SELECT extract(hour FROM created_at AT TIME ZONE 'UTC')::int AS h, count(*) AS n FROM acts GROUP BY 1) c USING (h)
 ORDER BY h;
