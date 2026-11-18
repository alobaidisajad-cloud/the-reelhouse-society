-- Undo of 20261119_04: its index is dropped, CONCURRENTLY, alone, as it was built.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

-- Undo of H-C5 (index): the index of the films to read again is dropped, CONCURRENTLY, alone, as it was built.
-- add-only (1): no shipped client uses it: an index this piece makes, read by claim_films_to_sync alone
DROP INDEX CONCURRENTLY IF EXISTS public.idx_films_reread;
