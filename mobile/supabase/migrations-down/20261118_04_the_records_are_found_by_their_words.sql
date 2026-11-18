-- Undo of 20261118_04: the records' trigram index is dropped, CONCURRENTLY, alone, as it was built;
-- search_logs (20261118_01) then reads a rare word by walking every reviewed record, the same rows,
-- slower.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

DROP INDEX CONCURRENTLY IF EXISTS public.logs_reviewed_words;
