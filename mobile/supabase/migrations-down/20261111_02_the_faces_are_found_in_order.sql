-- Undo of 20261111_02: no index of a salon's members in the order they joined. Undo 20261111_04 first:
-- its faces are read through this index, and without it rank every member again.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- add-only (1): no shipped client uses it: an index 20261111_02 makes, read by no client by its name
DROP INDEX CONCURRENTLY IF EXISTS public.idx_lounge_members_faces;
