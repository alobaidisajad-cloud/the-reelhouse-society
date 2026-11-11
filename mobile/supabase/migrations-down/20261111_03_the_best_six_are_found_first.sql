-- Undo of 20261111_03: no index of a member's ratings of 4 and up.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- add-only (1): no shipped client uses it: an index 20261111_03 makes, read by no client by its name
DROP INDEX CONCURRENTLY IF EXISTS public.idx_logs_user_highest_rated;
