-- Undo of 20261023_01_a_certification_is_counted_once.sql: production's schema as it was before it.
-- (The certifications it found held twice are not written back: each was a count too many.)
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DROP INDEX IF EXISTS public.interactions_endorse_log_once;
DROP INDEX IF EXISTS public.interactions_endorse_list_once;
