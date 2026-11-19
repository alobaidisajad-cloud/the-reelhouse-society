-- Undo of 20261120_12: each member's analytics events of the day are counted in one row, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A6's table undone · run after H-A6's rule is undone (it no longer names it) ──
DROP TABLE IF EXISTS public.analytics_budget;
