-- Undo of 20261023_01_a_certification_of_a_log_is_counted_once.sql: production's schema as it was before it.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

DROP INDEX CONCURRENTLY IF EXISTS public.interactions_endorse_log_once;
